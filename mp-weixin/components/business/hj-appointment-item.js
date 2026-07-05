"use strict";
const t = require("../../common/vendor.js"),
  e = require("../../api/types.js");

let bookingSettingsCache = null;
let bookingSettingsPromise = null;

async function getSharedCancelLimitMs() {
  if (bookingSettingsCache !== null) {
    return bookingSettingsCache;
  }
  if (!bookingSettingsPromise) {
    const api = require("../../api/index.js");
    bookingSettingsPromise = api.getBookingSettings().then(res => {
      let limitText = "就诊前2小时";
      if (res && res.data && res.data.cancelLimit) {
        limitText = res.data.cancelLimit;
      }
      const hourMatch = limitText.match(/(\d+(?:\.\d+)?)\s*小时/);
      if (hourMatch) return Number(hourMatch[1]) * 60 * 60 * 1000;
      const minuteMatch = limitText.match(/(\d+(?:\.\d+)?)\s*分钟/);
      if (minuteMatch) return Number(minuteMatch[1]) * 60 * 1000;
      const dayMatch = limitText.match(/(\d+(?:\.\d+)?)\s*天/);
      if (dayMatch) return Number(dayMatch[1]) * 24 * 60 * 60 * 1000;
      return 2 * 60 * 60 * 1000;
    }).catch(() => {
      return 2 * 60 * 60 * 1000;
    });
  }
  const limitMs = await bookingSettingsPromise;
  bookingSettingsCache = limitMs;
  return limitMs;
}

Math || n();
const n = () => "../base/hj-tag.js",
  p = t.defineComponent({
    __name: "hj-appointment-item",
    props: { appointment: {}, storeName: {}, doctorName: {} },
    emits: ["click", "cancel", "reschedule"],
    setup(n) {
      const p = n,
        statusInfo =
          e.AppointmentStatusMap[p.appointment.status] ||
          e.AppointmentStatusMap.pending,
        typeLabel = e.AppointmentTypeMap[p.appointment.type] || p.appointment.type;

      const cancelLimitMs = t.ref(2 * 60 * 60 * 1000);
      t.onMounted(async () => {
        cancelLimitMs.value = await getSharedCancelLimitMs();
      });

      const canCancelOrReschedule = t.computed(() => {
        if (!p.appointment) return false;
        if (['arrived', 'cancelled', 'no_show', 'completed', 'confirmed', 'reminded', 'checked_in'].includes(p.appointment.status)) {
          return false;
        }
        if (p.appointment.status === 'pending_payment') {
          return true;
        }
        try {
          const [year, month, day] = p.appointment.appointmentDate.split('-').map(Number);
          const [hours, minutes] = p.appointment.appointmentTime.split('-')[0].trim().split(':').map(Number);
          const apptDateTime = new Date(year, month - 1, day, hours, minutes, 0);
          const now = new Date();
          return (apptDateTime.getTime() - now.getTime()) >= cancelLimitMs.value;
        } catch (err) {
          return false;
        }
      });

      return (e, n) =>
        t.e(
          {
            a: t.t(e.appointment.appointmentNo),
            b: t.p({
              text: t.unref(statusInfo).label,
              type:
                {
                  confirmed: "primary",
                  reminded: "primary",
                  checked_in: "success",
                  completed: "default",
                  cancelled: "default",
                  no_show: "default",
                  pending: "success",
                }[p.appointment.status] || "default",
              size: "sm",
            }),
            c: t.t(e.storeName || e.appointment.storeId),
            d: t.t(e.appointment.patientName || "--"),
            e: t.t(e.doctorName || e.appointment.doctorId),
            f: t.t(e.appointment.appointmentDate),
            g: t.t(e.appointment.appointmentTime),
            h: t.t(t.unref(typeLabel)),
            i: e.appointment.symptomDesc,
            btnText: t.t(p.appointment.status === 'pending_payment' ? '支付' : '改约'),
          },
          e.appointment.symptomDesc
            ? { j: t.t(e.appointment.symptomDesc) }
            : {},
          { k: t.unref(canCancelOrReschedule) },
          t.unref(canCancelOrReschedule)
            ? {
                l: t.o((t) => e.$emit("reschedule", e.appointment), "4d"),
                m: t.o((t) => e.$emit("cancel", e.appointment), "b1"),
              }
            : {},
          { n: t.o((t) => e.$emit("click", e.appointment), "a7") },
        );
    },
  }),
  o = t._export_sfc(p, [["__scopeId", "data-v-74fd48b7"]]);
wx.createComponent(o);
