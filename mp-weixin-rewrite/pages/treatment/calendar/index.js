const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');

function buildMonthText(date) {
  return date.getFullYear() + '年' + (date.getMonth() + 1) + '月';
}

function buildMonthDateText(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

Page({
  data: {
    loading: true,
    loadError: '',
    monthText: '',
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
    dayCells: [],
    monthStats: {
      worn: '0',
      avgHours: '0',
      avgComfort: '0',
      streak: '0',
    },
  },

  onLoad() {
    this.currentMonth = new Date();
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
      const recordList = ((wearingRecordsResponse && wearingRecordsResponse.data) || wearingRecordsResponse || []).map((record) => ({
        date: record.date,
        wearDuration: Number(record.wearDuration || 0),
        comfort: Number(record.comfort || 0),
      }));
      const recordMap = {};
      recordList.forEach((record) => {
        if (record.date) {
          recordMap[record.date] = record;
        }
      });
      const summary = (wearingSummaryResponse && wearingSummaryResponse.data) || wearingSummaryResponse || {};

      this.setData({
        loading: false,
        monthText: buildMonthText(this.currentMonth),
        dayCells: this.buildDayCells(recordMap),
        monthStats: {
          worn: String(summary.weekWorn || summary.wornDays || 0),
          avgHours: String(summary.weekAvg || summary.avgDuration || 0),
          avgComfort: String(summary.avgComfort || 0),
          streak: String(summary.streak || 0),
        },
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载打卡日历失败',
      });
    }
  },

  buildDayCells(recordMap) {
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();
    const today = buildMonthDateText(new Date()) + '-' + String(new Date().getDate()).padStart(2, '0');
    const cells = [];

    for (let index = 0; index < firstWeekday; index += 1) {
      cells.push({ id: 'empty-start-' + index, isEmpty: true });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const dateText = buildMonthDateText(this.currentMonth) + '-' + String(day).padStart(2, '0');
      const record = recordMap[dateText] || null;
      const wearDuration = record ? record.wearDuration : 0;
      const comfort = record ? record.comfort : 0;
      cells.push({
        id: dateText,
        day: String(day),
        wearDurationLabel: wearDuration > 0 ? wearDuration + 'h' : '',
        dayClass: this.getDayClass(dateText, wearDuration, comfort, today),
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ id: 'empty-end-' + cells.length, isEmpty: true });
    }
    return cells;
  },

  getDayClass(dateText, wearDuration, comfort, today) {
    if (!wearDuration) {
      return dateText === today ? 'calendar-day--today' : '';
    }
    if (comfort >= 5) return 'calendar-day--comfort5';
    if (comfort === 4) return 'calendar-day--comfort4';
    if (comfort === 3) return 'calendar-day--comfort3';
    if (comfort === 2) return 'calendar-day--comfort2';
    return 'calendar-day--comfort1';
  },

  async goPrevMonth() {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, 1);
    await this.loadPage();
  },

  async goNextMonth() {
    this.currentMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 1);
    await this.loadPage();
  },
});
