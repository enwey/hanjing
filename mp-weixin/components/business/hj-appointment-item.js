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
        o =
          e.AppointmentStatusMap[p.appointment.status] ||
          e.AppointmentStatusMap.pending,
        a = e.AppointmentTypeMap[p.appointment.type] || p.appointment.type;
      return (e, n) =>
        t.e(
          {
            a: t.t(e.appointment.appointmentNo),
            b: t.p({
              text: t.unref(o).label,
              type:
                {
                  confirmed: "primary",
                  reminded: "primary",
                  checked_in: "success",
                  completed: "default",
                  cancelled: "danger",
                  no_show: "danger",
                  pending: "success",
                }[p.appointment.status] || "default",
              size: "sm",
            }),
            c: t.t(e.storeName || e.appointment.storeId),
            d: t.t(e.doctorName || e.appointment.doctorId),
            e: t.t(e.appointment.appointmentDate),
            f: t.t(e.appointment.appointmentTime),
            g: t.t(t.unref(a)),
            h: e.appointment.symptomDesc,
          },
          e.appointment.symptomDesc
            ? { i: t.t(e.appointment.symptomDesc) }
            : {},
          { j: e.appointment.status !== "arrived" && e.appointment.status !== "cancelled" && e.appointment.status !== "no_show" && e.appointment.status !== "completed" },
          e.appointment.status !== "arrived" && e.appointment.status !== "cancelled" && e.appointment.status !== "no_show" && e.appointment.status !== "completed"
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
