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

function periodLabelMap(period) {
  return {
    morning: '上午',
    afternoon: '下午',
    full_day: '全天',
  }[period] || period || '时段';
}

function normalizeSchedule(schedule) {
  const totalSlots = Number(schedule.totalSlots || 0);
  const bookedSlots = Number(schedule.bookedSlots || 0);
  return {
    ...schedule,
    id: readString(schedule.id),
    date: schedule.date || '',
    period: schedule.period || '',
    periodLabel: periodLabelMap(schedule.period),
    startTime: schedule.startTime || '',
    endTime: schedule.endTime || '',
    status: schedule.status || '',
    slotsLabel: schedule.status === 'full' ? '已约满' : '余' + Math.max(totalSlots - bookedSlots, 0) + '位',
  };
}

function normalizeTimeSlot(timeSlot) {
  return {
    ...timeSlot,
    id: readString(timeSlot.id),
    label: timeSlot.label || '',
    status: timeSlot.status || 'disabled',
    isAvailable: timeSlot.status === 'available',
  };
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
    doctorId: '',
    storeId: '',
    doctorName: '',
    scheduleDates: [],
    selectedDate: '',
    schedules: [],
    selectedScheduleId: '',
    timeSlots: [],
  },

  onLoad(options) {
    this.options = options || {};
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    const doctorId = readString((this.options && (this.options.doctorId || this.options.doctorid)) || '');
    const storeId = readString((this.options && (this.options.storeId || this.options.storeid)) || '');

    const [scheduleDatesResponse, doctorsResponse] = await Promise.all([
      api.getScheduleDates({ doctorId, storeId }),
      doctorId ? api.getDoctors({ id: doctorId }) : Promise.resolve(null),
    ]);

    const scheduleDates = unwrapList(scheduleDatesResponse);
    const doctors = unwrapList(doctorsResponse);
    const doctor = doctors.find((item) => readString(item.id) === doctorId) || null;
    const selectedDate = resolveDefaultDate(scheduleDates);

    this.setData({
      doctorId,
      storeId,
      doctorName: doctor ? doctor.name || '' : '',
      scheduleDates,
      selectedDate,
      schedules: [],
      selectedScheduleId: '',
      timeSlots: [],
    });

    if (selectedDate) {
      await this.loadSchedulesForDate(selectedDate);
    }
  },

  async loadSchedulesForDate(selectedDate) {
    const schedulesResponse = await api.getSchedules({
      doctorId: this.data.doctorId,
      storeId: this.data.storeId,
      startDate: selectedDate,
      endDate: selectedDate,
    });
    const schedules = unwrapList(schedulesResponse).map(normalizeSchedule);
    this.setData({
      selectedDate,
      schedules,
      selectedScheduleId: '',
      timeSlots: [],
    });

    const firstBookable = schedules.find((schedule) => schedule.status !== 'full');
    if (firstBookable) {
      await this.loadTimeSlots(firstBookable.id);
    }
  },

  async loadTimeSlots(scheduleId) {
    const selectedSchedule = this.data.schedules.find((schedule) => schedule.id === scheduleId);
    if (!selectedSchedule || selectedSchedule.status === 'full') {
      return;
    }
    const timeSlotsResponse = await api.getTimeSlots(scheduleId);
    this.setData({
      selectedScheduleId: scheduleId,
      timeSlots: unwrapList(timeSlotsResponse).map(normalizeTimeSlot),
    });
  },

  async handleDateSelect(event) {
    const selectedDate = event.detail || '';
    if (!selectedDate || selectedDate === this.data.selectedDate) {
      return;
    }
    await this.loadSchedulesForDate(selectedDate);
  },

  async handleScheduleTap(event) {
    const scheduleId = readString(event.currentTarget.dataset.scheduleId);
    if (!scheduleId) {
      return;
    }
    await this.loadTimeSlots(scheduleId);
  },

  handleTimeSlotTap(event) {
    const timeSlotId = readString(event.currentTarget.dataset.timeSlotId);
    const selectedSchedule = this.data.schedules.find((schedule) => schedule.id === this.data.selectedScheduleId);
    const selectedTimeSlot = this.data.timeSlots.find((timeSlot) => timeSlot.id === timeSlotId);
    if (!selectedSchedule || !selectedTimeSlot || !selectedTimeSlot.isAvailable) {
      return;
    }

    appointmentDraftStore.setDraft({
      doctorId: this.data.doctorId,
      storeId: this.data.storeId,
      doctorName: this.data.doctorName,
      appointmentDate: this.data.selectedDate,
      scheduleId: selectedSchedule.id,
      schedule: selectedSchedule,
      timeSlot: selectedTimeSlot,
    });

    wx.navigateTo({
      url: '/pages/appointment/confirm?doctorId=' + this.data.doctorId + '&storeId=' + this.data.storeId,
    });
  },
});
