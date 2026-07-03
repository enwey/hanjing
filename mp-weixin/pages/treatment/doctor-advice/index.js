"use strict";
const e = require("../../../common/vendor.js"),
  a = require("../../../api/index.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  n = e.defineComponent({
    __name: "index",
    setup(t) {
      const n = e.ref(!0),
        o = e.ref(null);
      function currentParams() {
        const patientId = e.index.getStorageSync("selected_treatment_patient_id") || "";
        return patientId ? { patientId } : {};
      }
      function goAppointment() {
        e.index.switchTab({ url: "/pages/appointment/index" });
      }
      return (
        e.onMounted(async () => {
          try {
            const e = await a.getTreatmentRecord(currentParams());
            o.value = e.data;
          } catch (e) {
            console.error(e);
          } finally {
            n.value = !1;
          }
        }),
        (a, t) =>
          e.e(
            {
              a: e.p({ title: "医嘱建议", showBack: !0 }),
              b: !n.value && o.value,
            },
            !n.value && o.value
              ? {
                  c: e.t(o.value.diagnosis),
                  d: e.t(o.value.treatmentPlan),
                  e: e.t(o.value.doctorAdvice),
                  f: e.t(o.value.followupDate || "待预约"),
                  g: e.o(goAppointment, "f2"),
                }
              : {},
          )
      );
    },
  }),
  o = e._export_sfc(n, [["__scopeId", "data-v-3fe7702c"]]);
wx.createPage(o);
