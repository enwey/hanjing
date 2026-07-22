const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');
const patientContextStore = require('../../stores/patient-context-store');
const patientContextService = require('../../services/patient-context-service');

const TREATMENT_ENTRIES = [
  { key: 'trend', title: '睡眠趋势', description: '查看佩戴时长、依从率与趋势图', icon: '/static/icons/trend.svg', url: '/pages/treatment/sleep-trend/index' },
  { key: 'timeline', title: '治疗时间线', description: '查看诊疗、调整与随访节点', icon: '/static/icons/timeline.svg', url: '/pages/treatment/timeline/index' },
  { key: 'report', title: '睡眠报告', description: '查看阶段性治疗分析报告', icon: '/static/icons/report.svg', url: '/pages/treatment/sleep-report/index' },
  { key: 'advice', title: '医嘱建议', description: '查看医生建议与注意事项', icon: '/static/icons/advice.svg', url: '/pages/treatment/doctor-advice/index' },
  { key: 'adjust', title: '设备调整', description: '查看参数调整与适配记录', icon: '/static/icons/adjust.svg', url: '/pages/treatment/adjust-detail/index' },
  { key: 'calendar', title: '打卡日历', description: '查看完整佩戴打卡日历', icon: '/static/icons/calendar.svg', url: '/pages/treatment/calendar/index' },
];

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
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

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

function buildPatientOptions(members) {
  return members.map((member) => {
    const relationLabel = patientContextService.getRelationLabel(member.relation);
    return (member.name || relationLabel) + '（' + relationLabel + '）';
  });
}

function formatDateLabel(value) {
  const dateText = String(value || '');
  if (!dateText) {
    return '';
  }
  return dateText.replace('T', ' ').slice(0, 16);
}

function formatHourLabel(value) {
  const numberValue = Number(value || 0);
  if (!Number.isFinite(numberValue)) {
    return '0';
  }
  return numberValue % 1 === 0 ? String(numberValue) : numberValue.toFixed(1);
}

function buildRecentDays(records) {
  const today = new Date();
  const result = [];
  const recordMap = {};
  records.forEach((record) => {
    if (record.date) {
      recordMap[record.date] = record;
    }
  });

  for (let offset = 6; offset >= 0; offset -= 1) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() - offset);
    const dateText =
      currentDate.getFullYear() +
      '-' +
      String(currentDate.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(currentDate.getDate()).padStart(2, '0');
    const record = recordMap[dateText] || null;
    const comfort = Number(record && record.comfort ? record.comfort : 0);
    result.push({
      id: dateText,
      weekLabel: ['日', '一', '二', '三', '四', '五', '六'][currentDate.getDay()],
      dayLabel: String(currentDate.getDate()),
      isToday: offset === 0,
      wearDurationLabel: record && Number(record.wearDuration || 0) > 0 ? formatHourLabel(record.wearDuration) + 'h' : '',
      colorClass: comfort >= 5
        ? 'recent-day__bar--comfort5'
        : comfort === 4
          ? 'recent-day__bar--comfort4'
          : comfort === 3
            ? 'recent-day__bar--comfort3'
            : comfort === 2
              ? 'recent-day__bar--comfort2'
              : comfort === 1
                ? 'recent-day__bar--comfort1'
                : '',
    });
  }

  return result;
}

function buildTimelinePreview(timeline) {
  return timeline.slice(0, 3).map((item, index, list) => ({
    id: String(item.id || index),
    title: item.title || item.typeLabel || '治疗节点',
    description: item.description || '',
    dateLabel: formatDateLabel(item.date || item.createdAt || ''),
    showLine: index < list.length - 1,
  }));
}

