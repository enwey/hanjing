const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');
const { formatChinaDate } = require('../../common/utils/date-time');
const sessionStore = require('../../stores/session-store');

const RELATION_LABEL_MAP = {
  self: '本人',
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  sibling: '兄弟姐妹',
  other: '其他',
};

const TREATMENT_ENTRIES = [
  { key: 'trend', title: '睡眠趋势', description: '佩戴与睡眠数据', icon: '/static/icons/trend.svg', iconClass: 'menu-icon--trend', url: '/pages/treatment/sleep-trend/index' },
  { key: 'report', title: '睡眠报告', description: 'AI智能分析与建议', icon: '/static/icons/report.svg', iconClass: 'menu-icon--report', url: '/pages/treatment/sleep-report/index' },
  { key: 'timeline', title: '治疗时间线', description: '就诊全记录', icon: '/static/icons/timeline.svg', iconClass: 'menu-icon--timeline', url: '/pages/treatment/timeline/index' },
  { key: 'advice', title: '医嘱建议', description: '医生指导方案', icon: '/static/icons/advice.svg', iconClass: 'menu-icon--advice', url: '/pages/treatment/doctor-advice/index' },
  { key: 'adjust', title: '设备调整', description: '参数与调整记录', icon: '/static/icons/adjust.svg', iconClass: 'menu-icon--adjust', url: '/pages/treatment/adjust-detail/index' },
  { key: 'community', title: '医患社区', description: '交流经验与心得', icon: '/static/icons/community.svg', iconClass: 'menu-icon--community', url: '/pages/community/index' },
];

const PAIN_LOCATION_OPTIONS = [
  { key: 'left-molar', label: '上/下颌左大牙齿内侧、外侧' },
  { key: 'right-molar', label: '上/下颌右大牙齿内侧、外侧' },
  { key: 'upper-front', label: '上颌门牙齿内侧、外侧' },
  { key: 'lower-front', label: '下颌门牙齿内侧、外侧' },
  { key: 'upper-left-joint', label: '上颌左关节痛' },
  { key: 'lower-right-joint', label: '下颌右关节痛' },
  { key: 'bite-surface', label: '咬合面痛' },
  { key: 'fracture', label: '上/下断裂' },
];

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

function unwrapList(response) {
  const payload = unwrapObject(response);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.list)) {
    return payload.list;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
}

function getRelationLabel(relation) {
  return RELATION_LABEL_MAP[relation] || relation || '成员';
}

function buildMemberOptions(members) {
  return members.map((item) => `${item.name}（${getRelationLabel(item.relation)}）`);
}

function getTodayText() {
  const today = new Date();
  return (
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0')
  );
}

