"use strict";
const t = require("../../common/vendor.js"),
  e = require("../../api/types.js");
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

      const canCancelOrReschedule = t.computed(() => {
        if (!p.appointment) return false;
        if (['arrived', 'cancelled', 'no_show', 'completed'].includes(p.appointment.status)) {
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
          return (apptDateTime.getTime() - now.getTime()) >= 2 * 60 * 60 * 1000;
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
            d: t.t(e.doctorName || e.appointment.doctorId),
            e: t.t(e.appointment.appointmentDate),
            f: t.t(e.appointment.appointmentTime),
            g: t.t(t.unref(typeLabel)),
            h: e.appointment.symptomDesc,
            btnText: t.t(p.appointment.status === 'pending_payment' ? '支付' : '改约'),
          },
          e.appointment.symptomDesc
            ? { i: t.t(e.appointment.symptomDesc) }
            : {},
          { j: t.unref(canCancelOrReschedule) },
          t.unref(canCancelOrReschedule)
            ? {
                k: t.o((t) => e.$emit("reschedule", e.appointment), "4d"),
                l: t.o((t) => e.$emit("cancel", e.appointment), "b1"),
              }
            : {},
          { m: t.o((t) => e.$emit("click", e.appointment), "a7") },
        );
    },
  }),
  o = t._export_sfc(p, [["__scopeId", "data-v-74fd48b7"]]);
wx.createComponent(o);
