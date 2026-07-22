const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');
const patientContextService = require('../../../services/patient-context-service');

const RECORD_TYPE_MAP = {
  first: { label: '初诊', color: '#3b6bf5' },
  followup: { label: '复诊', color: '#1a9d5c' },
  adjust: { label: '调整', color: '#f59e0b' },
};

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

function normalizeRecord(record) {
  const typeMeta = RECORD_TYPE_MAP[record.type] || RECORD_TYPE_MAP.first;
  return {
    id: String(record.id || ''),
    patientName: record.patientName || '',
    visitDate: record.visitDate || '',
    doctorName: record.doctorName || '',
    hospital: record.hospital || record.storeName || '',
    diagnosis: record.diagnosis || '',
    prescription: record.prescription || '',
    note: record.note || '',
    typeLabel: typeMeta.label,
    typeColor: typeMeta.color,
    typeBackground: typeMeta.color + '18',
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    memberOptions: [],
    memberIndex: 0,
    selectedPatientId: '',
    selectedMemberLabel: '请选择就诊人',
    selectedPatientCard: '',
    records: [],
    summary: {
      totalCount: '0',
      latestVisitLabel: '',
      doctorCount: '0',
    },
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const context = await patientContextStore.refresh();
      const memberOptions = context.members.map((member) => member.name + '（' + patientContextService.getRelationLabel(member.relation) + '）');
      const memberIndex = Math.max(
        0,
        context.members.findIndex((member) => String(member.id) === String(context.currentPatientId)),
      );
      const recordsResponse = await api.getMedicalRecords(
        context.currentPatientId ? { patientId: context.currentPatientId } : {},
      );
      const records = unwrapList(recordsResponse).map(normalizeRecord);
      const doctorSet = new Set(records.map((record) => record.doctorName).filter(Boolean));
      const latestVisitLabel = records.length ? records[0].visitDate || '' : '';

      this.setData({
        loading: false,
        memberOptions,
        memberIndex,
        selectedPatientId: context.currentPatientId,
        selectedMemberLabel: memberOptions[memberIndex] || '请选择就诊人',
        selectedPatientCard: context.currentMember
          ? context.currentMember.medicalCardNo || context.currentMember.medical_record_no || ''
          : '',
        records,
        summary: {
          totalCount: String(records.length),
          latestVisitLabel,
          doctorCount: String(doctorSet.size),
        },
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载病历档案失败',
        records: [],
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
});
