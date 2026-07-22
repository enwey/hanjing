const api = require('../../../../api/index');
const patientContextStore = require('../../../../stores/patient-context-store');
const patientContextService = require('../../../../services/patient-context-service');

const TYPE_MAP = {
  clean: { label: '清洁', color: '#3b6bf5' },
  repair: { label: '维修', color: '#ef4444' },
  adjust: { label: '调整', color: '#f59e0b' },
  replace: { label: '更换', color: '#1a9d5c' },
};

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function normalizeRecord(record) {
  const typeMeta = TYPE_MAP[record.type] || TYPE_MAP.clean;
  const cost = Number(record.cost || 0);
  return {
    id: String(record.id || ''),
    title: record.title || record.deviceName || typeMeta.label,
    dateLabel: record.recordDate || record.createdAt || '',
    description: record.description || record.note || '',
    operatorName: record.operatorName || record.engineerName || '',
    cost,
    costLabel: cost > 0 ? '¥' + (cost / 100).toFixed(2) : '',
    typeLabel: typeMeta.label,
    typeColor: typeMeta.color,
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    selectedMemberLabel: '',
    records: [],
    summary: {
      totalCount: '0',
      totalCostLabel: '',
      latestDateLabel: '',
    },
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const context = await patientContextStore.refresh();
      const recordsResponse = await api.getDeviceMaintenance(
        context.currentPatientId ? { patientId: context.currentPatientId, _t: Date.now() } : { _t: Date.now() },
      );
      const records = unwrapList(recordsResponse).map(normalizeRecord);
      const totalCost = records.reduce((sum, item) => sum + Number(item.cost || 0), 0);
      const latestDateLabel = records.length ? records[0].dateLabel || '' : '';

      this.setData({
        loading: false,
        selectedMemberLabel: context.currentMember ? context.currentMember.name + '（' + patientContextService.getRelationLabel(context.currentMember.relation) + '）' : '',
        records,
        summary: {
          totalCount: String(records.length),
          totalCostLabel: totalCost > 0 ? '¥' + (totalCost / 100).toFixed(2) : '',
          latestDateLabel,
        },
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载维护记录失败',
        records: [],
      });
    }
  },
});
