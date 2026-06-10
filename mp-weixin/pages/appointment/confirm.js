"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js");
Math || (o + n)();
const o = () => "../../components/base/hj-navbar.js",
  n = () => "../../components/base/hj-button.js",
  l = e.defineComponent({
    __name: "confirm",
    setup(o) {
      var n, l, s, c;
      const r = t.useAppointmentStore(),
        i = e.ref(""),
        d = e.ref(!1),
        a = (null == (n = r.selectedStore) ? void 0 : n.name) || "",
        u = (null == (l = r.selectedDoctor) ? void 0 : l.name) || "",
        p = r.selectedDate,
        m = (null == (s = r.selectedTimeSlot) ? void 0 : s.label) || "",
        f = (null == (c = r.selectedDoctor) ? void 0 : c.consultFee) || 0;
      async function v() {
        if (
          r.selectedStore &&
          r.selectedDoctor &&
          r.selectedSchedule &&
          r.selectedTimeSlot
        ) {
          d.value = !0;
          try {
            const t = await r.createAppointment({
              patientId: "pat-001",
              storeId: r.selectedStore.id,
              doctorId: r.selectedDoctor.id,
              scheduleId: r.selectedSchedule.id,
              appointmentDate: r.selectedDate,
              appointmentTime: r.selectedTimeSlot.label,
              type: "first",
              symptomDesc: i.value || void 0,
            });
            e.index.redirectTo({
              url: `/pages/appointment/success?id=${t.id}`,
            });
          } catch (t) {
            e.index.showToast({ title: "预约失败，请重试", icon: "error" });
          } finally {
            d.value = !1;
          }
        } else e.index.showToast({ title: "请完善预约信息", icon: "error" });
      }
      return (t, o) =>
        e.e(
          {
            a: e.p({ title: "预约确认", "show-back": !0 }),
            b: e.t(e.unref(a)),
            c: e.t(e.unref(u)),
            d: e.t(e.unref(p)),
            e: e.t(e.unref(m)),
            f: e.unref(f) > 0,
          },
          e.unref(f) > 0 ? { g: e.t((e.unref(f) / 100).toFixed(2)) } : {},
          {
            h: i.value,
            i: e.o((e) => (i.value = e.detail.value), "b2"),
            j: e.t(
              e.unref(f) > 0 ? ` · ¥${(e.unref(f) / 100).toFixed(2)}` : "",
            ),
            k: e.o(v, "0a"),
            l: e.p({
              type: "primary",
              size: "lg",
              block: !0,
              loading: d.value,
            }),
          },
        );
    },
  }),
  s = e._export_sfc(l, [["__scopeId", "data-v-03365e87"]]);
wx.createPage(s);
