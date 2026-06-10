"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js");
Math || (a + l)();
const a = () => "../../components/base/hj-navbar.js",
  l = () => "../../components/business/hj-schedule-calendar.js",
  s = e.defineComponent({
    __name: "time-select",
    setup(a) {
      const l = t.useAppointmentStore(),
        s = e.ref(!0),
        n = e.ref(""),
        o = e.ref([]),
        u = e.ref(""),
        i = e.ref(""),
        d = e.ref("");
      async function r(e) {
        ((n.value = e),
          await l.fetchSchedules(u.value, i.value, e, e),
          (o.value = l.schedules));
      }
      e.onMounted(async () => {
        var e, t, a, n;
        const o = getCurrentPages(),
          r = (null == (e = o[o.length - 1].$page) ? void 0 : e.options) || {};
        ((u.value =
          r.doctorId || (null == (t = l.selectedDoctor) ? void 0 : t.id) || ""),
          (i.value =
            r.storeId || (null == (a = l.selectedStore) ? void 0 : a.id) || ""),
          (d.value = (null == (n = l.selectedDoctor) ? void 0 : n.name) || ""),
          await l.fetchScheduleDates(u.value, i.value),
          (s.value = !1));
      });
      const c = e.ref(null);
      async function v(e) {
        ((c.value = e),
          await (async function (e) {
            "full" !== e.status && (await l.fetchTimeSlots(e.id));
          })(e));
      }
      return (t, a) =>
        e.e(
          {
            a: e.p({ title: d.value || "选择时段", "show-back": !0 }),
            b: e.o(r, "0e"),
            c: e.p({
              dates: e.unref(l).scheduleDates,
              "selected-date": n.value,
            }),
            d: n.value,
          },
          n.value
            ? e.e(
                { e: e.t(n.value), f: o.value.length > 0 },
                o.value.length > 0
                  ? {
                      g: e.f(o.value, (t, a, s) => {
                        var n, o, u;
                        return e.e(
                          {
                            a: e.t(
                              ((u = t.period),
                              {
                                morning: "上午",
                                afternoon: "下午",
                                full_day: "全天",
                              }[u] || u),
                            ),
                            b: e.t(t.startTime),
                            c: e.t(t.endTime),
                            d: e.t(
                              "full" === t.status
                                ? "已约满"
                                : `余${t.totalSlots - t.bookedSlots}位`,
                            ),
                            e: "full" === t.status ? 1 : "",
                            f: e.o((e) => v(t), t.id),
                            g:
                              (null == (n = c.value) ? void 0 : n.id) ===
                                t.id && e.unref(l).timeSlots.length > 0,
                          },
                          (null == (o = c.value) ? void 0 : o.id) === t.id &&
                            e.unref(l).timeSlots.length > 0
                            ? {
                                h: e.f(e.unref(l).timeSlots, (a, s, n) => ({
                                  a: e.t(a.startTime),
                                  b: a.id,
                                  c: "available" === a.status ? 1 : "",
                                  d: "booked" === a.status ? 1 : "",
                                  e: "disabled" === a.status ? 1 : "",
                                  f: e.o(
                                    (s) =>
                                      (function (t, a) {
                                        "available" === a.status &&
                                          (l.confirmTimeSlot(t, a),
                                          e.index.navigateTo({
                                            url: "/pages/appointment/confirm",
                                          }));
                                      })(t, a),
                                    a.id,
                                  ),
                                })),
                              }
                            : {},
                          { i: t.id },
                        );
                      }),
                    }
                  : {},
              )
            : {},
        );
    },
  }),
  n = e._export_sfc(s, [["__scopeId", "data-v-93083005"]]);
wx.createPage(n);