function getTodayDateLabel() {
  const today = new Date();
  const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 ${weeks[today.getDay()]}`;
}

function buildRecentDays(records) {
  const result = [];
  const today = new Date();
  const recordMap = {};

  records.forEach((item) => {
    if (item.date) {
      recordMap[item.date] = item;
    }
  });

  for (let index = 6; index >= 0; index -= 1) {
    const currentDate = new Date(today);
    currentDate.setDate(currentDate.getDate() - index);
    const dateText =
      currentDate.getFullYear() +
      '-' +
      String(currentDate.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(currentDate.getDate()).padStart(2, '0');
    const record = recordMap[dateText] || null;
    const painScore = resolvePainScore(record);

    let barColor = '#F3F4F6';
    if (record && Number(record.wearDuration || 0) > 0) {
      barColor = getPainScoreColor(painScore);
    }

    result.push({
      id: dateText,
      weekLabel: ['日', '一', '二', '三', '四', '五', '六'][currentDate.getDay()],
      dayLabel: String(currentDate.getDate()),
      isToday: index === 0,
      wearDurationLabel: record ? `${record.wearDuration}h` : '未佩戴',
      barColor,
    });
  }

  return result;
}

function parsePainScoreFromNote(note) {
  const matched = String(note || '').match(/VAS评分：(\d+)分/);
  if (!matched) {
    return null;
  }
  const value = Number(matched[1]);
  return Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : null;
}

function resolvePainScore(record) {
  if (!record) {
    return 0;
  }
  if (record.painScore !== undefined && record.painScore !== null && record.painScore !== '') {
    return Number(record.painScore);
  }
  const parsed = parsePainScoreFromNote(record.note);
  if (parsed !== null) {
    return parsed;
  }
  return mapComfortToPainScore(record.comfort);
}

function getPainScoreColor(score) {
  const value = Number(score || 0);
  if (value <= 0) {
    return '#15803D';
  }
  if (value <= 3) {
    return '#4ADE80';
  }
  if (value <= 6) {
    return '#EAB308';
  }
  return '#EF4444';
}

function calcAveragePainScore(records) {
  const validRecords = (records || []).filter((record) => record && Number(record.wearDuration || 0) > 0);
  if (!validRecords.length) {
    return '0';
  }
  const total = validRecords.reduce((sum, record) => sum + resolvePainScore(record), 0);
  const average = total / validRecords.length;
  return Number.isInteger(average) ? String(average) : average.toFixed(1);
}

function buildTimelinePreview(timeline) {
  return timeline.slice(0, 2).map((item, index, list) => ({
    id: item.id || String(index),
    title: item.title || '',
    description: item.description || '',
    dateLabel: item.date || '',
    dotColor: item.color || '#3b6bf5',
    showLine: index < list.length - 1,
  }));
}

function getPainScoreLevel(score) {
  const value = Number(score || 0);
  if (value <= 0) {
    return { label: '无痛', hint: '0 分表示无疼痛感', className: 'none' };
  }
  if (value <= 3) {
    return { label: '轻度疼痛', hint: '1-3 分为轻度疼痛', className: 'mild' };
  }
  if (value <= 6) {
    return { label: '中度疼痛', hint: '4-6 分为中度疼痛', className: 'moderate' };
  }
  return { label: '重度疼痛', hint: '7-10 分为重度疼痛', className: 'severe' };
}

function mapComfortToPainScore(comfort) {
  const value = Number(comfort || 0);
  if (value >= 5) {
    return 0;
  }
  if (value === 4) {
    return 2;
  }
  if (value === 3) {
    return 4;
  }
  if (value === 2) {
    return 6;
  }
  if (value === 1) {
    return 8;
  }
  return 0;
}

function mapPainScoreToComfort(score) {
  const value = Number(score || 0);
  if (value <= 0) {
    return 5;
  }
  if (value <= 2) {
    return 4;
  }
  if (value <= 4) {
    return 3;
  }
  if (value <= 7) {
    return 2;
  }
  return 1;
}

function buildPainScoreData(score) {
  const value = Math.max(0, Math.min(10, Number(score || 0)));
  const painLevel = getPainScoreLevel(value);
  return {
    selectedPainScore: value,
    selectedComfort: mapPainScoreToComfort(value),
    painScoreLabel: painLevel.label,
    painScoreHint: painLevel.hint,
    painScoreClass: painLevel.className,
    painScorePercent: `${value * 10}%`,
  };
}

function buildPainLocationOptions(selectedKeys) {
  const selectedMap = {};
  (selectedKeys || []).forEach((key) => {
    selectedMap[key] = true;
  });
  return PAIN_LOCATION_OPTIONS.map((item) => ({
    ...item,
    selected: !!selectedMap[item.key],
  }));
}

function parsePainLocationKeysFromNote(note) {
  const matched = String(note || '').match(/疼痛部位：([^\n]+)/);
  if (!matched) {
    return [];
  }
  const labels = matched[1].split('、').map((item) => item.trim()).filter(Boolean);
  return PAIN_LOCATION_OPTIONS.filter((option) => labels.indexOf(option.label) >= 0).map((option) => option.key);
}

function resolvePainLocationKeys(record) {
  const locations = record && Array.isArray(record.painLocations) ? record.painLocations : [];
  if (locations.length) {
    return PAIN_LOCATION_OPTIONS
      .filter((option) => locations.indexOf(option.label) >= 0 || locations.indexOf(option.key) >= 0)
      .map((option) => option.key);
  }
  return parsePainLocationKeysFromNote(record && record.note);
}

function parseRemarkFromNote(note) {
  const text = String(note || '');
  const matched = text.match(/备注：([\s\S]*)$/);
  if (matched) {
    return matched[1].trim();
  }
  return text.indexOf('VAS评分：') >= 0 ? '' : text;
}

function buildCheckinNote(score, labels, remark) {
  const level = getPainScoreLevel(score);
  const lines = [`VAS评分：${score}分（${level.label}）`];
  if (labels.length) {
    lines.push(`疼痛部位：${labels.join('、')}`);
  }
  if (remark) {
    lines.push(`备注：${remark}`);
  }
  return lines.join('\n');
}

Page({
  data: {
    isLoggedIn: false,
    loading: true,
    hasLoaded: false,
    pageStyle: 'overflow: visible; background-color: #f3f4f6;',
    loadError: '',
    entries: TREATMENT_ENTRIES,
    memberNames: [],
    memberOptions: [],
    memberIndex: 0,
    showMemberPicker: false,
    hasTreatmentRecord: false,
    hasRealTreatmentRecord: false,
    heroBadgeText: '未开始',
    heroDeviceText: '暂无治疗记录',
    heroDoctorText: '完成初诊适配后将在此展示',
    heroStartText: '初配日期：--',
    treatmentStatusLabel: '未开始',
    treatmentDeviceLabel: '暂无治疗记录',
    treatmentDoctorLabel: '完成初诊适配后将在此展示',
    treatmentStartLabel: '初配日期：--',
    heroSubText: '暂无诊疗记录',
    heroProgressText: '依从率 --',
    progressWidth: '0%',
    k: '0',
    l: '0',
    m: '0',
    n: '0',
    emptyTreatmentNotice: '该治疗人暂无已绑定设备的治疗记录，完成初诊适配后将显示完整治疗追踪内容并支持设备打卡。',
    recentDays: [],
    summaryCards: [
      { key: 'worn', label: '本周佩戴', value: '0/7' },
      { key: 'avg', label: '平均时长', value: '0h' },
      { key: 'comfort', label: '平均痛感', value: '0/10' },
      { key: 'streak', label: '连续天数', value: '0天' },
    ],
    showTimelineLink: false,
    timelinePreview: [],
    checkinVisible: false,
    checkinDateLabel: '',
    durationScrollLeft: 0,
    selectedWearDuration: 7,
    selectedComfort: 4,
    selectedPainScore: 2,
    painScorePercent: '20%',
    painScoreLabel: '轻度疼痛',
    painScoreHint: '1-3 分为轻度疼痛',
    painScoreClass: 'mild',
    painLocationOptions: buildPainLocationOptions([]),
    selectedPainLocationKeys: [],
    selectedPainLocationLabels: [],
    checkinNote: '',
    durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    painScoreTicks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    isSubmittingCheckin: false,
  },

  onLoad() {
    this.selectedPatientId = wx.getStorageSync('selected_treatment_patient_id') || '';
  },

  onShow() {
    if (!sessionStore.isLoggedIn()) {
      this.setData({
        isLoggedIn: false,
        loading: false,
        hasLoaded: false,
        checkinVisible: false,
        pageStyle: 'overflow: visible; background-color: #f3f4f6;',
      });
      return;
    }
    this.setData({ isLoggedIn: true });
    this.loadPage({ silent: this.data.hasLoaded });
  },

  onHide() {
    if (this.data.checkinVisible || this.data.pageStyle !== 'overflow: visible;') {
      this.setData({ checkinVisible: false, pageStyle: 'overflow: visible; background-color: #f3f4f6;' });
    }
  },

  onUnload() {
    if (this.data.checkinVisible || this.data.pageStyle !== 'overflow: visible; background-color: #f3f4f6;') {
      this.setData({ checkinVisible: false, pageStyle: 'overflow: visible; background-color: #f3f4f6;' });
    }
  },

  queryParams() {
    const params = { _t: Date.now() };
    if (this.selectedPatientId) {
      params.patientId = this.selectedPatientId;
    }
    return params;
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const memberRes = await api.getFamilyMembers();
      const members = unwrapList(memberRes);
      const hasSelectedMember = members.length > 0 && members.some((item) => String(item.id) === String(this.selectedPatientId || ''));

      if (this.selectedPatientId && members.length > 0 && !hasSelectedMember) {
        this.selectedPatientId = '';
        wx.removeStorageSync('selected_treatment_patient_id');
      }

      if (!this.selectedPatientId && members.length) {
        const selfMember = members.find((item) => item.relation === 'self') || members[0];
        this.selectedPatientId = String(selfMember.id);
        wx.setStorageSync('selected_treatment_patient_id', this.selectedPatientId);
      }

      const params = this.queryParams();
      const [recordRes, wearingRes, summaryRes, timelineRes] = await Promise.all([
        api.getTreatmentRecord(params),
        api.getWearingRecords(params),
        api.getWearingSummary(params),
        api.getTimeline(params),
      ]);

      const treatmentRecord = unwrapObject(recordRes) || null;
      const wearingRecords = unwrapList(wearingRes).map((item) => ({
        date: item.date || '',
        wearDuration: Number(item.wearDuration || 0),
        comfort: Number(item.comfort || 0),
        painScore: item.painScore === undefined || item.painScore === null ? null : Number(item.painScore),
        painLocations: Array.isArray(item.painLocations) ? item.painLocations : [],
        note: item.note || '',
      }));
      const summary = unwrapObject(summaryRes) || {};
      const timeline = unwrapList(timelineRes);
      const hasTreatmentRecord = !!treatmentRecord;
      const hasRealTreatmentRecord = !!(treatmentRecord && treatmentRecord.isRealTreatmentRecord);
      const heroCompliance = Number(summary.weekCompliance != null ? summary.weekCompliance : summary.compliance || 0);

      this.members = members;
      this.wearingRecords = wearingRecords;

      this.setData({
        loading: false,
        hasLoaded: true,
        memberNames: buildMemberOptions(members),
        memberOptions: buildMemberOptions(members),
        memberIndex: Math.max(0, members.findIndex((item) => String(item.id) === String(this.selectedPatientId || ''))),
        showMemberPicker: members.length > 1,
        hasTreatmentRecord,
        hasRealTreatmentRecord,
        heroBadgeText: hasTreatmentRecord ? '治疗中' : '未开始',
        heroDeviceText: (treatmentRecord && treatmentRecord.deviceModel) || '暂无治疗记录',
        heroDoctorText: hasTreatmentRecord ? `主治：${(treatmentRecord && treatmentRecord.doctorName) || '--'} 医生` : '完成初诊适配后将在此展示',
        heroStartText: hasTreatmentRecord ? `初配日期：${formatChinaDate((treatmentRecord && treatmentRecord.createdAt) || '') || '--'}` : '初配日期：--',
        treatmentStatusLabel: hasTreatmentRecord ? '治疗中' : '未开始',
        heroSubText: hasTreatmentRecord ? `已佩戴 ${summary.streak || 0} 天` : '暂无诊疗记录',
        treatmentDeviceLabel: (treatmentRecord && treatmentRecord.deviceModel) || '暂无治疗记录',
        treatmentDoctorLabel: hasTreatmentRecord ? `主治：${(treatmentRecord && treatmentRecord.doctorName) || '--'} 医生` : '完成初诊适配后将在此展示',
        heroProgressText: hasTreatmentRecord ? `依从率 ${heroCompliance}%` : '依从率 --',
        progressWidth: `${heroCompliance}%`,
        treatmentStartLabel: hasTreatmentRecord ? `初配日期：${formatChinaDate((treatmentRecord && treatmentRecord.createdAt) || '') || '--'}` : '初配日期：--',
        k: String(summary.weekWorn || 0),
        l: String(Number(summary.weekAvg || 0)),
        m: calcAveragePainScore(wearingRecords),
        n: String(summary.streak || 0),
        emptyTreatmentNotice: '该治疗人暂无已绑定设备的治疗记录，完成初诊适配后将显示完整治疗追踪内容并支持设备打卡。',
        recentDays: buildRecentDays(wearingRecords),
        summaryCards: [
          { key: 'worn', label: '本周佩戴', value: `${summary.weekWorn || 0}/7` },
          { key: 'avg', label: '平均时长', value: `${Number(summary.weekAvg || 0)}h` },
          { key: 'comfort', label: '平均痛感', value: `${calcAveragePainScore(wearingRecords)}/10` },
          { key: 'streak', label: '连续天数', value: `${summary.streak || 0}天` },
        ],
        showTimelineLink: hasRealTreatmentRecord,
        timelinePreview: buildTimelinePreview(timeline),
      });
    } catch (error) {
      console.error('[Treatment loadPage] 加载失败', error);
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载治疗页失败',
        });
      } else {
        this.setData({ loading: false });
      }
    }
  },

  async handleMemberChange(event) {
    const nextIndex = Number(event.detail.value || 0);
    const member = (this.members || [])[nextIndex];
    if (!member) {
      return;
    }
    this.selectedPatientId = String(member.id);
    wx.setStorageSync('selected_treatment_patient_id', this.selectedPatientId);
    this.setData({ loading: true, memberIndex: nextIndex });
    await this.loadPage();
  },

  openEntry(event) {
    const url = String(event.currentTarget.dataset.url || '');
    if (!url) {
      return;
    }
    navigation.openPage(url);
  },

  goCalendar() {
    navigation.openPage('/pages/treatment/calendar/index');
  },

  goSleepTrend() {
    navigation.openPage('/pages/treatment/sleep-trend/index');
  },

  goSleepReport() {
    navigation.openPage('/pages/treatment/sleep-report/index');
  },

  goTimeline() {
    navigation.openPage('/pages/treatment/timeline/index');
  },

  goDoctorAdvice() {
    navigation.openPage('/pages/treatment/doctor-advice/index');
  },

  goAdjustDetail() {
    navigation.openPage('/pages/treatment/adjust-detail/index');
  },

  goCommunity() {
    navigation.openPage('/pages/community/index');
  },

  goLogin() {
    const app = getApp();
    const lastRoute = app && app.globalData && app.globalData.lastRoute
      ? `/${app.globalData.lastRoute}`
      : '/pages/index/index';
    navigation.openLogin('/pages/treatment/index', lastRoute);
  },

  openCheckinModal() {
    const todayRecord = (this.wearingRecords || []).find((item) => item.date === getTodayText());
    const painScore = todayRecord ? resolvePainScore(todayRecord) : mapComfortToPainScore(4);
    const selectedPainLocationKeys = resolvePainLocationKeys(todayRecord);
    const selectedPainLocationLabels = PAIN_LOCATION_OPTIONS
      .filter((option) => selectedPainLocationKeys.indexOf(option.key) >= 0)
      .map((option) => option.label);
    this.setData({
      pageStyle: 'overflow: hidden; height: 100vh;',
      checkinVisible: true,
      checkinDateLabel: getTodayDateLabel(),
      selectedWearDuration: todayRecord && todayRecord.wearDuration > 0 ? todayRecord.wearDuration : 7,
      ...buildPainScoreData(painScore),
      selectedPainLocationKeys,
      selectedPainLocationLabels,
      painLocationOptions: buildPainLocationOptions(selectedPainLocationKeys),
      checkinNote: parseRemarkFromNote(todayRecord && todayRecord.note),
    });
    setTimeout(() => {
      this.scrollSelectedDurationToCenter(this.data.selectedWearDuration);
    }, 0);
  },

  closeCheckinModal() {
    this.setData({ checkinVisible: false, pageStyle: 'overflow: visible;' });
  },

  scrollSelectedDurationToCenter(selectedDuration) {
    const selectedIndex = (this.data.durationOptions || []).indexOf(selectedDuration);
    if (selectedIndex < 0) {
      this.setData({ durationScrollLeft: 0 });
      return;
    }
    let windowWidth = 375;
    try {
      const windowInfo = wx.getWindowInfo();
      windowWidth = windowInfo.windowWidth || windowWidth;
    } catch (error) {}
    const panelHorizontalPadding = 40;
    const optionWidth = 80;
    const optionGap = 8;
    const viewportWidth = Math.max(0, windowWidth - panelHorizontalPadding);
    const nextScrollLeft = selectedIndex * (optionWidth + optionGap) - (viewportWidth - optionWidth) / 2;
    this.setData({ durationScrollLeft: Math.max(0, Math.round(nextScrollLeft)) });
  },

  handleDurationTap(event) {
    const value = Number(event.currentTarget.dataset.value || 0);
    if (!value) {
      return;
    }
    this.setData({ selectedWearDuration: value });
    this.scrollSelectedDurationToCenter(value);
  },

  handleComfortTap(event) {
    const value = Number(event.currentTarget.dataset.value || 0);
    if (!value) {
      return;
    }
    this.setData({ selectedComfort: value });
  },

  updatePainScore(value) {
    this.setData(buildPainScoreData(value));
  },

  measurePainSlider(callback) {
    wx.createSelectorQuery()
      .in(this)
      .select('.pain-score-slider-wrap')
      .boundingClientRect((rect) => {
        if (rect && rect.width) {
          this.painSliderRect = rect;
          callback(rect);
        }
      })
      .exec();
  },

  updatePainScoreByPageX(pageX, rect) {
    const sliderRect = rect || this.painSliderRect;
    if (!sliderRect || !sliderRect.width) {
      this.measurePainSlider((nextRect) => this.updatePainScoreByPageX(pageX, nextRect));
      return;
    }
    const edgeOffset = 13;
    const trackLeft = sliderRect.left + edgeOffset;
    const trackWidth = Math.max(1, sliderRect.width - edgeOffset * 2);
    const rawValue = ((pageX - trackLeft) / trackWidth) * 10;
    const nextValue = Math.max(0, Math.min(10, Math.round(rawValue)));
    this.updatePainScore(nextValue);
  },

  handlePainSliderTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) {
      return;
    }
    this.measurePainSlider((rect) => {
      this.updatePainScoreByPageX(touch.pageX, rect);
    });
  },

  handlePainSliderTouchMove(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) {
      return;
    }
    this.updatePainScoreByPageX(touch.pageX);
  },

  handlePainLocationTap(event) {
    const key = String(event.currentTarget.dataset.key || '');
    const option = PAIN_LOCATION_OPTIONS.find((item) => item.key === key);
    if (!option) {
      return;
    }
    const keys = this.data.selectedPainLocationKeys.slice();
    const labels = this.data.selectedPainLocationLabels.slice();
    const index = keys.indexOf(key);
    if (index >= 0) {
      keys.splice(index, 1);
      labels.splice(index, 1);
    } else {
      keys.push(key);
      labels.push(option.label);
    }
    this.setData({
      selectedPainLocationKeys: keys,
      selectedPainLocationLabels: labels,
      painLocationOptions: buildPainLocationOptions(keys),
    });
  },

  handleNoteInput(event) {
    this.setData({ checkinNote: event.detail.value || '' });
  },

  async submitCheckin() {
    if (this.data.isSubmittingCheckin) {
      return;
    }
    this.setData({ isSubmittingCheckin: true });
    try {
      await api.submitWearingCheckin({
        ...this.queryParams(),
        date: getTodayText(),
        wearDuration: this.data.selectedWearDuration,
        comfort: this.data.selectedComfort,
        painScore: this.data.selectedPainScore,
        painLocations: this.data.selectedPainLocationLabels,
        note: String(this.data.checkinNote || '').trim() || undefined,
      });

      const [wearingRes, summaryRes] = await Promise.all([
        api.getWearingRecords(this.queryParams()),
        api.getWearingSummary(this.queryParams()),
      ]);

      this.wearingRecords = unwrapList(wearingRes).map((item) => ({
        date: item.date || '',
        wearDuration: Number(item.wearDuration || 0),
        comfort: Number(item.comfort || 0),
        painScore: item.painScore === undefined || item.painScore === null ? null : Number(item.painScore),
        painLocations: Array.isArray(item.painLocations) ? item.painLocations : [],
        note: item.note || '',
      }));
      const summary = unwrapObject(summaryRes) || {};
      const heroCompliance = Number(summary.weekCompliance != null ? summary.weekCompliance : summary.compliance || 0);

      this.setData({
        checkinVisible: false,
        pageStyle: 'overflow: visible;',
        isSubmittingCheckin: false,
        recentDays: buildRecentDays(this.wearingRecords),
        k: String(summary.weekWorn || 0),
        l: String(Number(summary.weekAvg || 0)),
        m: calcAveragePainScore(this.wearingRecords),
        n: String(summary.streak || 0),
        summaryCards: [
          { key: 'worn', label: '本周佩戴', value: `${summary.weekWorn || 0}/7` },
          { key: 'avg', label: '平均时长', value: `${Number(summary.weekAvg || 0)}h` },
          { key: 'comfort', label: '平均痛感', value: `${calcAveragePainScore(this.wearingRecords)}/10` },
          { key: 'streak', label: '连续天数', value: `${summary.streak || 0}天` },
        ],
        heroSubText: this.data.hasTreatmentRecord ? `已佩戴 ${summary.streak || 0} 天` : '暂无诊疗记录',
        heroProgressText: this.data.hasTreatmentRecord ? `依从率 ${heroCompliance}%` : '依从率 --',
        progressWidth: `${heroCompliance}%`,
      });
      wx.showToast({ title: '打卡成功', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '打卡失败', icon: 'none' });
      this.setData({ isSubmittingCheckin: false });
      return;
    }
    this.setData({ isSubmittingCheckin: false });
  },

  noop() {},
});
