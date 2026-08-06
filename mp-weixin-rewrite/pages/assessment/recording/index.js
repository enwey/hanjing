const api = require('../../../api/index');

const RELATION_LABEL_MAP = {
  self: '本人',
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  sibling: '兄弟姐妹',
  other: '其他',
};

const recorderManager = wx.getRecorderManager();
const INITIAL_STATUS_TEXT = '点击麦克风开启睡眠监测';

function getRecorderErrorMessage(error) {
  const errMsg = String((error && error.errMsg) || error || '').toLowerCase();
  if (/auth|permission|denied|authorize/.test(errMsg)) {
    return '麦克风权限异常，请在系统设置中开启录音权限';
  }
  if (/space|storage|quota|disk|insufficient|no enough/.test(errMsg)) {
    return '设备存储空间不足，清理空间后再开始录音';
  }
  if (/interrupt|abort|background|system/.test(errMsg)) {
    return '录音被系统中断，请保持小程序在前台后重试';
  }
  return '录音发生异常，请重新开始';
}

function safeSetStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (error) {
    console.error('Set storage failed', key, error);
    return false;
  }
}

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function toPcmInt16Array(arrayBuffer) {
  const validByteLength = arrayBuffer.byteLength - (arrayBuffer.byteLength % 2);
  if (validByteLength <= 0) return new Int16Array(0);
  return new Int16Array(validByteLength === arrayBuffer.byteLength ? arrayBuffer : arrayBuffer.slice(0, validByteLength));
}

function analyzePcmOnClient(pcmData, durationSeconds) {
  const lowCut = 80;
  const highCut = 800;
  const sampleRate = 8000;
  const rcLow = 1 / (2 * Math.PI * lowCut);
  const rcHigh = 1 / (2 * Math.PI * highCut);
  const dt = 1 / sampleRate;
  const alphaLow = dt / (rcLow + dt);
  const alphaHigh = rcHigh / (rcHigh + dt);
  let lastLowVal = 0;
  let lastHighVal = 0;
  const frameSamples = 16000;
  const totalSamples = pcmData.length;
  const frameDuration = 2;
  let totalDurationSeconds = 0;
  let averageDecibelSum = 0;
  let decibelSamplesCount = 0;
  let peakDecibel = 30;
  let tempSnoreEventStreak = 0;
  let lastSnoreTime = 0;
  let snoreCount = 0;
  let snoreDurationSeconds = 0;
  let silenceSeconds = 0;
  let inApneaState = false;
  let apneaEventsCount = 0;
  for (let offset = 0; offset < totalSamples; offset += frameSamples) {
    const end = Math.min(totalSamples, offset + frameSamples);
    const size = end - offset;
    if (size < 4000) continue;
    let sumAbsolute = 0;
    for (let index = offset; index < end; index += 1) {
      const rawSample = pcmData[index] / 32768;
      lastLowVal += alphaLow * (rawSample - lastLowVal);
      const filteredSample = alphaHigh * (lastLowVal - lastHighVal);
      lastHighVal = lastLowVal;
      sumAbsolute += Math.abs(filteredSample);
    }
    const avgEnergy = sumAbsolute / size;
    const frameDecibel = Math.min(95, Math.max(30, Math.round(30 + avgEnergy * 85)));
    totalDurationSeconds += frameDuration;
    averageDecibelSum += frameDecibel;
    decibelSamplesCount += 1;
    peakDecibel = Math.max(peakDecibel, frameDecibel);

    if (frameDecibel >= 42) {
      const timeSinceLastSnore = totalDurationSeconds - lastSnoreTime;
      if (timeSinceLastSnore >= 2 && timeSinceLastSnore <= 6) {
        tempSnoreEventStreak += 1;
        if (tempSnoreEventStreak >= 3) {
          snoreCount += 1;
          snoreDurationSeconds += frameDuration;
        }
      } else if (timeSinceLastSnore > 6) {
        tempSnoreEventStreak = 1;
      }
      lastSnoreTime = totalDurationSeconds;
    }

    if (frameDecibel < 35) {
      silenceSeconds += frameDuration;
      if (silenceSeconds >= 10 && !inApneaState) inApneaState = true;
    } else {
      if (inApneaState && frameDecibel >= 60) apneaEventsCount += 1;
      inApneaState = false;
      silenceSeconds = 0;
    }
  }
  const snoreRate = Math.min(95, Math.max(0, Math.round((snoreDurationSeconds / Math.max(1, totalDurationSeconds)) * 100)));
  const avgDecibel = decibelSamplesCount > 0 ? Math.round(averageDecibelSum / decibelSamplesCount) : 35;
  const apneaEvents = apneaEventsCount;
  const hours = Math.max(0.1, durationSeconds / 3600);
  const ahi = apneaEvents / hours;
  let riskLevel = 'normal';
  if (ahi < 5) riskLevel = 'normal';
  else if (ahi < 15) riskLevel = 'mild';
  else if (ahi < 30) riskLevel = 'moderate';
  else riskLevel = 'severe';
  return { avgDecibel, peakDecibel, snoreRate, apneaEvents, riskLevel };
}

