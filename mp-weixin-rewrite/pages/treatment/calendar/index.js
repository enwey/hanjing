const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');

function buildMonthText(date) {
  return date.getFullYear() + '年' + (date.getMonth() + 1) + '月';
}

function buildMonthDateText(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

const PAIN_LOCATION_OPTIONS = [
  { key: 'left-molar', label: '上/下颌左大牙齿内侧、外侧' },
  { key: 'right-molar', label: '上/下颌右大牙齿内侧、外侧' },
  { key: 'upper-front', label: '上颌门牙齿内侧、外侧' },
  { key: 'lower-front', label: '下颌门牙齿内侧、外侧' },
  { key: 'upper-left-joint', label: '上颌左关节痛' },
  { key: 'lower-right-joint', label: '下颌右关节痛' },
  { key: 'bite-surface', label: '咬合面痛' },
  { key: 'fracture', label: '上/下断裂' },
];

function mapComfortToPainScore(comfort) {
  const value = Number(comfort || 0);
  if (value >= 5) {
    return 0;
  }
  if (value === 4) {
    return 2;
  }
  if (value === 3) {
    return 4;
  }
  if (value === 2) {
    return 6;
  }
  if (value === 1) {
    return 8;
  }
  return 0;
}

function mapPainScoreToComfort(score) {
  const value = Number(score || 0);
  if (value <= 0) return 5;
  if (value <= 2) return 4;
  if (value <= 4) return 3;
  if (value <= 7) return 2;
  return 1;
}

function parsePainScoreFromNote(note) {
  const matched = String(note || '').match(/VAS评分：(\d+)分/);
  if (!matched) {
    return null;
  }
  const value = Number(matched[1]);
  return Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : null;
}

function resolvePainScore(record) {
  if (!record) {
    return 0;
  }
  if (record.painScore !== undefined && record.painScore !== null && record.painScore !== '') {
    return Number(record.painScore);
  }
  const parsed = parsePainScoreFromNote(record.note);
  if (parsed !== null) {
    return parsed;
  }
  return mapComfortToPainScore(record.comfort);
}

function calcAveragePainScore(records) {
  const validRecords = (records || []).filter((record) => record && Number(record.wearDuration || 0) > 0);
  if (!validRecords.length) {
    return '0';
  }
  const total = validRecords.reduce((sum, record) => sum + resolvePainScore(record), 0);
  const average = total / validRecords.length;
  return Number.isInteger(average) ? String(average) : average.toFixed(1);
}

function buildPainLocationOptions(selectedKeys) {
  const selectedMap = {};
  (selectedKeys || []).forEach((key) => {
    selectedMap[key] = true;
  });
  return PAIN_LOCATION_OPTIONS.map((item) => ({
    ...item,
    selected: !!selectedMap[item.key],
  }));
}

function resolvePainLocationKeys(record) {
  const locations = record && Array.isArray(record.painLocations) ? record.painLocations : [];
  return PAIN_LOCATION_OPTIONS
    .filter((option) => locations.indexOf(option.label) >= 0 || locations.indexOf(option.key) >= 0)
    .map((option) => option.key);
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
    selectedPainScore: 2,
    painLocationOptions: buildPainLocationOptions([]),
    selectedPainLocationKeys: [],
    selectedPainLocationLabels: [],
    checkinNote: '',
    durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    painScoreOptions: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
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
        painScore: record.painScore === undefined || record.painScore === null ? null : Number(record.painScore),
        painLocations: Array.isArray(record.painLocations) ? record.painLocations : [],
        note: record.note || '',
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
          avgComfort: calcAveragePainScore(recordList),
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
      const painScore = resolvePainScore(record);
      cells.push({
        id: dateText,
        day: String(day),
        wearDurationLabel: wearDuration > 0 ? wearDuration + 'h' : '',
        dayClass: this.getDayClass(dateText, wearDuration, painScore, today),
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ id: 'empty-end-' + cells.length, isEmpty: true });
    }
    return cells;
  },

  getDayClass(dateText, wearDuration, painScore, today) {
    if (!wearDuration) {
      return dateText === today ? 'calendar-day--today' : '';
    }
    if (painScore <= 0) return 'calendar-day--pain0';
    if (painScore <= 3) return 'calendar-day--pain-mild';
    if (painScore <= 6) return 'calendar-day--pain-moderate';
    return 'calendar-day--pain-severe';
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
    const selectedPainScore = todayRecord ? resolvePainScore(todayRecord) : 2;
    const selectedPainLocationKeys = resolvePainLocationKeys(todayRecord);
    const selectedPainLocationLabels = PAIN_LOCATION_OPTIONS
      .filter((option) => selectedPainLocationKeys.indexOf(option.key) >= 0)
      .map((option) => option.label);
    this.setData({
      checkinVisible: true,
      selectedWearDuration,
      selectedPainScore,
      selectedComfort: todayRecord && todayRecord.comfort ? Number(todayRecord.comfort) : mapPainScoreToComfort(selectedPainScore),
      painLocationOptions: buildPainLocationOptions(selectedPainLocationKeys),
      selectedPainLocationKeys,
      selectedPainLocationLabels,
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

  handlePainScoreTap(event) {
    const value = Number(event.currentTarget.dataset.value || 0);
    this.setData({
      selectedPainScore: value,
      selectedComfort: mapPainScoreToComfort(value),
    });
  },

  handlePainLocationTap(event) {
    const key = String(event.currentTarget.dataset.key || '');
    const option = PAIN_LOCATION_OPTIONS.find((item) => item.key === key);
    if (!option) return;
    const keys = this.data.selectedPainLocationKeys.slice();
    const labels = this.data.selectedPainLocationLabels.slice();
    const index = keys.indexOf(key);
    if (index >= 0) {
      keys.splice(index, 1);
      labels.splice(index, 1);
    } else {
      keys.push(key);
      labels.push(option.label);
    }
    this.setData({
      selectedPainLocationKeys: keys,
      selectedPainLocationLabels: labels,
      painLocationOptions: buildPainLocationOptions(keys),
    });
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
        painScore: this.data.selectedPainScore,
        painLocations: this.data.selectedPainLocationLabels,
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