Page({
  data: {
    loading: true,
    loadError: '',
    entries: TREATMENT_ENTRIES,
    memberOptions: [],
    memberIndex: 0,
    currentPatientName: '',
    currentPatientRelation: '',
    currentPatientCard: '',
    hasRealTreatmentRecord: false,
    treatmentStatusLabel: '暂无治疗记录',
    treatmentDeviceLabel: '',
    treatmentDoctorLabel: '',
    treatmentStartLabel: '',
    complianceLabel: '0%',
    progressWidth: '0%',
    summaryCards: [
      { key: 'worn', label: '本周佩戴', value: '0/7' },
      { key: 'avg', label: '平均时长', value: '0h' },
      { key: 'comfort', label: '舒适度', value: '0/5' },
      { key: 'streak', label: '连续天数', value: '0天' },
    ],
    recentDays: [],
    timelinePreview: [],
    checkinVisible: false,
    selectedWearDuration: 6,
    selectedComfort: 4,
    checkinNote: '',
    durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    comfortOptions: [1, 2, 3, 4, 5],
    isSubmittingCheckin: false,
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const context = await patientContextStore.refresh();
      const members = context.members || [];
      const currentMember = context.currentMember || null;
      const params = context.currentPatientId ? { patientId: context.currentPatientId, _t: Date.now() } : { _t: Date.now() };

      const [treatmentRecordResponse, wearingRecordsResponse, wearingSummaryResponse, timelineResponse] = await Promise.all([
        api.getTreatmentRecord(params),
        api.getWearingRecords(params),
        api.getWearingSummary(params),
        api.getTimeline(params),
      ]);

      const treatmentRecord = unwrapObject(treatmentRecordResponse) || null;
      const wearingRecords = unwrapList(wearingRecordsResponse).map((record) => ({
        date: record.date || '',
        wearDuration: Number(record.wearDuration || 0),
        comfort: Number(record.comfort || 0),
        note: record.note || '',
      }));
      const wearingSummary = unwrapObject(wearingSummaryResponse) || {};
      const timeline = unwrapList(timelineResponse);
      const hasRealTreatmentRecord = Boolean(
        treatmentRecord &&
        (treatmentRecord.isRealTreatmentRecord ||
          treatmentRecord.deviceModel ||
          treatmentRecord.currentDeviceId ||
          treatmentRecord.patientDeviceId),
      );

      this.wearingRecords = wearingRecords;

      this.setData({
        loading: false,
        memberOptions: buildPatientOptions(members),
        memberIndex: Math.max(0, members.findIndex((member) => String(member.id) === String(context.currentPatientId))),
        currentPatientName: currentMember ? currentMember.name || '' : '',
        currentPatientRelation: currentMember ? patientContextService.getRelationLabel(currentMember.relation) : '',
        currentPatientCard: currentMember ? currentMember.medicalCardNo || currentMember.medical_record_no || '' : '',
        hasRealTreatmentRecord,
        treatmentStatusLabel: hasRealTreatmentRecord ? '治疗中' : '暂无治疗记录',
        treatmentDeviceLabel: hasRealTreatmentRecord ? (treatmentRecord.deviceModel || '已绑定设备') : '',
        treatmentDoctorLabel: treatmentRecord && treatmentRecord.doctorName ? '主诊医生：' + treatmentRecord.doctorName : '',
        treatmentStartLabel: treatmentRecord && treatmentRecord.createdAt ? '开始时间：' + formatDateLabel(treatmentRecord.createdAt) : '',
        complianceLabel: Number(wearingSummary.compliance || 0) + '%',
        progressWidth: Math.max(0, Math.min(Number(wearingSummary.compliance || 0), 100)) + '%',
        summaryCards: [
          { key: 'worn', label: '本周佩戴', value: String(wearingSummary.weekWorn || 0) + '/7' },
          { key: 'avg', label: '平均时长', value: formatHourLabel(wearingSummary.weekAvg || 0) + 'h' },
          { key: 'comfort', label: '舒适度', value: formatHourLabel(wearingSummary.avgComfort || 0) + '/5' },
          { key: 'streak', label: '连续天数', value: String(wearingSummary.streak || 0) + '天' },
        ],
        recentDays: buildRecentDays(wearingRecords),
        timelinePreview: buildTimelinePreview(timeline),
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载治疗页失败',
      });
    }
  },

  async handleMemberChange(event) {
    const memberIndex = Number(event.detail.value || 0);
    const selectedMember = patientContextStore.selectMemberByIndex(memberIndex);
    if (!selectedMember) {
      return;
    }
    this.setData({
      memberIndex,
      currentPatientName: selectedMember.name || '',
      currentPatientRelation: patientContextService.getRelationLabel(selectedMember.relation),
      currentPatientCard: selectedMember.medicalCardNo || selectedMember.medical_record_no || '',
    });
    await this.loadPage();
  },

  openEntry(event) {
    const url = String(event.currentTarget.dataset.url || '');
    if (!url) {
      return;
    }
    navigation.openPage(url);
  },

  goAppointment() {
    navigation.switchTab('/pages/appointment/index');
  },

  openCheckinModal() {
    if (!this.data.hasRealTreatmentRecord) {
      wx.showToast({ title: '当前治疗人暂无可打卡的设备记录', icon: 'none' });
      return;
    }

    const todayText = this.getTodayText();
    const todayRecord = (this.wearingRecords || []).find((record) => record.date === todayText);

    this.setData({
      checkinVisible: true,
      selectedWearDuration: todayRecord && todayRecord.wearDuration ? Number(todayRecord.wearDuration) : 6,
      selectedComfort: todayRecord && todayRecord.comfort ? Number(todayRecord.comfort) : 4,
      checkinNote: todayRecord ? todayRecord.note || '' : '',
    });
  },

  closeCheckinModal() {
    this.setData({ checkinVisible: false });
  },

  handleDurationTap(event) {
    const value = Number(event.currentTarget.dataset.value || 0);
    if (!value) {
      return;
    }
    this.setData({ selectedWearDuration: value });
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

  getTodayText() {
    const today = new Date();
    return (
      today.getFullYear() +
      '-' +
      String(today.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(today.getDate()).padStart(2, '0')
    );
  },

  async submitCheckin() {
    if (this.data.isSubmittingCheckin) {
      return;
    }

    this.setData({ isSubmittingCheckin: true });
    wx.showLoading({ title: '提交打卡中', mask: true });
    try {
      const patientId = patientContextStore.state.currentPatientId;
      const payload = {
        date: this.getTodayText(),
        wearDuration: this.data.selectedWearDuration,
        comfort: this.data.selectedComfort,
        note: this.data.checkinNote || undefined,
      };
      if (patientId) {
        payload.patientId = patientId;
      }
      await api.submitWearingCheckin(payload);
      wx.hideLoading();
      wx.showToast({ title: '打卡成功', icon: 'success' });
      this.setData({ checkinVisible: false });
      await this.loadPage();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: (error && error.message) || '打卡失败', icon: 'none' });
    } finally {
      this.setData({ isSubmittingCheckin: false });
    }
  },

  noop() {},
});
