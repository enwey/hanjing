const STATUS_MAP = {
  pending_payment: { label: '待支付', tagType: 'warning' },
  pending: { label: '待确认', tagType: 'success' },
  confirmed: { label: '已确认', tagType: 'primary' },
  reminded: { label: '待就诊', tagType: 'primary' },
  checked_in: { label: '已签到', tagType: 'success' },
  completed: { label: '已完成', tagType: 'default' },
  cancelled: { label: '已取消', tagType: 'default' },
  no_show: { label: '已爽约', tagType: 'default' },
  refunded: { label: '已退款', tagType: 'default' },
};

const TYPE_MAP = {
  initial_consultation: '初诊',
  follow_up: '复诊',
  review: '复查',
  consultation: '问诊',
  treatment: '治疗',
};

function parseDateTime(appointment) {
  try {
    const dateText = String(appointment.appointmentDate || '');
    const timeText = String(appointment.appointmentTime || '').split('-')[0].trim();
    if (!dateText || !timeText) {
      return null;
    }
    const [year, month, day] = dateText.split('-').map(Number);
    const [hour, minute] = timeText.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute || 0, 0).getTime();
  } catch (error) {
    return null;
  }
}

Component({
  properties: {
    appointment: {
      type: Object,
      value: null,
    },
    storeName: {
      type: String,
      value: '',
    },
    doctorName: {
      type: String,
      value: '',
    },
    cancelLimitHours: {
      type: Number,
      value: 2,
    },
  },
  data: {
    statusLabel: '',
    statusTagType: 'default',
    typeLabel: '',
    showActions: false,
    actionButtonText: '改约',
  },
  observers: {
    'appointment, storeName, doctorName, cancelLimitHours': function syncView(appointment, storeName, doctorName, cancelLimitHours) {
      const record = appointment || {};
      const statusInfo = STATUS_MAP[record.status] || STATUS_MAP.pending;
      const showActions = this.computeShowActions(record, cancelLimitHours);
      this.setData({
        appointmentNo: record.appointmentNo || record.appointment_no || ('APT' + (record.id || '')),
        resolvedStoreName: storeName || record.storeName || record.store_name || record.storeId || record.store_id || '',
        resolvedDoctorName: doctorName || record.doctorName || record.doctor_name || record.doctorId || record.doctor_id || '',
        patientName: record.patientName || record.patient_name || '--',
        appointmentDate: record.appointmentDate || record.appointment_date || '',
        appointmentTime: record.appointmentTime || record.appointment_time || '',
        typeLabel: TYPE_MAP[record.type] || record.type || '门诊预约',
        symptomDesc: record.symptomDesc || record.symptom_desc || '',
        statusLabel: statusInfo.label,
        statusTagType: statusInfo.tagType,
        showActions,
        actionButtonText: record.status === 'pending_payment' ? '支付' : '改约',
      });
    },
  },
  methods: {
    computeShowActions(appointment, cancelLimitHours) {
      if (!appointment || !appointment.status) {
        return false;
      }
      if (appointment.status === 'pending_payment') {
        return true;
      }
      if (['arrived', 'cancelled', 'refunded', 'no_show', 'completed', 'confirmed', 'reminded', 'checked_in'].includes(appointment.status)) {
        return false;
      }
      const appointmentTime = parseDateTime(appointment);
      if (!appointmentTime) {
        return false;
      }
      return appointmentTime - Date.now() >= Number(cancelLimitHours || 2) * 60 * 60 * 1000;
    },
    handleItemTap() {
      this.triggerEvent('click', this.properties.appointment);
    },
    handleRescheduleTap() {
      this.triggerEvent('reschedule', this.properties.appointment);
    },
    handleCancelTap() {
      this.triggerEvent('cancel', this.properties.appointment);
    },
  },
});
