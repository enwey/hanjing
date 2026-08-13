const api = require('../../api/index');
const appointmentDraftStore = require('../../stores/appointment-draft-store');

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

function readString(value) {
  return value === null || value === undefined ? '' : String(value);
}

function normalizeTimeSlot(timeSlot) {
  return {
    ...timeSlot,
    id: readString(timeSlot.id),
    scheduleId: readString(timeSlot.scheduleId),
    label: timeSlot.label || '',
    status: timeSlot.status || 'disabled',
    isAvailable: timeSlot.status === 'available',
  };
}

function getTimeSlotMinutes(label) {
  const startText = readString(label).split('-')[0].trim();
  const [hour, minute] = startText.split(':').map(Number);
  if (!Number.isFinite(hour)) {
    return -1;
  }
  return hour * 60 + (Number.isFinite(minute) ? minute : 0);
}

function buildTimeSlotSections(timeSlots) {
  const morning = [];
  const afternoon = [];

  (Array.isArray(timeSlots) ? timeSlots : []).forEach((slot) => {
    const minutes = getTimeSlotMinutes(slot.label);
    if (minutes >= 0 && minutes < 12 * 60) {
      morning.push(slot);
      return;
    }
    if (minutes >= 14 * 60) {
      afternoon.push(slot);
    }
  });

  const sections = [];
  if (morning.length) {
    sections.push({ key: 'morning', title: '上午', slots: morning });
  }
  if (afternoon.length) {
    sections.push({ key: 'afternoon', title: '下午', slots: afternoon });
  }
  return sections;
}

function findTimeSlotById(timeSlotSections, timeSlotId) {
  for (const section of Array.isArray(timeSlotSections) ? timeSlotSections : []) {
    const slot = (section.slots || []).find((item) => item.id === timeSlotId);
    if (slot) {
      return slot;
    }
  }
  return null;
}

function resolveDefaultDate(scheduleDates) {
  if (!Array.isArray(scheduleDates) || !scheduleDates.length) {
    return '';
  }
  const today = new Date();
  const todayText =
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0');
  if (scheduleDates.includes(todayText)) {
    return todayText;
  }
  let nearestDate = scheduleDates[0];
  let minDiff = Infinity;
  const todayMs = new Date(todayText).getTime();
  scheduleDates.forEach((dateText) => {
    const diff = Math.abs(new Date(dateText).getTime() - todayMs);
    if (diff < minDiff) {
      minDiff = diff;
      nearestDate = dateText;
    }
  });
  return nearestDate;
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    loadingSchedules: false,
    loadError: '',
    doctorId: '',
    storeId: '',
    doctorName: '',
    scheduleDates: [],
    selectedDate: '',
    timeSlotSections: [],
  },

  onLoad(options) {
    this.options = options || {};
    this.loadPage({ silent: false });
  },

  onShow() {
    if (!this.data.hasLoaded) {
      return;
    }
    this.loadPage({ silent: true });
  },

  async loadPage(options = {}) {
    const silent = !!options.silent;
    const doctorId = readString((this.options && (this.options.doctorId || this.options.doctorid)) || '');
    const storeId = readString((this.options && (this.options.storeId || this.options.storeid)) || '');

    this.setData({
      loading: silent ? this.data.loading : true,
      loadError: silent ? this.data.loadError : '',
      doctorId,
      storeId,
      timeSlotSections: silent ? this.data.timeSlotSections : [],
    });

    if (!doctorId || !storeId) {
      this.setData({
        loading: false,
        loadError: '缺少顾问或门店信息，请重新选择预约门店和顾问',
      });
      return;
    }

    try {
      const [scheduleDatesResponse, doctorsResponse] = await Promise.all([
        api.getScheduleDates({ doctorId, storeId }),
        api.getDoctors({ id: doctorId }),
      ]);

      const scheduleDates = unwrapList(scheduleDatesResponse);
      const doctors = unwrapList(doctorsResponse);
      const doctor = doctors.find((item) => readString(item.id) === doctorId) || null;
      const selectedDate = scheduleDates.includes(this.data.selectedDate)
        ? this.data.selectedDate
        : resolveDefaultDate(scheduleDates);

      this.setData({
        hasLoaded: true,
        loading: false,
        doctorName: doctor ? doctor.name || '' : '',
        scheduleDates,
        selectedDate,
      });

      if (selectedDate) {
        await this.loadSchedulesForDate(selectedDate, { silent });
      }
    } catch (error) {
      if (!this.data.hasLoaded) {
        this.setData({
          loading: false,
          loadError: (error && error.message) || '加载可约时段失败，请稍后重试',
        });
        return;
      }
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载可约时段失败，请稍后重试', icon: 'none' });
    }
  },

  async loadSchedulesForDate(selectedDate, options = {}) {
    const silent = !!options.silent;
    this.setData({
      loadingSchedules: true,
      loadError: silent ? this.data.loadError : '',
      selectedDate,
      timeSlotSections: silent ? this.data.timeSlotSections : [],
    });

    try {
      const daySlotsResponse = await api.getDaySlots({
        doctorId: this.data.doctorId,
        storeId: this.data.storeId,
        date: selectedDate,
      });
      const timeSlots = unwrapList(daySlotsResponse).map(normalizeTimeSlot);
      const timeSlotSections = buildTimeSlotSections(timeSlots);
      this.setData({
        loadingSchedules: false,
        loadError: '',
        timeSlotSections,
      });
    } catch (error) {
      if (!silent) {
        this.setData({
          loadingSchedules: false,
          loadError: (error && error.message) || '加载当天排班失败，请稍后重试',
        });
        return;
      }
      this.setData({ loadingSchedules: false });
      wx.showToast({ title: (error && error.message) || '加载当天排班失败，请稍后重试', icon: 'none' });
    }
  },

  async handleDateSelect(event) {
    const selectedDate = event.detail || '';
    if (!selectedDate || selectedDate === this.data.selectedDate) {
      return;
    }
    await this.loadSchedulesForDate(selectedDate);
  },

  retryLoad() {
    this.loadPage({ silent: false });
  },

  handleTimeSlotTap(event) {
    const timeSlotId = readString(event.currentTarget.dataset.timeSlotId);
    const selectedTimeSlot = findTimeSlotById(this.data.timeSlotSections, timeSlotId);
    if (!selectedTimeSlot || !selectedTimeSlot.isAvailable) {
      return;
    }

    appointmentDraftStore.setDraft({
      doctorId: this.data.doctorId,
      storeId: this.data.storeId,
      doctorName: this.data.doctorName,
      appointmentDate: this.data.selectedDate,
      scheduleId: selectedTimeSlot.scheduleId,
      schedule: { id: selectedTimeSlot.scheduleId },
      timeSlot: selectedTimeSlot,
    });

    wx.navigateTo({
      url: '/pages/appointment/confirm?doctorId=' + this.data.doctorId + '&storeId=' + this.data.storeId,
    });
  },
});
