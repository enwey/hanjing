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
        recordDetail = e.ref(null);
      function currentParams() {
        const patientId = e.index.getStorageSync("selected_treatment_patient_id") || "";
        const params = {
          _t: Date.now(),
        };
        if (patientId) {
          params.patientId = patientId;
        }
        return params;
      }
      const hasRealTreatmentRecord = e.computed(() => !!(recordDetail.value && recordDetail.value.isRealTreatmentRecord)),
        timelineTypeNames = {
          visit: "初诊",
          adjust: "调整",
          followup: "随访",
          advice: "医嘱",
          milestone: "节点",
        };
      async function loadData() {
        loading.value = !0;
        try {
          const [timelineRes, recordRes] = await Promise.all([
            t.getTimeline(currentParams()),
            t.getTreatmentRecord(currentParams()),
          ]);
          timelineList.value = (timelineRes && timelineRes.data) || [];
          recordDetail.value = (recordRes && recordRes.data) || null;
        } catch (err) {
          console.error(err);
          timelineList.value = [];
          recordDetail.value = null;
        } finally {
          loading.value = !1;
        }
      }
      function goAppointment() {
        e.index.switchTab({ url: "/pages/appointment/index" });
      }
      return (
        e.onMounted(loadData),
        e.onShow(loadData),
        (t, a) =>
          e.e(
            {
              a: e.p({ title: "治疗时间线", showBack: !0 }),
              b: !loading.value,
            },
            !loading.value
              ? e.e(
                  {
                    c: hasRealTreatmentRecord.value,
                  },
                  hasRealTreatmentRecord.value
                    ? e.e(
                        {
                          d: recordDetail.value,
                        },
                        recordDetail.value
                          ? {
                              e: e.t(recordDetail.value.deviceModel),
                              f: e.t(recordDetail.value.adjustmentValue),
                              g: recordDetail.value.nextAdjustDate,
                              h: e.t(recordDetail.value.nextAdjustDate),
                            }
                          : {},
                        {
                          i: timelineList.value.length === 0,
                          j: e.f(timelineList.value, (item, index, key) =>
                            e.e(
                              {
                                a: e.t(String(item.date || "").slice(5)),
                                b: e.t(timelineTypeNames[item.type] || item.type),
                                c: item.color,
                                d: index < timelineList.value.length - 1,
                              },
                              index < timelineList.value.length - 1 ? { e: item.color + "30" } : {},
                              {
                                f: e.t(item.title),
                                g: e.t(item.description),
                                h: item.doctorName,
                              },
                              item.doctorName ? { i: e.t(item.doctorName) } : {},
                              { j: item.id, k: index === timelineList.value.length - 1 ? 1 : "" },
                            ),
                          ),
                        },
                      )
                    : {
                        l: e.o(goAppointment),
                      },
                )
              : {},
          )
      );
    },
  }),
  l = e._export_sfc(o, [["__scopeId", "data-v-50b7be62"]]);
wx.createPage(l);
