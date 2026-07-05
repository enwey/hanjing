"use strict";
const e = require("../../../common/vendor.js"),
  a = require("../../../api/index.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  n = e.defineComponent({
    __name: "index",
    setup(t) {
      const loading = e.ref(!0),
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
        adviceSections = e.computed(() => {
          if (!recordDetail.value || !recordDetail.value.isRealTreatmentRecord) return [];
          const sections = [];
          recordDetail.value.diagnosis && sections.push({ key: "diagnosis", title: "诊断结果", content: recordDetail.value.diagnosis, highlight: !1 });
          recordDetail.value.treatmentPlan && sections.push({ key: "plan", title: "治疗方案", content: recordDetail.value.treatmentPlan, highlight: !1 });
          recordDetail.value.doctorAdvice && sections.push({ key: "advice", title: "医生建议", content: recordDetail.value.doctorAdvice, highlight: !0 });
          return sections;
        });
      async function loadData() {
        loading.value = !0;
        try {
          const res = await a.getTreatmentRecord(currentParams());
          recordDetail.value = (res && res.data) || null;
        } catch (err) {
          console.error(err);
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
        (a, t) =>
          e.e(
            {
              a: e.p({ title: "医嘱建议", showBack: !0 }),
              b: !loading.value,
            },
            !loading.value
              ? e.e(
                  {
                    c: hasRealTreatmentRecord.value,
                  },
                  hasRealTreatmentRecord.value
                    ? {
                        d: e.f(adviceSections.value, (section, index, key) => ({
                          a: e.t(section.title),
                          b: e.t(section.content),
                          c: section.highlight ? 1 : "",
                          d: section.key,
                        })),
                        e: adviceSections.value.length === 0,
                        f: recordDetail.value && recordDetail.value.followupDate,
                        g: e.t(recordDetail.value ? recordDetail.value.followupDate : ""),
                        h: e.o(goAppointment, "f9"),
                      }
                    : {
                        i: e.o(goAppointment),
                      },
                )
              : {},
          )
      );
    },
  }),
  o = e._export_sfc(n, [["__scopeId", "data-v-3fe7702c"]]);
wx.createPage(o);
