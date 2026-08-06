const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');

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
    const comfort = Number(record && record.comfort ? record.comfort : 0);

    let barColor = '#F3F4F6';
    if (record && Number(record.wearDuration || 0) > 0) {
      if (comfort === 1) {
        barColor = '#EF4444';
      } else if (comfort === 2) {
        barColor = '#EAB308';
      } else if (comfort === 3) {
        barColor = '#06B6D4';
      } else if (comfort === 4) {
        barColor = '#4ADE80';
      } else if (comfort === 5) {
        barColor = '#15803D';
      } else {
        barColor = '#06B6D4';
      }
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

Page({
  data: {
    loading: true,
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
      { key: 'comfort', label: '舒适度', value: '0/5' },
      { key: 'streak', label: '连续天数', value: '0天' },
    ],
    showTimelineLink: false,
    timelinePreview: [],
    checkinVisible: false,
    checkinDateLabel: '',
    durationScrollLeft: 0,
    selectedWearDuration: 7,
    selectedComfort: 4,
    checkinNote: '',
    durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    comfortOptions: [1, 2, 3, 4, 5],
    isSubmittingCheckin: false,
  },

  onLoad() {
    this.selectedPatientId = wx.getStorageSync('selected_treatment_patient_id') || '';
  },

  onShow() {
    const token = wx.getStorageSync('access_token');
    if (!token) {
      wx.navigateTo({ url: '/pages/auth/login' });
      return;
    }
    this.loadPage();
  },

  queryParams() {
    const params = { _t: Date.now() };
    if (this.selectedPatientId) {
      params.patientId = this.selectedPatientId;
    }
    return params;
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
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
        note: item.note || '',
      }));
      const summary = unwrapObject(summaryRes) || {};
      const timeline = unwrapList(timelineRes);
      const hasTreatmentRecord = !!treatmentRecord;
      const hasRealTreatmentRecord = !!(treatmentRecord && treatmentRecord.isRealTreatmentRecord);

      this.members = members;
      this.wearingRecords = wearingRecords;

      this.setData({
        loading: false,
        memberNames: buildMemberOptions(members),
        memberOptions: buildMemberOptions(members),
        memberIndex: Math.max(0, members.findIndex((item) => String(item.id) === String(this.selectedPatientId || ''))),
        showMemberPicker: members.length > 1,
        hasTreatmentRecord,
        hasRealTreatmentRecord,
        heroBadgeText: hasTreatmentRecord ? '治疗中' : '未开始',
        heroDeviceText: (treatmentRecord && treatmentRecord.deviceModel) || '暂无治疗记录',
        heroDoctorText: hasTreatmentRecord ? `主治：${(treatmentRecord && treatmentRecord.doctorName) || '--'} 医生` : '完成初诊适配后将在此展示',
        heroStartText: hasTreatmentRecord ? `初配日期：${((treatmentRecord && treatmentRecord.createdAt) || '--').split('T')[0]}` : '初配日期：--',
        treatmentStatusLabel: hasTreatmentRecord ? '治疗中' : '未开始',
        heroSubText: hasTreatmentRecord ? `已佩戴 ${summary.streak || 0} 天` : '暂无诊疗记录',
        treatmentDeviceLabel: (treatmentRecord && treatmentRecord.deviceModel) || '暂无治疗记录',
        treatmentDoctorLabel: hasTreatmentRecord ? `主治：${(treatmentRecord && treatmentRecord.doctorName) || '--'} 医生` : '完成初诊适配后将在此展示',
        heroProgressText: hasTreatmentRecord ? `依从率 ${summary.compliance || 0}%` : '依从率 --',
        progressWidth: `${summary.compliance || 0}%`,
        treatmentStartLabel: hasTreatmentRecord ? `初配日期：${((treatmentRecord && treatmentRecord.createdAt) || '--').split('T')[0]}` : '初配日期：--',
        k: String(summary.weekWorn || 0),
        l: String(Number(summary.weekAvg || 0)),
        m: String(Number(summary.avgComfort || 0)),
        n: String(summary.streak || 0),
        emptyTreatmentNotice: '该治疗人暂无已绑定设备的治疗记录，完成初诊适配后将显示完整治疗追踪内容并支持设备打卡。',
        recentDays: buildRecentDays(wearingRecords),
        summaryCards: [
          { key: 'worn', label: '本周佩戴', value: `${summary.weekWorn || 0}/7` },
          { key: 'avg', label: '平均时长', value: `${Number(summary.weekAvg || 0)}h` },
          { key: 'comfort', label: '舒适度', value: `${Number(summary.avgComfort || 0)}/5` },
          { key: 'streak', label: '连续天数', value: `${summary.streak || 0}天` },
        ],
        showTimelineLink: hasRealTreatmentRecord,
        timelinePreview: buildTimelinePreview(timeline),
      });
    } catch (error) {
      console.error('[Treatment loadPage] 加载失败', error);
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载治疗页失败',
      });
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

  openCheckinModal() {
    const todayRecord = (this.wearingRecords || []).find((item) => item.date === getTodayText());
    this.setData({
      checkinVisible: true,
      checkinDateLabel: getTodayDateLabel(),
      selectedWearDuration: todayRecord && todayRecord.wearDuration > 0 ? todayRecord.wearDuration : 7,
      selectedComfort: todayRecord && todayRecord.comfort ? todayRecord.comfort : 4,
      checkinNote: (todayRecord && todayRecord.note) || '',
    });
    setTimeout(() => {
      this.scrollSelectedDurationToCenter(this.data.selectedWearDuration);
    }, 0);
  },

  closeCheckinModal() {
    this.setData({ checkinVisible: false });
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
        note: this.data.checkinNote || undefined,
      });

      const [wearingRes, summaryRes] = await Promise.all([
        api.getWearingRecords(this.queryParams()),
        api.getWearingSummary(this.queryParams()),
      ]);

      this.wearingRecords = unwrapList(wearingRes).map((item) => ({
        date: item.date || '',
        wearDuration: Number(item.wearDuration || 0),
        comfort: Number(item.comfort || 0),
        note: item.note || '',
      }));
      const summary = unwrapObject(summaryRes) || {};

      this.setData({
        checkinVisible: false,
        isSubmittingCheckin: false,
        recentDays: buildRecentDays(this.wearingRecords),
        k: String(summary.weekWorn || 0),
        l: String(Number(summary.weekAvg || 0)),
        m: String(Number(summary.avgComfort || 0)),
        n: String(summary.streak || 0),
        summaryCards: [
          { key: 'worn', label: '本周佩戴', value: `${summary.weekWorn || 0}/7` },
          { key: 'avg', label: '平均时长', value: `${Number(summary.weekAvg || 0)}h` },
          { key: 'comfort', label: '舒适度', value: `${Number(summary.avgComfort || 0)}/5` },
          { key: 'streak', label: '连续天数', value: `${summary.streak || 0}天` },
        ],
        heroSubText: this.data.hasTreatmentRecord ? `已佩戴 ${summary.streak || 0} 天` : '暂无诊疗记录',
        heroProgressText: this.data.hasTreatmentRecord ? `依从率 ${summary.compliance || 0}%` : '依从率 --',
        progressWidth: `${summary.compliance || 0}%`,
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
