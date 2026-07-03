"use strict";
const a = require("../../../common/vendor.js"),
  e = require("../../../api/index.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  u = a.defineComponent({
    __name: "index",
    setup(t) {
      const loading = a.ref(!0),
        wearingRecords = a.ref([]),
        wearingSummary = a.ref(null),
        selectedRange = a.ref("week"),
        currentParams = () => {
          const patientId = a.index.getStorageSync("selected_treatment_patient_id") || "";
          return patientId ? { patientId } : {};
        },
        chartData = a.computed(() =>
          ("week" === selectedRange.value ? wearingRecords.value.slice(-7) : wearingRecords.value).map((a) => ({
            date: a.date.slice(5),
            duration: a.wearDuration,
            comfort: a.comfort,
            hasData: a.wearDuration > 0,
          })),
        ),
        maxDuration = a.computed(() => Math.max(...chartData.value.map((a) => a.duration), 8)),
        avgDuration = a.computed(() =>
          wearingSummary.value
            ? "week" === selectedRange.value
              ? wearingSummary.value.weekAvg
              : wearingSummary.value.avgDuration
            : 0,
        ),
        wornDays = a.computed(() =>
          wearingSummary.value
            ? "week" === selectedRange.value
              ? wearingSummary.value.weekWorn
              : wearingSummary.value.wornDays
            : 0,
        );
      return (
        a.onMounted(async () => {
          try {
            const [aRes, tRes] = await Promise.all([
              e.getWearingRecords(currentParams()),
              e.getWearingSummary(currentParams()),
            ]);
            ((wearingRecords.value = aRes.data), (wearingSummary.value = tRes.data));
          } catch (err) {
            console.error(err);
          } finally {
            loading.value = !1;
          }
        }),
        (e, t) => {
          var o;
          return a.e(
            { a: a.p({ title: "睡眠趋势", showBack: !0 }), b: !loading.value },
            loading.value
              ? {}
              : {
                  c: "week" === selectedRange.value ? 1 : "",
                  d: a.o((a) => (selectedRange.value = "week"), "07"),
                  e: "month" === selectedRange.value ? 1 : "",
                  f: a.o((a) => (selectedRange.value = "month"), "8b"),
                  g: a.t(wornDays.value),
                  h: a.t(avgDuration.value),
                  i: a.t((null == (o = wearingSummary.value) ? void 0 : o.compliance) || 0),
                  j: a.f(chartData.value, (e, t, u) =>
                    a.e(
                      { a: e.hasData },
                      e.hasData ? { b: a.t(e.duration) } : {},
                      {
                        c: e.hasData
                          ? (e.duration / maxDuration.value) * 120 + "px"
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
                  k: a.f(chartData.value, (e, t, u) => ({
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
