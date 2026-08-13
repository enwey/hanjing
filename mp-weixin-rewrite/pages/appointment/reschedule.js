const api = require('../../api/index');

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

function normalizeSchedule(schedule) {
  return {
    id: String(schedule.id || ''),
    date: schedule.date || '',
    periodLabel: schedule.period === 'morning' ? '上午' : schedule.period === 'afternoon' ? '下午' : '全天',
    startTime: schedule.startTime || '',
    endTime: schedule.endTime || '',
    status: schedule.status || '',
    disabled: schedule.status === 'full',
  };
}

function normalizeTimeSlot(timeSlot) {
  return {
    id: String(timeSlot.id || ''),
    label: timeSlot.label || '',
    status: timeSlot.status || '',
    selectable: timeSlot.status === 'available',
  };
}

function resolveDefaultSelectedDate(scheduleDates, originalDate) {
  const normalizedOriginalDate = String(originalDate || '').slice(0, 10);
  if (normalizedOriginalDate && Array.isArray(scheduleDates) && scheduleDates.includes(normalizedOriginalDate)) {
    return normalizedOriginalDate;
  }
  return Array.isArray(scheduleDates) && scheduleDates.length ? scheduleDates[0] : '';
}

Page({
  data: {
    appointmentId: '',
    doctorId: '',
    storeId: '',
    scheduleDates: [],
    selectedDate: '',
    schedules: [],
    selectedScheduleId: '',
    timeSlots: [],
    selectedTimeSlotId: '',
    selectedTimeSlotLabel: '',
    submitting: false,
    loading: true,
    loadError: '',
  },

  onLoad(options) {
    this.options = options || {};
    this.hasLoaded = false;
    this.loadPage({ silent: false });
  },

  async onShow() {
    if (!this.hasLoaded) {
      return;
    }
    await this.loadPage({ silent: true });
  },

  async loadPage(options = {}) {
    const silent = Boolean(options.silent);
    const appointmentId = String((this.options && this.options.id) || '');
    this.setData({
      loading: silent ? this.data.loading : true,
      loadError: '',
      appointmentId,
    });
    try {
      const detailResponse = await api.getAppointmentDetail(appointmentId);
      const detail = unwrapObject(detailResponse);
      const appointment = detail.appointment || {};
      const doctorId = String(appointment.doctorId || (this.options && this.options.doctorId) || '');
      const storeId = String(appointment.storeId || (this.options && this.options.storeId) || '');
      this.originalDate = appointment.appointmentDate || '';
      this.originalTime = appointment.appointmentTime || '';

      const scheduleDatesResponse = await api.getScheduleDates({ doctorId, storeId });
      const scheduleDates = unwrapList(scheduleDatesResponse);
      const selectedDate = resolveDefaultSelectedDate(scheduleDates, this.originalDate);
      this.setData({
        loading: silent ? this.data.loading : this.data.loading,
        appointmentId,
        doctorId,
        storeId,
        scheduleDates,
        selectedDate,
      });
      if (selectedDate) {
        await this.loadSchedulesForDate(selectedDate, { silent });
      } else {
        this.setData({ loading: false });
      }
      this.hasLoaded = true;
    } catch (error) {
      this.setData({
        loading: silent ? this.data.loading : false,
        loadError: (error && error.message) || '加载改约信息失败',
      });
    }
  },

  async loadSchedulesForDate(selectedDate, options = {}) {
    const silent = Boolean(options.silent);
    this.setData({
      loading: silent ? this.data.loading : true,
      loadError: '',
      selectedDate,
      schedules: silent ? this.data.schedules : [],
      timeSlots: silent ? this.data.timeSlots : [],
      selectedScheduleId: silent ? this.data.selectedScheduleId : '',
      selectedTimeSlotId: silent ? this.data.selectedTimeSlotId : '',
      selectedTimeSlotLabel: silent ? this.data.selectedTimeSlotLabel : '',
    });
    try {
      const response = await api.getSchedules({
        doctorId: this.data.doctorId,
        storeId: this.data.storeId,
        startDate: selectedDate,
        endDate: selectedDate,
      });
      const schedules = unwrapList(response).map(normalizeSchedule);
      this.setData({ schedules });
      const nextSelectedSchedule =
        schedules.find((item) => item.id === this.data.selectedScheduleId && !item.disabled) ||
        schedules.find((item) => !item.disabled);
      if (nextSelectedSchedule) {
        await this.selectSchedule(nextSelectedSchedule.id, { silent });
      } else {
        this.setData({ loading: false });
      }
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载排班失败',
      });
    }
  },

  async selectDate(event) {
    const selectedDate = String((event && event.detail) || event.currentTarget.dataset.date || '');
    if (!selectedDate || selectedDate === this.data.selectedDate) return;
    await this.loadSchedulesForDate(selectedDate, { silent: false });
  },

  async selectSchedule(scheduleId, options = {}) {
    const silent = Boolean(options.silent);
    const selectedSchedule = this.data.schedules.find((item) => item.id === scheduleId);
    if (!selectedSchedule || selectedSchedule.disabled) return;
    this.setData({
      selectedScheduleId: scheduleId,
      timeSlots: silent ? this.data.timeSlots : [],
      selectedTimeSlotId: silent ? this.data.selectedTimeSlotId : '',
      selectedTimeSlotLabel: silent ? this.data.selectedTimeSlotLabel : '',
    });
    try {
      const response = await api.getTimeSlots(scheduleId);
      const nextTimeSlots = unwrapList(response).map(normalizeTimeSlot);
      const keepSelected = nextTimeSlots.find((item) => item.id === this.data.selectedTimeSlotId && item.selectable);
      this.setData({
        loading: false,
        timeSlots: nextTimeSlots,
        selectedTimeSlotId: keepSelected ? keepSelected.id : '',
        selectedTimeSlotLabel: keepSelected ? keepSelected.label : '',
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载时段失败', icon: 'none' });
    }
  },

  async tapSchedule(event) {
    await this.selectSchedule(String(event.currentTarget.dataset.scheduleId || ''), { silent: false });
  },

  selectTimeSlot(event) {
    const timeSlotId = String(event.currentTarget.dataset.timeSlotId || '');
    const timeSlot = this.data.timeSlots.find((item) => item.id === timeSlotId);
    if (!timeSlot || !timeSlot.selectable || this.data.submitting) return;
    if (
      this.data.selectedDate === this.originalDate &&
      String(timeSlot.label || '').replace(/\s+/g, '') === String(this.originalTime || '').replace(/\s+/g, '')
    ) {
      wx.showToast({ title: '不能选择原预约日期时段', icon: 'none' });
      return;
    }
    this.setData({
      selectedTimeSlotId: timeSlotId,
      selectedTimeSlotLabel: timeSlot.label,
    });
  },

  async submitReschedule() {
    const selectedSchedule = this.data.schedules.find((item) => item.id === this.data.selectedScheduleId);
    if (!selectedSchedule || !this.data.selectedTimeSlotLabel || this.data.submitting) {
      wx.showToast({ title: '请选择时段', icon: 'none' });
      return;
    }
    if (
      this.originalDate &&
      this.originalTime &&
      this.data.selectedDate === this.originalDate &&
      String(this.data.selectedTimeSlotLabel).replace(/\s+/g, '') === String(this.originalTime).replace(/\s+/g, '')
    ) {
      wx.showToast({ title: '不能选择相同的到店时段', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.rescheduleAppointment(this.data.appointmentId, {
        scheduleId: selectedSchedule.id,
        appointmentDate: this.data.selectedDate,
        appointmentTime: this.data.selectedTimeSlotLabel,
      });
      wx.showToast({ title: '改约成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack({ delta: 2 });
      }, 1500);
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '改约失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
