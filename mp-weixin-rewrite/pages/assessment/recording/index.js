const api = require('../../../api/index');
const sessionStore = require('../../../stores/session-store');

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

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calculateFrameDecibel(rms) {
  const normalized = clampNumber(rms / 32768, 0, 1);
  return Math.round(clampNumber(30 + Math.log10(1 + normalized * 9) * 50, 30, 95));
}

function calculateRiskScore(avgDecibel, peakDecibel, snoreRate, apneaEvents, durationSeconds) {
  const apneaHourly = apneaEvents / Math.max(durationSeconds / 3600, 0.1);
  const avgScore = clampNumber((avgDecibel - 38) * 1.4, 0, 26);
  const peakScore = clampNumber((peakDecibel - 55) * 0.8, 0, 18);
  const rateScore = clampNumber(snoreRate * 0.4, 0, 38);
  const apneaScore = clampNumber(apneaHourly * 1.4, 0, 18);
  return Math.round(clampNumber(avgScore + peakScore + rateScore + apneaScore, 0, 100));
}

function calculateStdDev(values, average) {
  if (!values.length) return 0;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calculateGoertzelPower(pcmData, start, end, sampleRate, frequency) {
  // Keep all samples: the frequency grid uses the original sample rate,
  // including noise frequencies above the Nyquist limit of a halved rate.
  const step = 1;
  const sampleCount = Math.max(1, Math.floor((end - start) / step));
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let previous2 = 0;

  for (let index = start; index < end; index += step) {
    const normalizedSample = pcmData[index] / 32768;
    const current = normalizedSample + coefficient * previous - previous2;
    previous2 = previous;
    previous = current;
  }

  return Math.max(0, previous2 * previous2 + previous * previous - coefficient * previous * previous2) / sampleCount;
}

function calculateBandProfile(pcmData, start, end, sampleRate) {
  const snoreFrequencies = [80, 100, 125, 160, 200, 250, 315, 400, 500, 630];
  const noiseFrequencies = [750, 900, 1000, 1200, 1400, 1600, 1800, 2200, 2600, 3000];
  let snoreBandEnergy = 0;
  let noiseBandEnergy = 0;
  let dominantFrequency = 0;
  let dominantEnergy = 0;

  for (let index = 0; index < snoreFrequencies.length; index += 1) {
    const frequency = snoreFrequencies[index];
    const energy = calculateGoertzelPower(pcmData, start, end, sampleRate, frequency);
    snoreBandEnergy += energy;
    if (energy > dominantEnergy) {
      dominantEnergy = energy;
      dominantFrequency = frequency;
    }
  }

  for (let index = 0; index < noiseFrequencies.length; index += 1) {
    noiseBandEnergy += calculateGoertzelPower(pcmData, start, end, sampleRate, noiseFrequencies[index]);
  }

  const bandRatio = snoreBandEnergy / Math.max(snoreBandEnergy + noiseBandEnergy, 0.000001);
  return { bandRatio, dominantFrequency };
}

function calculateSnoreToneScore(zeroCrossingRate) {
  if (zeroCrossingRate >= 70 && zeroCrossingRate <= 520) return 1;
  if (zeroCrossingRate >= 40 && zeroCrossingRate <= 760) return 0.65;
  return 0.2;
}

function calculateSnoreSpectralScore(bandRatio, dominantFrequency) {
  let bandScore = 0.15;
  if (bandRatio >= 0.72) bandScore = 1;
  else if (bandRatio >= 0.55) bandScore = 0.75;
  else if (bandRatio >= 0.4) bandScore = 0.45;

  const dominantScore = dominantFrequency >= 70 && dominantFrequency <= 630 ? 1 : 0.35;
  return clampNumber(bandScore * 0.75 + dominantScore * 0.25, 0.1, 1);
}

function getRiskLevelByScore(score) {
  if (score < 30) return 'normal';
  if (score < 50) return 'mild';
  if (score < 70) return 'moderate';
  return 'severe';
}

function analyzePcmOnClient(pcmData, durationSeconds) {
  const sampleRate = 8000;
  const frameDuration = 1;
  const frameSamples = sampleRate * frameDuration;
  const frameFeatures = [];
  let peakDecibel = 30;
  let totalDurationSeconds = 0;

  for (let offset = 0; offset < pcmData.length; offset += frameSamples) {
    const end = Math.min(pcmData.length, offset + frameSamples);
    const size = end - offset;
    if (size < sampleRate * 0.25) continue;

    let squareSum = 0;
    let zeroCrossings = 0;
    let previousSample = pcmData[offset];
    for (let index = offset; index < end; index += 1) {
      const sample = pcmData[index];
      squareSum += sample * sample;
      if ((sample >= 0 && previousSample < 0) || (sample < 0 && previousSample >= 0)) {
        zeroCrossings += 1;
      }
      previousSample = sample;
    }

    const rms = Math.sqrt(squareSum / size);
    const frameDecibel = calculateFrameDecibel(rms);
    const frameSeconds = size / sampleRate;
    const zeroCrossingRate = zeroCrossings / Math.max(frameSeconds, 0.01);
    const bandProfile = calculateBandProfile(pcmData, offset, end, sampleRate);
    const toneScore = calculateSnoreToneScore(zeroCrossingRate);
    const spectralScore = calculateSnoreSpectralScore(bandProfile.bandRatio, bandProfile.dominantFrequency);
    frameFeatures.push({
      decibel: frameDecibel,
      snoreScore: toneScore * 0.35 + spectralScore * 0.65,
    });
    peakDecibel = Math.max(peakDecibel, frameDecibel);
    totalDurationSeconds += frameSeconds;
  }

  if (!frameFeatures.length) {
    return { avgDecibel: 30, peakDecibel: 30, snoreRate: 0, apneaEvents: 0, riskLevel: 'normal', riskScore: 0 };
  }

  const frameDecibels = frameFeatures.map(item => item.decibel);
  const sortedDecibels = frameDecibels.slice().sort((a, b) => a - b);
  const quietIndex = Math.floor(sortedDecibels.length * 0.3);
  const noiseFloor = sortedDecibels[quietIndex] || sortedDecibels[0] || 30;
  const snoreThreshold = clampNumber(noiseFloor + 8, 42, 62);
  const quietThreshold = clampNumber(noiseFloor + 3, 34, 48);
  let decibelTotal = 0;
  let snoreFrames = 0;
  let loudSnoreFrames = 0;
  let quietFrames = 0;
  let inApneaState = false;
  let apneaEventsCount = 0;
  let snoreConfidenceTotal = 0;
  let currentSnoreRun = 0;
  let longestSnoreRun = 0;

  for (let index = 0; index < frameFeatures.length; index += 1) {
    const frame = frameFeatures[index];
    const frameDecibel = frame.decibel;
    decibelTotal += frameDecibel;

    if (frameDecibel >= snoreThreshold) {
      snoreFrames += 1;
      if (frameDecibel >= snoreThreshold + 8) loudSnoreFrames += 1;
      const loudnessScore = clampNumber((frameDecibel - snoreThreshold) / 12, 0.45, 1);
      snoreConfidenceTotal += loudnessScore * frame.snoreScore;
      currentSnoreRun += 1;
      longestSnoreRun = Math.max(longestSnoreRun, currentSnoreRun);
    } else {
      currentSnoreRun = 0;
    }

    if (frameDecibel <= quietThreshold) {
      quietFrames += 1;
      if (quietFrames >= 10 && !inApneaState) inApneaState = true;
    } else {
      if (inApneaState && frameDecibel >= snoreThreshold + 6) apneaEventsCount += 1;
      inApneaState = false;
      quietFrames = 0;
    }
  }

  const avgDecibel = Math.round(decibelTotal / frameDecibels.length);
  const decibelStdDev = calculateStdDev(frameDecibels, avgDecibel);
  const activeRatio = snoreFrames / frameDecibels.length;
  const longestRunRatio = longestSnoreRun / frameDecibels.length;
  const stableNoisePenalty = activeRatio >= 0.75 && longestRunRatio >= 0.75 && decibelStdDev < 4 ? 0.45 : 1;
  const sustainedSnoreFrames = Math.max(0, snoreConfidenceTotal - Math.floor(loudSnoreFrames * 0.08));
  const snoreRate = Math.round(clampNumber((sustainedSnoreFrames / frameDecibels.length) * 100 * stableNoisePenalty, 0, 95));
  const apneaEvents = apneaEventsCount;
  const rawRiskScore = calculateRiskScore(avgDecibel, peakDecibel, snoreRate, apneaEvents, Math.max(durationSeconds, totalDurationSeconds));
  const riskScore = Math.round(rawRiskScore * stableNoisePenalty);
  const riskLevel = getRiskLevelByScore(riskScore);
  return { avgDecibel, peakDecibel, snoreRate, apneaEvents, riskLevel, riskScore };
}

Page({
  data: {
    hasLoaded: false,
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
    this._unloaded = false;
    this.setData({ initialPatientId: options && options.patientId ? String(options.patientId) : '' });
    this.bindRecorderEvents();
  },

  async onShow() {
    const generation = sessionStore.getLoginGeneration();
    if (this._generation !== generation || !sessionStore.isLoggedIn()) {
      this._starting = null;
      this._savedReportUrl = '';
      this.ignoreNextStop = true;
      if (this.data.isRecording || this.data.hasRecordingEnded) {
        try { recorderManager.stop(); } catch (error) { console.error(error); }
      }
      this.resetStoppedRecording();
      if (this._generation !== undefined) this.setData({ initialPatientId: '' });
      this._generation = generation;
      this.setData({ hasLoaded: false, memberList: [], memberNames: [], memberIndex: 0, selectedMemberId: '', selectedMemberName: '本人', tempFilePath: '' });
    }
    if (!sessionStore.isLoggedIn()) return;
    if (this.data.hasLoaded) {
      return;
    }
    await this.loadFamilyMembers();
  },

  onHide() {
    this.restoreScreenBrightness();
  },

  onUnload() {
    this._unloaded = true;
    this.ignoreNextStop = true;
    this.clearTimers();
    this.restoreScreenBrightness();
    if (recorderManager.offStop) recorderManager.offStop(this._onRecorderStop);
    if (recorderManager.offError) recorderManager.offError(this._onRecorderError);
    if (recorderManager.offFrameRecorded) recorderManager.offFrameRecorded(this._onRecorderFrame);
    if (this.data.isRecording || this.data.hasRecordingEnded) {
      try { recorderManager.stop(); } catch (error) { console.error('Stop recorder on unload failed', error); }
    }
  },

  bindRecorderEvents() {
    this._onRecorderStop = (result) => {
      if (this._unloaded) return;
      if (this.ignoreNextStop) {
        this.ignoreNextStop = false;
        return;
      }
      this.setData({ tempFilePath: result.tempFilePath || '' });
      this.clearTimers();
      if (this.data.recordingDurationSeconds < 5) {
        this.resetStoppedRecording();
        wx.showToast({ title: '录音时间过短，请至少录制5秒', icon: 'none' });
        return;
      }
      this.submitRecording();
    };
    this._onRecorderError = (error) => {
      if (this._unloaded) return;
      this.handleRecorderError(error);
    };
    this._onRecorderFrame = (result) => {
      if (this._unloaded) return;
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
          const factor = [0.15, 0.25, 0.4, 0.6, 0.8, 0.95, 1, 1, 1, 1, 0.95, 0.8, 0.6, 0.4, 0.25, 0.15][index];
          nextLevels.push(Math.min(38, Math.max(6, 6 + Math.floor(32 * scale * factor))));
        }
        this.setData({ audioLevels: nextLevels });
      } catch (error) {
        console.error('Frame volume calc error', error);
      }
    };
    recorderManager.onStop(this._onRecorderStop);
    recorderManager.onError(this._onRecorderError);
    recorderManager.onFrameRecorded(this._onRecorderFrame);
  },

  handleRecorderError(error) {
    this._starting = null;
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
    const nextPending = Array.isArray(pending) ? pending.slice() : [];
    nextPending.push(Object.assign({ localId: 'snore_' + Date.now() }, payload));
    return safeSetStorage('pending_snore_uploads', nextPending);
  },

  async loadFamilyMembers() {
    const generation = sessionStore.getLoginGeneration();
    this._generation = generation;
    const requestId = this._membersRequest = (this._membersRequest || 0) + 1;
    try {
      const response = await api.getFamilyMembers();
      if (this._unloaded || requestId !== this._membersRequest || !sessionStore.isLoggedIn() || generation !== sessionStore.getLoginGeneration()) return;
      const memberList = unwrapList(response);
      const memberNames = memberList.map((member) => `${member.name}（${RELATION_LABEL_MAP[member.relation] || member.relation || '成员'}）`);
      const initialPatientId = this.data.initialPatientId;
      const initialIndex = initialPatientId ? memberList.findIndex((member) => String(member.id || '') === initialPatientId) : -1;
      const selfIndex = memberList.findIndex((member) => member.relation === 'self');
      const memberIndex = initialIndex >= 0 ? initialIndex : (selfIndex >= 0 ? selfIndex : 0);
      const selectedMember = memberList[memberIndex] || null;
      this.setData({
        hasLoaded: true,
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
    if (this._unloaded || this.hasDimmedScreen) return;
    await this.rememberCurrentScreenBrightness();
    if (this._unloaded) return;
    wx.setScreenBrightness({
      value: 0.01,
      success: () => {
        this.hasDimmedScreen = true;
        if (this._unloaded) this.restoreScreenBrightness();
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
    if (this._unloaded || this._starting || this._submittingRecording || this.data.isRecording || this.data.isAnalyzing) return;
    const generation = sessionStore.getLoginGeneration();
    if (!sessionStore.isLoggedIn() || (this._generation !== undefined && this._generation !== generation)) {
      await this.onShow();
      return;
    }
    const attempt = {};
    this._starting = attempt;
    const current = () => !this._unloaded && this._starting === attempt && sessionStore.isLoggedIn() && generation === sessionStore.getLoginGeneration();
    try {
    if (!this.data.hasLoaded || !this.data.selectedMemberId) await this.loadFamilyMembers();
    if (!current()) return;
    if (!this.data.selectedMemberId || !this.data.memberList.some(member => String(member.id) === this.data.selectedMemberId)) {
      this._starting = null;
      wx.showToast({ title: '请先加载或建立就诊人，再开始录音', icon: 'none' });
      return;
    }
    wx.authorize({
      scope: 'scope.record',
      success: async () => {
        try {
        if (!current()) return;
        this.ignoreNextStop = false;
        await this.dimScreenForRecording();
        if (!current()) { this.restoreScreenBrightness(); return; }
        this._savedReportUrl = '';
        this._recordingTimestamp = Date.now();
        this._recordingLocalId = 'snore_' + this._recordingTimestamp + '_' + Math.random().toString(36).slice(2, 12);
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
        recorderManager.start({
          duration: 600000,
          sampleRate: 8000,
          numberOfChannels: 1,
          format: 'pcm',
          frameSize: 2,
        });
        } catch (error) {
          if (current()) this.handleRecorderError(error);
        } finally {
          if (this._starting === attempt) this._starting = null;
        }
      },
      fail: () => {
        if (!current()) return;
        this._starting = null;
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
    } catch (error) {
      if (current()) this.handleRecorderError(error);
      if (this._starting === attempt) this._starting = null;
    }
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
    if (this._savedReportUrl) { this.openSavedReport(); return; }
    if (this.data.isAnalyzing) return;
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
    if (this._unloaded || this._starting || this._submittingRecording || this.data.isAnalyzing) return;
    if (this._savedReportUrl) { this.openSavedReport(); return; }
    if (this.data.isRecording) {
      this.pauseRecording();
    } else if (this.data.hasRecordingEnded) {
      this.resumeRecording();
    } else {
      this.startRecording();
    }
  },

  resetStoppedRecording() {
    this.clearTimers();
    this.restoreScreenBrightness();
    this.setData({ isRecording: false, hasRecordingEnded: false, isAnalyzing: false,
      isSubmitting: false, disabledSelector: false, recordingDurationSeconds: 0,
      durationText: '00:00', audioLevels: new Array(16).fill(6), statusText: INITIAL_STATUS_TEXT });
  },

  openSavedReport() {
    if (this._unloaded || !this._savedReportUrl) return;
    if (!sessionStore.isLoggedIn() || this._savedReportGeneration !== sessionStore.getLoginGeneration()) {
      this._savedReportUrl = '';
      this.onShow();
      return;
    }
    const url = this._savedReportUrl;
    const generation = this._savedReportGeneration;
    this.setData({ isAnalyzing: true });
    const fail = () => {
      if (this._unloaded || generation !== sessionStore.getLoginGeneration()) return;
      this.resetStoppedRecording();
      this.setData({ isSubmitting: true, disabledSelector: true, statusText: '报告已保存，点击重试打开报告' });
      wx.showToast({ title: '报告打开失败，请点击重试', icon: 'none' });
    };
    try { wx.redirectTo({ url, fail }); } catch (error) { fail(); }
  },

  async submitRecording() {
    if (this._unloaded || this._submittingRecording) return;
    if (this._savedReportUrl) { this.openSavedReport(); return; }
    if (this.data.recordingDurationSeconds < 5) {
      wx.showToast({ title: '录音时间过短，分析前请至少录制5秒', icon: 'none' });
      return;
    }
    const generation = sessionStore.getLoginGeneration();
    const current = () => !this._unloaded && sessionStore.isLoggedIn() && generation === sessionStore.getLoginGeneration();
    if (!current() || (this._generation !== undefined && this._generation !== generation)) { await this.onShow(); return; }
    this._submittingRecording = true;
    this.setData({ isRecording: false, hasRecordingEnded: false, isAnalyzing: true,
      disabledSelector: true, statusText: '正在分析...' });
    this.clearTimers();
    this.restoreScreenBrightness();
    try {
      const profile = await sessionStore.fetchProfile();
      if (!current()) return;
      if (!profile || !profile.id || !this.data.selectedMemberId) throw new Error('请先确认账号及就诊人');
      const fileBuffer = wx.getFileSystemManager().readFileSync(this.data.tempFilePath);
      if (!fileBuffer || fileBuffer.byteLength < 8000 * 2 * 5) throw new Error('有效录音不足5秒，请重新录制');
      const analysisResult = analyzePcmOnClient(toPcmInt16Array(fileBuffer), this.data.recordingDurationSeconds);
      const localReport = {
        id: 'local',
        ownerUserId: String(profile.id),
        patientId: this.data.selectedMemberId,
        type: 'ai_snore',
        snoreAnalysis: Object.assign({ duration: this.data.recordingDurationSeconds }, analysisResult),
        createdAt: new Date().toISOString(),
      };
      const localSaved = safeSetStorage('last_local_snore_result', localReport);
      const submitPayload = {
        localId: this._recordingLocalId || (this._recordingLocalId = 'snore_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12)),
        ownerUserId: String(profile.id),
        duration: this.data.recordingDurationSeconds,
        client_side_analysis: true,
        analysis_result: analysisResult,
        timestamp: this._recordingTimestamp || (this._recordingTimestamp = Date.now()),
        patientId: this.data.selectedMemberId,
      };
      try {
        const submitResponse = await api.submitSnoreRecording(submitPayload);
        if (!current()) return;
        const createdRecord = (submitResponse && submitResponse.data) || submitResponse || {};
        if (!createdRecord.id) throw new Error('报告保存结果未确认');
        this._savedReportUrl = '/pages/assessment/snore-result/index?id=' + encodeURIComponent(createdRecord.id);
      } catch (error) {
        if (!current()) return;
        if (error && error.statusCode >= 400 && error.statusCode < 500) throw error;
        const queued = this.enqueuePendingSnoreRecording(submitPayload);
        if (!localSaved || !queued) throw new Error('本地保存未完成，请检查存储空间后重试；报告尚未同步');
        this._savedReportUrl = '/pages/assessment/snore-result/index?id=local&patientId=' + encodeURIComponent(this.data.selectedMemberId);
      }
      this._savedReportGeneration = generation;
      this.openSavedReport();
    } catch (error) {
      if (!current()) return;
      wx.showToast({ title: (error && error.message) || '分析失败，请重试', icon: 'none' });
      this.resetStoppedRecording();
    } finally {
      this._submittingRecording = false;
    }
  },

  handleBack() {
    this.restoreScreenBrightness();
    wx.navigateBack({ delta: 1 });
  },
});
