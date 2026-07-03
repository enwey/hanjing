"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  o = e.defineComponent({
    __name: "index",
    setup(a) {
      const loading = e.ref(!0),
        timelineList = e.ref([]),
        recordDetail = e.ref(null),
        currentParams = () => {
          const patientId = e.index.getStorageSync("selected_treatment_patient_id") || "";
          return patientId ? { patientId } : {};
        },
        timelineTypeNames = {
          visit: "初诊",
          adjust: "调整",
          followup: "随访",
          advice: "医嘱",
          milestone: "节点",
        };
      return (
        e.onMounted(async () => {
          try {
            const [e, a] = await Promise.all([
              t.getTimeline(currentParams()),
              t.getTreatmentRecord(currentParams()),
            ]);
            ((timelineList.value = e.data), (recordDetail.value = a.data));
          } catch (err) {
            console.error(err);
          } finally {
            loading.value = !1;
          }
        }),
        (t, a) =>
          e.e(
            { a: e.p({ title: "治疗时间线", showBack: !0 }), b: !loading.value },
            loading.value
              ? {}
              : e.e(
                  { c: recordDetail.value },
                  recordDetail.value
                    ? {
                        d: e.t(recordDetail.value.deviceModel),
                        e: e.t(recordDetail.value.adjustmentValue),
                        f: e.t(recordDetail.value.nextAdjustDate || "待定"),
                      }
                    : {},
                  {
                    g: e.f(timelineList.value, (t, a, o) =>
                      e.e(
                        {
                          a: e.t(t.date.slice(5)),
                          b: e.t(timelineTypeNames[t.type] || t.type),
                          c: t.color,
                          d: a < timelineList.value.length - 1,
                        },
                        a < timelineList.value.length - 1 ? { e: t.color + "30" } : {},
                        {
                          f: e.t(t.title),
                          g: e.t(t.description),
                          h: t.doctorName,
                        },
                        t.doctorName ? { i: e.t(t.doctorName) } : {},
                        { j: t.id, k: a === timelineList.value.length - 1 ? 1 : "" },
                      ),
                    ),
                  },
                ),
          )
      );
    },
  }),
  l = e._export_sfc(o, [["__scopeId", "data-v-50b7be62"]]);
wx.createPage(l);
