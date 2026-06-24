"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js");
Math || (a + n + l)();
const a = () => "../../components/base/hj-navbar.js",
  l = () => "../../components/base/hj-button.js",
  n = () => "../../components/business/hj-schedule-calendar.js",
  u = e.defineComponent({
    __name: "reschedule",
    setup(a) {
      const l = t.useAppointmentStore(),
        n = e.ref(""),
        u = e.ref(""),
        s = e.ref(""),
        i = e.ref(""),
        o = e.ref(null),
        d = e.ref(null),
        r = e.ref(!1);
      async function c(e) {
        ((i.value = e), await l.fetchSchedules(u.value, s.value, e, e));
      }
      async function v() {
        if (o.value && d.value) {
          r.value = !0;
          try {
            (await l.rescheduleAppointment(n.value, {
              scheduleId: o.value.id,
              appointmentDate: o.value.date,
              appointmentTime: d.value.label,
            }),
              e.index.showToast({ title: "改约成功", icon: "success" }),
              setTimeout(() => {
                e.index.navigateBack({ delta: 2 });
              }, 1500));
          } catch {
            e.index.showToast({ title: "改约失败", icon: "error" });
          } finally {
            r.value = !1;
          }
        } else e.index.showToast({ title: "请选择时段", icon: "error" });
      }
      return (
        e.onMounted(async () => {
          var e;
          const t = getCurrentPages(),
            a =
              (null == (e = t[t.length - 1].$page) ? void 0 : e.options) || {};
          ((n.value = a.id || ""),
            (u.value = a.doctorId || ""),
            (s.value = a.storeId || ""),
            await l.fetchScheduleDates(u.value, s.value));
        }),
        (t, a) =>
          e.e(
            {
              a: e.p({ title: "改约", "show-back": !0 }),
              b: e.o(c, "2b"),
              c: e.p({
                dates: e.unref(l).scheduleDates,
                "selected-date": i.value,
              }),
              d: i.value && e.unref(l).schedules.length > 0,
            },
            i.value && e.unref(l).schedules.length > 0
              ? {
                  e: e.f(e.unref(l).schedules, (t, a, n) => {
                    var u, s;
                    return e.e(
                      {
                        a: e.t("morning" === t.period ? "上午" : "下午"),
                        b: e.t(t.startTime),
                        c: e.t(t.endTime),
                        d: e.o(
                          (e) =>
                            (async function (e) {
                              ((o.value = e), await l.fetchTimeSlots(e.id));
                            })(t),
                          t.id,
                        ),
                        e: (null == (u = o.value) ? void 0 : u.id) === t.id,
                      },
                      (null == (s = o.value) ? void 0 : s.id) === t.id
                        ? {
                            f: e.f(e.unref(l).timeSlots, (t, a, l) => {
                              var n;
                              return {
                                a: e.t(t.label),
                                b: t.id,
                                c: "available" === t.status ? 1 : "",
                                d:
                                  (null == (n = d.value) ? void 0 : n.id) ===
                                  t.id
                                    ? 1
                                    : "",
                                e: "booked" === t.status ? 1 : "",
                                f: e.o(
                                  (e) =>
                                    (function (e, t) {
                                      d.value = t;
                                    })(0, t),
                                  t.id,
                                ),
                              };
                            }),
                          }
                        : {},
                      { g: t.id },
                    );
                  }),
                }
              : {},
            { f: d.value },
            d.value
              ? {
                  g: e.t(i.value),
                  h: e.t(d.value.label),
                  i: e.o(v, "78"),
                  j: e.p({
                    type: "primary",
                    size: "lg",
                    block: !0,
                    loading: r.value,
                  }),
                }
              : {},
          )
      );
    },
  }),
  s = e._export_sfc(u, [["__scopeId", "data-v-54e72399"]]);
wx.createPage(s);
