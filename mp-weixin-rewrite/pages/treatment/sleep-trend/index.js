const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');
const patientContextService = require('../../../services/patient-context-service');

Page({
  data: {
    loading: true,
    loadError: '',
    selectedRange: 'week',
    chartItems: [],
    wornDaysLabel: '',
    avgDurationLabel: '',
    complianceLabel: '',
    maxDurationLabel: '',
    currentPatientLabel: '',
    hasRealData: false,
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const context = await patientContextStore.refresh();
      const params = context.currentPatientId ? { patientId: context.currentPatientId, _t: Date.now() } : { _t: Date.now() };
      const [wearingRecordsResponse, wearingSummaryResponse] = await Promise.all([
        api.getWearingRecords(params),
        api.getWearingSummary(params),
      ]);
      this.rawRecords = ((wearingRecordsResponse && wearingRecordsResponse.data) || wearingRecordsResponse || []).map((record) => ({
        dateLabel: String(record.date || '').slice(5),
        duration: Number(record.wearDuration || 0),
        comfort: Number(record.comfort || 0),
      }));
      this.wearingSummary = (wearingSummaryResponse && wearingSummaryResponse.data) || wearingSummaryResponse || null;
      this.setData({
        currentPatientLabel: context.currentMember
          ? (context.currentMember.name || '') + '（' + patientContextService.getRelationLabel(context.currentMember.relation) + '）'
          : '',
      });
      this.refreshChart('week');
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载睡眠趋势失败',
      });
    }
  },

  refreshChart(selectedRange) {
    const sourceRecords = selectedRange === 'week' ? this.rawRecords.slice(0, 7) : this.rawRecords.slice();
    const maxDuration = sourceRecords.reduce((maxValue, item) => Math.max(maxValue, Number(item.duration || 0)), 0);
    const chartItems = sourceRecords.reverse().map((record) => ({
      dateLabel: record.dateLabel,
      durationLabel: record.duration > 0 ? String(record.duration) : '',
      barHeight: record.duration > 0 ? Math.max((record.duration / Math.max(1, maxDuration)) * 120, 6) + 'px' : '6px',
      barColor: record.duration >= 7 ? '#22c55e' : record.duration >= 5 ? '#eab308' : record.duration > 0 ? '#ef4444' : '#e5e7eb',
      comfortDots: [1, 2, 3, 4, 5].map((dot) => ({ active: record.comfort > 0 && dot <= record.comfort })),
      comfortEmpty: record.comfort <= 0,
    }));
    const summary = this.wearingSummary || {};

    this.setData({
      loading: false,
      selectedRange,
      chartItems,
      wornDaysLabel: selectedRange === 'week' ? String(summary.weekWorn || '') : String(summary.wornDays || ''),
      avgDurationLabel: selectedRange === 'week' ? String(summary.weekAvg || '') : String(summary.avgDuration || ''),
      complianceLabel: summary.compliance || '',
      maxDurationLabel: maxDuration > 0 ? maxDuration.toFixed(1) + 'h' : '',
      hasRealData: chartItems.length > 0,
    });
  },

  switchToWeek() {
    this.refreshChart('week');
  },

  switchToMonth() {
    this.refreshChart('month');
  },

  openCalendar() {
    wx.navigateTo({ url: '/pages/treatment/calendar/index' });
  },
});
