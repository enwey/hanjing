const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');
const patientContextService = require('../../../services/patient-context-service');

function createEmptyReport() {
  return {
    hasData: false,
    compliance: 0,
    weekAvg: 0,
    avgComfort: 0,
    streak: 0,
    score: 0,
    betterThan: 0,
    trend: [],
    platformAvgDuration: 0,
    platformAvgCompliance: 0,
  };
}

function normalizeSleepReport(response) {
  const source = (response && response.data) || response || null;
  if (!source) {
    return null;
  }
  const trend = Array.isArray(source.trend)
    ? source.trend.map((item) => ({
        date: item.date || '',
        score: Number(item.score || 0),
      }))
    : [];
  const report = Object.assign(createEmptyReport(), source, {
    compliance: Number(source.compliance || 0),
    weekAvg: Number(source.weekAvg || 0),
    avgComfort: Number(source.avgComfort || 0),
    streak: Number(source.streak || 0),
    score: Number(source.score || 0),
    betterThan: Number(source.betterThan || 0),
    platformAvgDuration: Number(source.platformAvgDuration || 0),
    platformAvgCompliance: Number(source.platformAvgCompliance || 0),
    trend,
  });
  if (typeof source.hasData !== 'boolean') {
    report.hasData = Boolean(
      trend.length ||
      report.compliance > 0 ||
      report.weekAvg > 0 ||
      report.avgComfort > 0 ||
      report.streak > 0 ||
      report.score > 0,
    );
  }
  return report;
}

Page({
  data: {
    loading: true,
    loadError: '',
    selectedRange: 'week',
    report: null,
    insights: [],
    currentPatientLabel: '',
  },

  async onShow() {
    await this.loadReportData();
  },

  async loadReportData() {
    this.setData({ loading: true, loadError: '' });
    try {
      const context = await patientContextStore.refresh();
      const params = context.currentPatientId ? { patientId: context.currentPatientId, range: this.data.selectedRange, _t: Date.now() } : { range: this.data.selectedRange, _t: Date.now() };
      const response = await api.getSleepReport(params);
      const report = normalizeSleepReport(response);
      this.setData({
        loading: false,
        report,
        insights: this.buildInsights(report),
        currentPatientLabel: context.currentMember
          ? (context.currentMember.name || '') + '（' + patientContextService.getRelationLabel(context.currentMember.relation) + '）'
          : '',
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载睡眠报告失败',
        report: null,
        insights: [],
      });
    }
  },

  buildInsights(report) {
    if (!report) {
      return [];
    }
    if (!report.hasData) {
      return [{ id: 'empty', type: 'info', text: '暂无真实佩戴记录。完成每日佩戴打卡后，这里会生成睡眠健康报告。' }];
    }
    const insights = [];
    if (Number(report.compliance || 0) >= 85) {
      insights.push({ id: 'compliance-good', type: 'good', text: '佩戴依从率较高，当前治疗执行情况良好。' });
    } else if (Number(report.compliance || 0) < 60) {
      insights.push({ id: 'compliance-warn', type: 'warn', text: '佩戴依从率偏低，建议固定佩戴时间，提高连续使用天数。' });
    }
    if (Number(report.weekAvg || 0) >= 7) {
      insights.push({ id: 'duration-good', type: 'good', text: '平均佩戴时长已达到理想区间，可继续保持。' });
    } else if (Number(report.weekAvg || 0) < 5) {
      insights.push({ id: 'duration-warn', type: 'warn', text: '平均佩戴时长偏低，建议逐步延长到每晚 6 到 8 小时。' });
    }
    if (Number(report.avgComfort || 0) < 3) {
      insights.push({ id: 'comfort-warn', type: 'warn', text: '舒适度偏低，建议预约医生评估当前设备参数。' });
    }
    insights.push({ id: 'tip', type: 'info', text: '建议每周至少佩戴 6 晚，并持续观察趋势变化。' });
    return insights;
  },

  async selectDateRange(event) {
    const range = event.currentTarget.dataset.range;
    if (!range || range === this.data.selectedRange) return;
    this.setData({ selectedRange: range });
    await this.loadReportData();
  },

  goAppointment() {
    wx.switchTab({ url: '/pages/appointment/index' });
  },
});
