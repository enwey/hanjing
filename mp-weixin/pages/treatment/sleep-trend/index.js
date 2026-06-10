"use strict";
const a = require("../../../common/vendor.js"),
  e = require("../../../api/index.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  u = a.defineComponent({
    __name: "index",
    setup(t) {
      const u = a.ref(!0),
        o = a.ref([]),
        r = a.ref(null),
        l = a.ref("week"),
        n = a.computed(() =>
          ("week" === l.value ? o.value.slice(-7) : o.value).map((a) => ({
            date: a.date.slice(5),
            duration: a.wearDuration,
            comfort: a.comfort,
            hasData: a.wearDuration > 0,
          })),
        ),
        v = a.computed(() => Math.max(...n.value.map((a) => a.duration), 8)),
        c = a.computed(() =>
          r.value
            ? "week" === l.value
              ? r.value.weekAvg
              : r.value.avgDuration
            : 0,
        ),
        s = a.computed(() =>
          r.value
            ? "week" === l.value
              ? r.value.weekWorn
              : r.value.wornDays
            : 0,
        );
      return (
        a.onMounted(async () => {
          try {
            const [a, t] = await Promise.all([
              e.getWearingRecords(),
              e.getWearingSummary(),
            ]);
            ((o.value = a.data), (r.value = t.data));
          } catch (a) {
            console.error(a);
          } finally {
            u.value = !1;
          }
        }),
        (e, t) => {
          var o;
          return a.e(
            { a: a.p({ title: "睡眠趋势", showBack: !0 }), b: !u.value },
            u.value
              ? {}
              : {
                  c: "week" === l.value ? 1 : "",
                  d: a.o((a) => (l.value = "week"), "07"),
                  e: "month" === l.value ? 1 : "",
                  f: a.o((a) => (l.value = "month"), "8b"),
                  g: a.t(s.value),
                  h: a.t(c.value),
                  i: a.t((null == (o = r.value) ? void 0 : o.compliance) || 0),
                  j: a.f(n.value, (e, t, u) =>
                    a.e(
                      { a: e.hasData },
                      e.hasData ? { b: a.t(e.duration) } : {},
                      {
                        c: e.hasData
                          ? (e.duration / v.value) * 120 + "px"
                          : "4px",
                        d: e.hasData
                          ? e.duration >= 7
                            ? "#86EFAC"
                            : e.duration >= 5
                              ? "#FDE68A"
                              : "#FDBA74"
                          : "#E5E7EB",
                        e: a.t(e.date),
                        f: t,
                      },
                    ),
                  ),
                  k: a.f(n.value, (e, t, u) => ({
                    a: a.f(5, (a, t, u) => ({
                      a: a,
                      b: e.hasData && a <= e.comfort ? 1 : "",
                    })),
                    b: a.t(e.date),
                    c: t,
                    d: e.hasData ? "" : 1,
                  })),
                },
          );
        }
      );
    },
  }),
  o = a._export_sfc(u, [["__scopeId", "data-v-eb41b617"]]);
wx.createPage(o);