Page({
  data: {
    isRecording: false,
    hasRecordingEnded: false,
    isSubmitting: false,
    isAnalyzing: false,
    recordingDurationSeconds: 0,
    memberList: [],
    memberNames: [],
    memberIndex: 0,
    selectedMemberName: '本人',
    selectedMemberId: '',
    initialPatientId: '',
    disabledSelector: false,
    audioLevels: new Array(16).fill(6),
    durationText: '00:00',
    statusText: INITIAL_STATUS_TEXT,
    tempFilePath: '',
  },

  onLoad(options) {
    this.setData({ initialPatientId: options && options.patientId ? String(options.patientId) : '' });
    this.bindRecorderEvents();
  },

  async onShow() {
    await this.loadFamilyMembers();
  },

  onHide() {
    this.restoreScreenBrightness();
  },

  onUnload() {
    this.clearTimers();
    this.restoreScreenBrightness();
  },

  bindRecorderEvents() {
    recorderManager.onStop((result) => {
      if (this.ignoreNextStop) {
        this.ignoreNextStop = false;
        return;
      }
      this.setData({ tempFilePath: result.tempFilePath || '' });
      this.clearTimers();
      this.submitRecording();
    });
    recorderManager.onError((error) => {
      this.handleRecorderError(error);
    });
    recorderManager.onFrameRecorded((result) => {
      try {
        const pcm = toPcmInt16Array(result.frameBuffer);
        if (!pcm.length) return;
        let sum = 0;
        for (let index = 0; index < pcm.length; index += 1) {
          sum += Math.abs(pcm[index]);
        }
        const avgAbs = sum / pcm.length;
        const scale = Math.min(1, Math.max(0, (avgAbs - 80) / 1800));
        const nextLevels = [];
        for (let index = 0; index < 16; index += 1) {
          const noise = 0.85 + Math.random() * 0.3;
          const factor = [0.15, 0.25, 0.4, 0.6, 0.8, 0.95, 1, 1, 1, 1, 0.95, 0.8, 0.6, 0.4, 0.25, 0.15][index];
          nextLevels.push(Math.min(38, Math.max(6, 6 + Math.floor(32 * scale * factor * noise))));
        }
        this.setData({ audioLevels: nextLevels });
      } catch (error) {
        console.error('Frame volume calc error', error);
      }
    });
  },

  handleRecorderError(error) {
    console.error('Recorder error', error);
    this.ignoreNextStop = true;
    this.clearTimers();
    this.restoreScreenBrightness();
    this.setData({
      isRecording: false,
      hasRecordingEnded: false,
      isSubmitting: false,
      isAnalyzing: false,
      recordingDurationSeconds: 0,
      durationText: '00:00',
      statusText: INITIAL_STATUS_TEXT,
      audioLevels: new Array(16).fill(6),
      tempFilePath: '',
      disabledSelector: false,
    });
    wx.showModal({
      title: '录音失败',
      content: getRecorderErrorMessage(error),
      showCancel: false,
      confirmText: '知道了',
    });
  },

  enqueuePendingSnoreRecording(payload) {
    const pending = wx.getStorageSync('pending_snore_uploads') || [];
    const nextPending = Array.isArray(pending) ? pending : [];
    nextPending.push(Object.assign({ localId: 'snore_' + Date.now() }, payload));
    return safeSetStorage('pending_snore_uploads', nextPending);
  },

  async loadFamilyMembers() {
    try {
      const response = await api.getFamilyMembers();
      const memberList = unwrapList(response);
      const memberNames = memberList.map((member) => `${member.name}（${RELATION_LABEL_MAP[member.relation] || member.relation || '成员'}）`);
      const initialPatientId = this.data.initialPatientId;
      const initialIndex = initialPatientId ? memberList.findIndex((member) => String(member.id || '') === initialPatientId) : -1;
      const selfIndex = memberList.findIndex((member) => member.relation === 'self');
      const memberIndex = initialIndex >= 0 ? initialIndex : (selfIndex >= 0 ? selfIndex : 0);
      const selectedMember = memberList[memberIndex] || null;
      this.setData({
        memberList,
        memberNames,
        memberIndex,
        selectedMemberName: selectedMember ? selectedMember.name || '本人' : '本人',
        selectedMemberId: selectedMember ? String(selectedMember.id || '') : '',
      });
    } catch (error) {
      console.error(error);
    }
  },

  onMemberChange(event) {
    const memberIndex = Number(event.detail.value || 0);
    const selectedMember = this.data.memberList[memberIndex];
    if (!selectedMember) return;
    this.setData({
      memberIndex,
      selectedMemberName: selectedMember.name || '本人',
      selectedMemberId: String(selectedMember.id || ''),
    });
  },

  updateDurationText() {
    const minutes = Math.floor(this.data.recordingDurationSeconds / 60);
    const seconds = this.data.recordingDurationSeconds % 60;
    this.setData({ durationText: String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0') });
  },

  async rememberCurrentScreenBrightness() {
    if (typeof this.originalScreenBrightness === 'number') return this.originalScreenBrightness;
    return new Promise((resolve) => {
      wx.getScreenBrightness({
        success: (result) => {
          this.originalScreenBrightness = typeof result.value === 'number' ? result.value : 1;
          resolve(this.originalScreenBrightness);
        },
        fail: () => resolve(null),
      });
    });
  },

  async dimScreenForRecording() {
    if (this.hasDimmedScreen) return;
    await this.rememberCurrentScreenBrightness();
    wx.setScreenBrightness({
      value: 0.01,
      success: () => {
        this.hasDimmedScreen = true;
      },
    });
  },

  restoreScreenBrightness() {
    if (!this.hasDimmedScreen) return;
    wx.setScreenBrightness({
      value: typeof this.originalScreenBrightness === 'number' ? this.originalScreenBrightness : 1,
      complete: () => {
        this.hasDimmedScreen = false;
        this.originalScreenBrightness = null;
      },
    });
  },

  clearTimers() {
    if (this.durationTimer) clearInterval(this.durationTimer);
    if (this.simulationTimer) clearInterval(this.simulationTimer);
    this.durationTimer = null;
    this.simulationTimer = null;
  },

  async startRecording() {
    wx.authorize({
      scope: 'scope.record',
      success: async () => {
        this.ignoreNextStop = false;
        await this.dimScreenForRecording();
        this.clearTimers();
        this.setData({
          isRecording: true,
          hasRecordingEnded: false,
          isSubmitting: false,
          isAnalyzing: false,
          recordingDurationSeconds: 0,
          durationText: '00:00',
          statusText: '正在监测睡眠声音...',
          audioLevels: new Array(16).fill(6),
          disabledSelector: true,
        });
        this.durationTimer = setInterval(() => {
          this.setData({ recordingDurationSeconds: this.data.recordingDurationSeconds + 1 });
          this.updateDurationText();
        }, 1000);
        this.simulationTimer = setInterval(() => {
          const nextLevels = new Array(16).fill(0).map(() => Math.min(38, Math.max(6, 6 + Math.floor(Math.random() * 28))));
          this.setData({ audioLevels: nextLevels });
        }, 180);
        recorderManager.start({
          duration: 600000,
          sampleRate: 8000,
          numberOfChannels: 1,
          format: 'pcm',
          frameSize: 2,
        });
      },
      fail: () => {
        wx.showModal({
          title: '授权提示',
          content: '我们需使用麦克风来分析您的鼾声，请在系统设置中开启麦克风录音权限。',
          confirmText: '去设置',
          success: (result) => {
            if (result.confirm) wx.openSetting();
          },
        });
      },
    });
  },

  pauseRecording() {
    this.clearTimers();
    recorderManager.pause();
    this.restoreScreenBrightness();
    this.setData({
      isRecording: false,
      hasRecordingEnded: true,
      isSubmitting: true,
      statusText: '录音已暂停，可生成分析报告',
      audioLevels: new Array(16).fill(6),
      disabledSelector: true,
    });
  },

  resumeRecording() {
    this.dimScreenForRecording();
    this.setData({
      isRecording: true,
      hasRecordingEnded: false,
      isSubmitting: false,
      statusText: '正在监测睡眠声音...',
    });
    this.durationTimer = setInterval(() => {
      this.setData({ recordingDurationSeconds: this.data.recordingDurationSeconds + 1 });
      this.updateDurationText();
    }, 1000);
    recorderManager.resume();
  },

  stopAndAnalyze() {
    if (this.data.recordingDurationSeconds < 5) {
      wx.showToast({ title: '录音时间过短，分析前请至少录制5秒', icon: 'none' });
      return;
    }
    this.setData({ isAnalyzing: true, statusText: '正在分析...', disabledSelector: true });
    this.ignoreNextStop = false;
    recorderManager.stop();
    this.restoreScreenBrightness();
  },

  onMicTap() {
    if (this.data.isRecording) {
      this.pauseRecording();
    } else if (this.data.hasRecordingEnded) {
      this.resumeRecording();
    } else {
      this.startRecording();
    }
  },

  async submitRecording() {
    if (this.data.recordingDurationSeconds < 5) {
      wx.showToast({ title: '录音时间过短，分析前请至少录制5秒', icon: 'none' });
      return;
    }
    try {
      const fileBuffer = wx.getFileSystemManager().readFileSync(this.data.tempFilePath);
      const analysisResult = analyzePcmOnClient(toPcmInt16Array(fileBuffer), this.data.recordingDurationSeconds);
      const localReport = {
        id: 'local',
        patientId: this.data.selectedMemberId,
        type: 'ai_snore',
        snoreAnalysis: Object.assign({ duration: this.data.recordingDurationSeconds, qualityScore: 85 }, analysisResult),
        createdAt: new Date().toISOString(),
      };
      safeSetStorage('last_local_snore_result', localReport);
      const submitPayload = {
        duration: this.data.recordingDurationSeconds,
        client_side_analysis: true,
        analysis_result: analysisResult,
        timestamp: Date.now(),
        patientId: this.data.selectedMemberId,
      };
      try {
        const submitResponse = await api.submitSnoreRecording(submitPayload);
        const createdRecord = (submitResponse && submitResponse.data) || submitResponse || {};
        wx.redirectTo({ url: '/pages/assessment/snore-result/index?id=' + (createdRecord.id || 'local') });
      } catch (error) {
        this.enqueuePendingSnoreRecording(submitPayload);
        wx.redirectTo({ url: '/pages/assessment/snore-result/index?id=local' });
      }
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '分析失败，请重试', icon: 'none' });
      this.setData({ isAnalyzing: false, isSubmitting: false, disabledSelector: false, statusText: INITIAL_STATUS_TEXT });
    }
  },

  handleBack() {
    this.restoreScreenBrightness();
    wx.navigateBack({ delta: 1 });
  },
});
