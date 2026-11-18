const api = require('../../api/index');
const sessionStore = require('../../stores/session-store');
const { parseAppointmentTimestamp, RESCHEDULE_LIMIT_HOURS } = require('../../common/utils/appointment-time');

const RESCHEDULABLE_STATUSES = ['pending_payment', 'pending', 'confirmed'];

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
    rescheduleCompleted: false,
    loading: true,
    loadError: '',
    canRetryLoad: false,
  },

  onLoad(options) {
    this.options = options || {};
    this.hasLoaded = false;
    this.loadPage({ silent: false });
  },

  async onShow() {
    if (!this.hasLoaded || (this.data.rescheduleCompleted && this.ownerGeneration === sessionStore.getLoginGeneration())) {
      return;
    }
    await this.loadPage({ silent: true });
  },

  onUnload() {
    this._unloaded = true;
    this.pageRequestId = (this.pageRequestId || 0) + 1;
    this.schedulesRequestId = (this.schedulesRequestId || 0) + 1;
    this.slotsRequestId = (this.slotsRequestId || 0) + 1;
    if (this.returnTimer) clearTimeout(this.returnTimer);
  },

  clearScheduleSelection() {
    this.setData({ schedules: [], timeSlots: [], selectedScheduleId: '',
      selectedTimeSlotId: '', selectedTimeSlotLabel: '' });
  },

  retryLoad() {
    if (this.data.canRetryLoad && !this.data.loading) return this.loadPage({ silent: true });
  },

  async loadPage(options = {}) {
    if (this._unloaded) return;
    const generation = sessionStore.getLoginGeneration();
    if (this.ownerGeneration !== generation) {
      this.ownerGeneration = generation;
      this.rescheduleFlight = null;
      this.clearScheduleSelection();
      this.setData({ selectedDate: '', scheduleDates: [], submitting: false, rescheduleCompleted: false });
    }
    if (this.data.submitting || this.data.rescheduleCompleted) return;
    const requestId = this.pageRequestId = (this.pageRequestId || 0) + 1;
    const isCurrent = () => !this._unloaded && requestId === this.pageRequestId && generation === sessionStore.getLoginGeneration();
    this.schedulesRequestId = (this.schedulesRequestId || 0) + 1;
    this.slotsRequestId = (this.slotsRequestId || 0) + 1;
    const silent = Boolean(options.silent);
    const appointmentId = String((this.options && this.options.id) || '');
    this.refreshingAppointment = true;
    this.setData({
      loading: true,
      loadError: '',
      canRetryLoad: false,
      appointmentId,
    });
    try {
      const detailResponse = await api.getAppointmentDetail(appointmentId);
      if (!isCurrent()) return;
      const detail = unwrapObject(detailResponse);
      const appointment = detail.appointment || {};
      const doctorId = String(appointment.doctorId || (this.options && this.options.doctorId) || '');
      const storeId = String(appointment.storeId || (this.options && this.options.storeId) || '');
      this.originalDate = appointment.appointmentDate || '';
      this.originalTime = appointment.appointmentTime || '';
      this.originalTimestamp = parseAppointmentTimestamp(this.originalDate, this.originalTime);
      if (appointment.status && !RESCHEDULABLE_STATUSES.includes(appointment.status)) {
        this.clearScheduleSelection();
        this.setData({ loading: false, selectedDate: '', scheduleDates: [],
          loadError: '当前预约状态不支持改约' });
        this.hasLoaded = true;
        return;
      }

      const scheduleDatesResponse = await api.getScheduleDates({ doctorId, storeId });
      if (!isCurrent()) return;
      const scheduleDates = unwrapList(scheduleDatesResponse);
      const selectedDate = silent && scheduleDates.includes(this.data.selectedDate)
        ? this.data.selectedDate
        : resolveDefaultSelectedDate(scheduleDates, this.originalDate);
      if (selectedDate !== this.data.selectedDate) this.clearScheduleSelection();
      this.setData({
        appointmentId,
        doctorId,
        storeId,
        scheduleDates,
        selectedDate,
      });
      if (selectedDate) {
        await this.loadSchedulesForDate(selectedDate, { silent });
      } else {
        this.clearScheduleSelection();
        this.setData({ loading: false });
      }
      if (!isCurrent()) return;
      this.hasLoaded = true;
    } catch (error) {
      if (!isCurrent()) return;
      this.setData({
        loading: false,
        canRetryLoad: true,
        loadError: (error && error.message) || '加载改约信息失败',
      });
    } finally {
      if (isCurrent()) this.refreshingAppointment = false;
    }
  },

  async loadSchedulesForDate(selectedDate, options = {}) {
    if (this._unloaded || this.data.submitting || this.data.rescheduleCompleted) return;
    const requestId = this.schedulesRequestId = (this.schedulesRequestId || 0) + 1;
    const generation = sessionStore.getLoginGeneration();
    const isCurrent = () => !this._unloaded && requestId === this.schedulesRequestId && generation === sessionStore.getLoginGeneration();
    this.slotsRequestId = (this.slotsRequestId || 0) + 1;
    const silent = Boolean(options.silent);
    this.setData({
      loading: true,
      loadError: '',
      canRetryLoad: false,
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
      if (!isCurrent()) return;
      const schedules = unwrapList(response).map(normalizeSchedule);
      this.setData({ schedules });
      const nextSelectedSchedule =
        schedules.find((item) => item.id === this.data.selectedScheduleId && !item.disabled) ||
        schedules.find((item) => !item.disabled);
      if (nextSelectedSchedule) {
        await this.selectSchedule(nextSelectedSchedule.id, { silent });
      } else {
        this.clearScheduleSelection();
        this.setData({ loading: false });
      }
    } catch (error) {
      if (!isCurrent()) return;
      this.clearScheduleSelection();
      this.setData({
        loading: false,
        canRetryLoad: true,
        loadError: (error && error.message) || '加载排班失败',
      });
    }
  },

  async selectDate(event) {
    if (this.refreshingAppointment || this.data.submitting || this.data.rescheduleCompleted) return;
    const selectedDate = String((event && event.detail) || event.currentTarget.dataset.date || '');
    if (!selectedDate || selectedDate === this.data.selectedDate) return;
    this.pageRequestId = (this.pageRequestId || 0) + 1;
    await this.loadSchedulesForDate(selectedDate, { silent: false });
  },

  async selectSchedule(scheduleId, options = {}) {
    if (this._unloaded || this.data.submitting || this.data.rescheduleCompleted) return;
    const silent = Boolean(options.silent);
    const selectedSchedule = this.data.schedules.find((item) => item.id === scheduleId);
    if (!selectedSchedule || selectedSchedule.disabled) return;
    const requestId = this.slotsRequestId = (this.slotsRequestId || 0) + 1;
    const generation = sessionStore.getLoginGeneration();
    const isCurrent = () => !this._unloaded && requestId === this.slotsRequestId && generation === sessionStore.getLoginGeneration();
    this.setData({
      selectedScheduleId: scheduleId,
      loading: true,
      timeSlots: silent ? this.data.timeSlots : [],
      selectedTimeSlotId: silent ? this.data.selectedTimeSlotId : '',
      selectedTimeSlotLabel: silent ? this.data.selectedTimeSlotLabel : '',
    });
    try {
      const response = await api.getTimeSlots(scheduleId);
      if (!isCurrent()) return;
      const nextTimeSlots = unwrapList(response).map(normalizeTimeSlot);
      const keepSelected = nextTimeSlots.find((item) => item.id === this.data.selectedTimeSlotId && item.selectable);
      this.setData({
        loading: false,
        timeSlots: nextTimeSlots,
        selectedTimeSlotId: keepSelected ? keepSelected.id : '',
        selectedTimeSlotLabel: keepSelected ? keepSelected.label : '',
      });
    } catch (error) {
      if (!isCurrent()) return;
      this.setData({ loading: false, canRetryLoad: true, timeSlots: [], selectedTimeSlotId: '', selectedTimeSlotLabel: '',
        loadError: (error && error.message) || '加载时段失败' });
      wx.showToast({ title: (error && error.message) || '加载时段失败', icon: 'none' });
    }
  },

  async tapSchedule(event) {
    await this.selectSchedule(String(event.currentTarget.dataset.scheduleId || ''), { silent: false });
  },

  selectTimeSlot(event) {
    const timeSlotId = String(event.currentTarget.dataset.timeSlotId || '');
    const timeSlot = this.data.timeSlots.find((item) => item.id === timeSlotId);
    if (!timeSlot || !timeSlot.selectable || this.data.submitting || this.data.rescheduleCompleted || this.data.loading) return;
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
    if (this._unloaded || this.data.submitting || this.data.rescheduleCompleted) return;
    const generation = sessionStore.getLoginGeneration();
    if ((this.ownerGeneration !== undefined && this.ownerGeneration !== generation) || !sessionStore.isLoggedIn()) return;
    const selectedSchedule = this.data.schedules.find((item) => item.id === this.data.selectedScheduleId);
    const selectedSlot = this.data.timeSlots.find((item) => item.id === this.data.selectedTimeSlotId && item.selectable && item.label === this.data.selectedTimeSlotLabel);
    if (this.data.loading || this.data.loadError || !this.data.selectedDate || !this.data.scheduleDates.includes(this.data.selectedDate) ||
        !selectedSchedule || selectedSchedule.disabled || !selectedSlot) {
      wx.showToast({ title: '请选择时段', icon: 'none' });
      return;
    }
    if (this.originalTimestamp != null && this.originalTimestamp - Date.now() < RESCHEDULE_LIMIT_HOURS * 60 * 60 * 1000) {
      wx.showToast({ title: '距离预约时间已不足2小时，不支持改约', icon: 'none' });
      return;
    }
    const flight = {};
    this.rescheduleFlight = flight;
    const isCurrent = () => !this._unloaded && this.rescheduleFlight === flight &&
      generation === sessionStore.getLoginGeneration() && sessionStore.isLoggedIn();
    const appointmentId = this.data.appointmentId;
    const appointmentDate = this.data.selectedDate;
    const appointmentTime = selectedSlot.label;
    if (
      this.originalDate &&
      this.originalTime &&
      this.data.selectedDate === this.originalDate &&
      String(this.data.selectedTimeSlotLabel).replace(/\s+/g, '') === String(this.originalTime).replace(/\s+/g, '')
    ) {
      wx.showToast({ title: '不能选择相同的就诊时段', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await api.rescheduleAppointment(appointmentId, {
        scheduleId: selectedSchedule.id,
        appointmentDate,
        appointmentTime,
      });
      if (!isCurrent()) return;
      this.setData({ rescheduleCompleted: true });
      wx.showToast({ title: '改约成功', icon: 'success' });
      this.returnTimer = setTimeout(() => {
        if (!isCurrent() || !this.data.rescheduleCompleted) return;
        wx.navigateBack({ delta: 1 });
      }, 1500);
    } catch (error) {
      if (!isCurrent()) return;
      wx.showToast({ title: (error && error.message) || '改约失败', icon: 'none' });
    } finally {
      if (isCurrent() && !this.data.rescheduleCompleted) this.setData({ submitting: false });
    }
  },
});
