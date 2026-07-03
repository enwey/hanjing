"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
Math || o();
const o = () => "../../../components/base/hj-navbar.js",
  a = e.defineComponent({
    __name: "index",
    setup(o) {
      const loading = e.ref(!0),
        recordDetail = e.ref(null),
        adjustmentHistory = e.reactive([]);
      function currentParams() {
        const patientId = e.index.getStorageSync("selected_treatment_patient_id") || "";
        return patientId ? { patientId } : {};
      }
      return (
        e.onMounted(async () => {
          try {
            const e = await t.getTreatmentRecord(currentParams());
            recordDetail.value = e.data;

            const adjRes = await t.getDeviceAdjustments(currentParams());
            if (adjRes && adjRes.data) {
              adjustmentHistory.splice(0, adjustmentHistory.length, ...adjRes.data);
            }
          } catch (err) {
            console.error(err);
          } finally {
            loading.value = !1;
          }
        }),
        (t, o) =>
          e.e(
            {
              a: e.p({ title: "设备调整", showBack: !0 }),
              b: !loading.value && recordDetail.value,
            },
            !loading.value && recordDetail.value
              ? {
                  c: e.t(recordDetail.value.deviceModel),
                  d: e.t(recordDetail.value.adjustmentValue),
                  e: e.t(adjustmentHistory.filter((e) => e.comfort > 0).length),
                  f: e.t(recordDetail.value.nextAdjustDate || "待定"),
                  hasHistory: adjustmentHistory.length > 0,
                  g: e.f(adjustmentHistory, (t, o, a) =>
                    e.e(
                      {
                        a: e.t(t.date),
                        b: e.t(t.value),
                        c: e.t(t.note),
                        d: t.doctor,
                      },
                      t.doctor ? { e: e.t(t.doctor) } : {},
                      { f: t.comfort > 0 },
                      t.comfort > 0 ? { g: e.t(t.comfort) } : {},
                      { h: o },
                    ),
                  ),
                }
              : {},
          )
      );
    },
  }),
  c = e._export_sfc(a, [["__scopeId", "data-v-64c0d952"]]);
wx.createPage(c);
