"use strict";
const a = require("../../../common/vendor.js"),
  e = require("../../../api/index.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  o = a.defineComponent({
    __name: "index",
    setup(t) {
      const loading = a.ref(!0),
        wearingRecords = a.ref([]),
        wearingSummary = a.ref(null),
        selectedRange = a.ref("week");
      function currentParams() {
        const patientId = a.index.getStorageSync("selected_treatment_patient_id") || "";
        const params = {
          _t: Date.now(),
        };
        if (patientId) {
          params.patientId = patientId;
        }
        return params;
      }
      const chartData = a.computed(() => {
          const sourceRecords = "week" === selectedRange.value ? wearingRecords.value.slice(0, 7) : wearingRecords.value;
          const reversedRecords = [...sourceRecords].reverse();
          return reversedRecords.map((recordItem) => ({
            date: String(recordItem.date || "").slice(5),
            duration: Number(recordItem.wearDuration || 0),
            comfort: Number(recordItem.comfort || 0),
            hasDuration: Number(recordItem.wearDuration || 0) > 0,
          }));
        }),
        hasRealData = a.computed(() => wearingRecords.value.length > 0 && chartData.value.length > 0),
        maxDuration = a.computed(() => {
          const durations = chartData.value.map((item) => item.duration);
          return Math.max(1, ...durations);
        }),
        avgDuration = a.computed(() => {
          if (!wearingSummary.value) return "";
          return "week" === selectedRange.value ? wearingSummary.value.weekAvg : wearingSummary.value.avgDuration;
        }),
        wornDays = a.computed(() => {
          if (!wearingSummary.value) return "";
          return "week" === selectedRange.value ? wearingSummary.value.weekWorn : wearingSummary.value.wornDays;
        });
      async function loadData() {
        loading.value = !0;
        try {
          const [recordRes, summaryRes] = await Promise.all([
            e.getWearingRecords(currentParams()),
            e.getWearingSummary(currentParams()),
          ]);
          wearingRecords.value = (recordRes && recordRes.data) || [];
          wearingSummary.value = (summaryRes && summaryRes.data) || null;
        } catch (err) {
          console.error(err);
          wearingRecords.value = [];
          wearingSummary.value = null;
        } finally {
          loading.value = !1;
        }
      }
      return (
        a.onMounted(loadData),
        a.onShow(loadData),
        (e, t) =>
          a.e(
            {
              a: a.p({ title: "睡眠趋势", showBack: !0 }),
              b: !loading.value,
            },
            !loading.value
              ? a.e(
                  {
                    c: hasRealData.value,
                  },
                  hasRealData.value
                    ? {
                        d: "week" === selectedRange.value ? 1 : "",
                        e: a.o(() => (selectedRange.value = "week"), "18"),
                        f: "month" === selectedRange.value ? 1 : "",
                        g: a.o(() => (selectedRange.value = "month"), "f0"),
                        h: a.t(wornDays.value),
                        i: a.t(avgDuration.value),
                        j: a.t(wearingSummary.value ? wearingSummary.value.compliance : ""),
                        k: a.f(chartData.value, (item, index, key) =>
                          a.e(
                            {
                              a: item.hasDuration,
                            },
                            item.hasDuration ? { b: a.t(item.duration) } : {},
                            {
                              c: item.hasDuration ? item.duration / maxDuration.value * 120 + "px" : "4px",
                              d: item.hasDuration
                                ? item.duration >= 7
                                  ? "#22c55e"
                                  : item.duration >= 5
                                    ? "#eab308"
                                    : "#ef4444"
                                : "#e5e7eb",
                              e: a.t(item.date),
                              f: index,
                            },
                          ),
                        ),
                        l: a.f(chartData.value, (item, index, key) => ({
                          a: a.f(5, (dot, dotIndex, dotKey) => ({
                            a: dot,
                            b: item.comfort > 0 && dot <= item.comfort ? 1 : "",
                          })),
                          b: a.t(item.date),
                          c: index,
                          d: item.comfort > 0 ? "" : 1,
                        })),
                      }
                    : {
                        m: "暂无睡眠趋势数据",
                        n: "当前治疗人还没有可展示的真实佩戴记录，完成打卡后这里会展示趋势变化。",
                      },
                )
              : {},
          )
      );
    },
  }),
  r = a._export_sfc(o, [["__scopeId", "data-v-eb41b617"]]);
wx.createPage(r);
