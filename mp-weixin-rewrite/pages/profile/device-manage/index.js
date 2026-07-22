const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');
const patientContextService = require('../../../services/patient-context-service');

const DEVICE_ACTIONS = [
  {
    key: 'wearing',
    icon: '/static/icons/trend.svg',
    label: '佩戴数据',
    description: '查看当前设备的佩戴记录',
    url: '/pages/profile/device-manage/wearing-data/index',
  },
  {
    key: 'maintenance',
    icon: '/static/icons/adjust.svg',
    label: '维护记录',
    description: '查看清洁、维修与更换记录',
    url: '/pages/profile/device-manage/maintenance/index',
  },
  {
    key: 'feedback',
    icon: '/static/icons/chat.svg',
    label: '使用反馈',
    description: '提交使用体验和问题反馈',
    url: '/pages/profile/device-manage/feedback/index',
  },
];

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload || null;
}

function buildDeviceSummary(record) {
  if (!record || !record.id) {
    return null;
  }

  return {
    id: String(record.id),
    deviceName: record.deviceName || record.deviceModel || '阻鼾器',
    deviceCode: record.deviceCode || record.serialNumber || '',
    bindDate: record.bindDate || record.createdAt || '',
    pressureRange: record.pressureRange || record.pressureSetting || '',
    sleepStage: record.stageName || record.phaseName || '',
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    memberOptions: [],
    memberIndex: 0,
    selectedMemberLabel: '请选择就诊人',
    currentPatientName: '',
    currentPatientRelation: '',
    currentPatientCard: '',
    deviceSummary: null,
    actionEntries: DEVICE_ACTIONS,
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });

    try {
      const context = await patientContextStore.refresh();
      const memberOptions = context.members.map((member) => member.name + '（' + patientContextService.getRelationLabel(member.relation) + '）');
      const memberIndex = Math.max(0, context.members.findIndex((member) => String(member.id) === String(context.currentPatientId)));
      const treatmentResponse = await api.getTreatmentRecord(
        context.currentPatientId ? { patientId: context.currentPatientId, _t: Date.now() } : { _t: Date.now() },
      );
      const deviceSummary = buildDeviceSummary(unwrapObject(treatmentResponse));

      this.setData({
        loading: false,
        memberOptions,
        memberIndex,
        selectedMemberLabel: memberOptions[memberIndex] || '请选择就诊人',
        currentPatientName: context.currentMember ? context.currentMember.name || '' : '',
        currentPatientRelation: context.currentMember ? patientContextService.getRelationLabel(context.currentMember.relation) : '',
        currentPatientCard: context.currentMember ? (context.currentMember.medicalCardNo || context.currentMember.medical_record_no || '') : '',
        deviceSummary,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载阻鼾器管理失败',
        deviceSummary: null,
      });
    }
  },

  async handleMemberChange(event) {
    const memberIndex = Number(event.detail.value || 0);
    const selectedMember = patientContextStore.selectMemberByIndex(memberIndex);
    if (!selectedMember) {
      return;
    }
    await this.loadPage();
  },

  openEntry(event) {
    const url = event.currentTarget.dataset.url;
    if (!url || !this.data.deviceSummary) {
      return;
    }
    wx.navigateTo({ url });
  },
});
