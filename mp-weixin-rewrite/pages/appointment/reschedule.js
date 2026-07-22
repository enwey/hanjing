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
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    const appointmentId = String((this.options && this.options.id) || '');
    this.setData({ loading: true, loadError: '', appointmentId });
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
      const selectedDate = scheduleDates[0] || '';
      this.setData({
        appointmentId,
        doctorId,
        storeId,
        scheduleDates,
        selectedDate,
      });
      if (selectedDate) {
        await this.loadSchedulesForDate(selectedDate);
      } else {
        this.setData({ loading: false });
      }
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载改约信息失败',
      });
    }
  },

  async loadSchedulesForDate(selectedDate) {
    this.setData({
      loading: true,
      loadError: '',
      selectedDate,
      schedules: [],
      timeSlots: [],
      selectedScheduleId: '',
      selectedTimeSlotId: '',
      selectedTimeSlotLabel: '',
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
      const firstAvailable = schedules.find((item) => !item.disabled);
      if (firstAvailable) {
        await this.selectSchedule(firstAvailable.id);
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
    await this.loadSchedulesForDate(selectedDate);
  },

  async selectSchedule(scheduleId) {
    const selectedSchedule = this.data.schedules.find((item) => item.id === scheduleId);
    if (!selectedSchedule || selectedSchedule.disabled) return;
    this.setData({
      selectedScheduleId: scheduleId,
      timeSlots: [],
      selectedTimeSlotId: '',
      selectedTimeSlotLabel: '',
    });
    try {
      const response = await api.getTimeSlots(scheduleId);
      this.setData({
        loading: false,
        timeSlots: unwrapList(response).map(normalizeTimeSlot),
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: (error && error.message) || '加载时段失败', icon: 'none' });
    }
  },

  async tapSchedule(event) {
    await this.selectSchedule(String(event.currentTarget.dataset.scheduleId || ''));
  },

  selectTimeSlot(event) {
    const timeSlotId = String(event.currentTarget.dataset.timeSlotId || '');
    const timeSlot = this.data.timeSlots.find((item) => item.id === timeSlotId);
    if (!timeSlot || !timeSlot.selectable) return;
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
      wx.showToast({ title: '不能选择相同的就诊时段', icon: 'none' });
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
