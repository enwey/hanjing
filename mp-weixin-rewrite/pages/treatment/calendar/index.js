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
    hasLoaded: false,
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
    hasMonthRecords: false,
    checkinVisible: false,
    selectedWearDuration: 7,
    selectedComfort: 4,
    checkinNote: '',
    durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    comfortOptions: [1, 2, 3, 4, 5],
    isSubmittingCheckin: false,
    durationScrollLeft: 0,
    checkinDateText: '',
  },

  onLoad() {
    this.currentMonth = new Date();
  },

  async onShow() {
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }
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
      this.wearingRecords = recordList;

      this.setData({
        hasLoaded: true,
        loading: false,
        monthText: buildMonthText(this.currentMonth),
        dayCells: this.buildDayCells(recordMap),
        hasMonthRecords: recordList.some((record) => record.date && record.date.indexOf(buildMonthDateText(this.currentMonth) + '-') === 0),
        monthStats: {
          worn: String(summary.weekWorn || summary.wornDays || 0),
          avgHours: String(summary.weekAvg || summary.avgDuration || 0),
          avgComfort: String(summary.avgComfort || 0),
          streak: String(summary.streak || 0),
        },
      });
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载打卡日历失败',
          hasMonthRecords: false,
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载打卡日历失败', icon: 'none' });
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

  openCheckinModal() {
    const todayText = this.getTodayText();
    const todayRecord = (this.wearingRecords || []).find((record) => record.date === todayText);
    const selectedWearDuration = todayRecord && todayRecord.wearDuration ? Number(todayRecord.wearDuration) : 7;
    this.setData({
      checkinVisible: true,
      selectedWearDuration,
      selectedComfort: todayRecord && todayRecord.comfort ? Number(todayRecord.comfort) : 4,
      checkinNote: todayRecord ? todayRecord.note || '' : '',
      checkinDateText: this.getCheckinDateText(),
    });
    this.scrollSelectedDurationToCenter(selectedWearDuration);
  },

  closeCheckinModal() {
    this.setData({ checkinVisible: false });
  },

  noop() {},

  handleDurationTap(event) {
    const value = Number(event.currentTarget.dataset.value || 0);
    if (!value) return;
    this.setData({ selectedWearDuration: value });
    this.scrollSelectedDurationToCenter(value);
  },

  handleComfortTap(event) {
    const value = Number(event.currentTarget.dataset.value || 0);
    if (!value) return;
    this.setData({ selectedComfort: value });
  },

  handleNoteInput(event) {
    this.setData({ checkinNote: event.detail.value || '' });
  },

  async submitCheckin() {
    if (this.data.isSubmittingCheckin) return;
    this.setData({ isSubmittingCheckin: true });
    try {
      const context = await patientContextStore.refresh();
      const params = context.currentPatientId ? { patientId: context.currentPatientId } : {};
      await api.submitWearingCheckin({
        ...params,
        date: this.getTodayText(),
        wearDuration: this.data.selectedWearDuration,
        comfort: this.data.selectedComfort,
        note: this.data.checkinNote || undefined,
      });
      wx.showToast({ title: '打卡成功', icon: 'success' });
      this.setData({ checkinVisible: false });
      await this.loadPage();
    } catch (error) {
      wx.showToast({
        title: (error && error.message) || '打卡失败',
        icon: 'none',
      });
    } finally {
      this.setData({ isSubmittingCheckin: false });
    }
  },

  getTodayText() {
    const now = new Date();
    return (
      now.getFullYear() +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0')
    );
  },

  getCheckinDateText() {
    const now = new Date();
    const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + weekLabels[now.getDay()];
  },

  scrollSelectedDurationToCenter(selectedDuration) {
    const optionValues = this.data.durationOptions || [];
    const selectedIndex = optionValues.indexOf(selectedDuration);
    if (selectedIndex < 0) {
      this.setData({ durationScrollLeft: 0 });
      return;
    }
    let windowWidth = 375;
    try {
      const systemInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      windowWidth = systemInfo.windowWidth || windowWidth;
    } catch (error) {}
    const panelHorizontalPadding = 40;
    const optionWidth = 80;
    const optionGap = 8;
    const viewportWidth = Math.max(0, windowWidth - panelHorizontalPadding);
    const scrollLeft = selectedIndex * (optionWidth + optionGap) - (viewportWidth - optionWidth) / 2;
    this.setData({ durationScrollLeft: Math.max(0, Math.round(scrollLeft)) });
  },
});
