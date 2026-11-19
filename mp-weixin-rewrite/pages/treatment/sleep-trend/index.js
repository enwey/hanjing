const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');
const patientContextService = require('../../../services/patient-context-service');

function formatLocalDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

function mapComfortToPainScore(comfort) {
  const value = Number(comfort || 0);
  if (value >= 5) return 0;
  if (value === 4) return 2;
  if (value === 3) return 4;
  if (value === 2) return 6;
  if (value === 1) return 8;
  return 0;
}

function resolvePainScore(record) {
  if (record && record.painScore !== undefined && record.painScore !== null && record.painScore !== '') {
    return Number(record.painScore);
  }
  return mapComfortToPainScore(record && record.comfort);
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
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
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  clearPatientData(patientId) {
    if (this._loadedPatientId === patientId) return;
    this.rawRecords = [];
    this.wearingSummary = null;
    this.setData({
      hasLoaded: false, loading: true, loadError: '',
      chartItems: [], currentPatientLabel: '', hasRealData: false,
      wornDaysLabel: '', avgDurationLabel: '', complianceLabel: '', maxDurationLabel: '',
    });
  },

  async loadPage(options = {}) {
    const version = this._loadVersion = (this._loadVersion || 0) + 1;
    this.clearPatientData(patientContextStore.state.currentPatientId);
    const silent = !!options.silent && this.data.hasLoaded;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
    try {
      const context = await patientContextStore.refresh();
      if (version !== this._loadVersion) return;
      const patientId = context.currentPatientId;
      this.clearPatientData(patientId);
      const params = context.currentPatientId ? { patientId: context.currentPatientId, _t: Date.now() } : { _t: Date.now() };
      const [wearingRecordsResponse, wearingSummaryResponse] = await Promise.all([
        api.getWearingRecords(params),
        api.getWearingSummary(params),
      ]);
      if (version !== this._loadVersion || patientId !== (patientContextStore.state.currentPatientId)) return;
      this._loadedPatientId = patientId;
      this.rawRecords = ((wearingRecordsResponse && wearingRecordsResponse.data) || wearingRecordsResponse || []).map((record) => ({
        date: String(record.date || '').slice(0, 10),
        dateLabel: String(record.date || '').slice(5),
        duration: Number(record.wearDuration || 0),
        comfort: Number(record.comfort || 0),
        painScore: resolvePainScore(record),
      }));
      this.wearingSummary = (wearingSummaryResponse && wearingSummaryResponse.data) || wearingSummaryResponse || null;
      this.setData({
        hasLoaded: true,
        loadError: '',
        currentPatientLabel: context.currentMember
          ? (context.currentMember.name || '') + '（' + patientContextService.getRelationLabel(context.currentMember.relation) + '）'
          : '',
      });
      this.refreshChart(this.data.selectedRange);
    } catch (error) {
      if (version !== this._loadVersion) return;
      this.clearPatientData(patientContextStore.state.currentPatientId);
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载睡眠趋势失败',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载睡眠趋势失败', icon: 'none' });
    }
  },

  refreshChart(selectedRange) {
    const today = new Date();
    const todayText = formatLocalDate(today);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    const weekStartText = formatLocalDate(weekStart);
    const monthPrefix = todayText.slice(0, 7) + '-';
    const sourceRecords = selectedRange === 'week'
      ? this.rawRecords.filter((record) => record.date >= weekStartText && record.date <= todayText)
      : this.rawRecords.filter((record) => record.date.startsWith(monthPrefix));
    const monthWorn = selectedRange === 'month' ? sourceRecords.filter((record) => record.duration > 0) : [];
    const monthAvg = monthWorn.length
      ? Math.round(monthWorn.reduce((sum, record) => sum + record.duration, 0) / monthWorn.length * 10) / 10
      : 0;
    const maxDuration = sourceRecords.reduce((maxValue, item) => Math.max(maxValue, Number(item.duration || 0)), 0);
    const chartItems = sourceRecords.reverse().map((record) => ({
      dateLabel: record.dateLabel,
      durationLabel: record.duration > 0 ? String(record.duration) : '',
      barHeight: record.duration > 0 ? Math.max((record.duration / Math.max(1, maxDuration)) * 120, 6) + 'px' : '6px',
      barColor: record.duration >= 7 ? '#22c55e' : record.duration >= 5 ? '#eab308' : record.duration > 0 ? '#ef4444' : '#e5e7eb',
      comfortDots: [0, 1, 2, 3].map((dot) => ({ active: record.duration > 0 && dot <= Math.ceil(record.painScore / 3) })),
      comfortEmpty: record.duration <= 0,
    }));
    const summary = this.wearingSummary || {};
    const compliance = selectedRange === 'week'
      ? Number(summary.weekCompliance != null ? summary.weekCompliance : 0)
      : Math.round(monthWorn.length / today.getDate() * 100);

    this.setData({
      loading: false,
      selectedRange,
      chartItems,
      wornDaysLabel: selectedRange === 'week' ? String(summary.weekWorn || '') : String(monthWorn.length),
      avgDurationLabel: selectedRange === 'week' ? String(summary.weekAvg || '') : String(monthAvg),
      complianceLabel: selectedRange === 'month' ? String(compliance) : String(compliance || ''),
      maxDurationLabel: maxDuration > 0 ? maxDuration.toFixed(1) + 'h' : '',
      hasRealData: this.rawRecords.length > 0,
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
