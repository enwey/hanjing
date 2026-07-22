const api = require('../../../../api/index');
const patientContextStore = require('../../../../stores/patient-context-store');
const patientContextService = require('../../../../services/patient-context-service');

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function normalizeRecord(record) {
  const wearHours = Number(record.wearDuration || record.duration || 0);
  let statusLabel = '待提升';
  let statusColor = '#ef4444';
  if (wearHours >= 6) {
    statusLabel = '达标';
    statusColor = '#1a9d5c';
  } else if (wearHours >= 4) {
    statusLabel = '接近达标';
    statusColor = '#f59e0b';
  }

  return {
    id: String(record.id || record.date || Math.random()),
    dateLabel: record.checkinDate || record.date || '',
    wearHours,
    wearHoursLabel: wearHours.toFixed(1) + '小时',
    statusLabel,
    statusColor,
    progressWidth: Math.max(10, Math.min(100, Math.round((wearHours / 8) * 100))) + '%',
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    selectedMemberLabel: '',
    summaryDays: 0,
    averageHoursLabel: '0.0小时',
    qualifiedDays: 0,
    maxHoursLabel: '0.0小时',
    records: [],
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const context = await patientContextStore.refresh();
      const recordsResponse = await api.getWearingRecords(
        context.currentPatientId ? { patientId: context.currentPatientId, _t: Date.now() } : { _t: Date.now() },
      );
      const records = unwrapList(recordsResponse).map(normalizeRecord);
      const totalHours = records.reduce((sum, item) => sum + Number(item.wearHours || 0), 0);
      const qualifiedDays = records.filter((item) => item.statusLabel === '达标').length;
      const maxHours = records.reduce((maxValue, item) => Math.max(maxValue, Number(item.wearHours || 0)), 0);

      this.setData({
        loading: false,
        selectedMemberLabel: context.currentMember ? context.currentMember.name + '（' + patientContextService.getRelationLabel(context.currentMember.relation) + '）' : '',
        records,
        summaryDays: records.length,
        averageHoursLabel: records.length ? (totalHours / records.length).toFixed(1) + '小时' : '0.0小时',
        qualifiedDays,
        maxHoursLabel: maxHours > 0 ? maxHours.toFixed(1) + '小时' : '0.0小时',
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载佩戴数据失败',
        records: [],
      });
    }
  },
});
