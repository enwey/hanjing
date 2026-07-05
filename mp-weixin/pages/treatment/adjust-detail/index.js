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
        const params = {
          _t: Date.now(),
        };
        if (patientId) {
          params.patientId = patientId;
        }
        return params;
      }
      const hasRealTreatmentRecord = e.computed(() => !!(recordDetail.value && recordDetail.value.isRealTreatmentRecord));
      async function loadData() {
        loading.value = !0;
        try {
          const recordRes = await t.getTreatmentRecord(currentParams());
          recordDetail.value = (recordRes && recordRes.data) || null;
          const adjustmentRes = await t.getDeviceAdjustments(currentParams());
          adjustmentHistory.splice(0, adjustmentHistory.length, ...(((adjustmentRes && adjustmentRes.data) || [])));
        } catch (err) {
          console.error(err);
          recordDetail.value = null;
          adjustmentHistory.splice(0, adjustmentHistory.length);
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
        (t, o) =>
          e.e(
            {
              a: e.p({ title: "设备调整", showBack: !0 }),
              b: !loading.value,
            },
            !loading.value
              ? e.e(
                  {
                    c: hasRealTreatmentRecord.value,
                  },
                  hasRealTreatmentRecord.value
                    ? {
                        d: e.t(recordDetail.value ? recordDetail.value.deviceModel : ""),
                        e: e.t(recordDetail.value ? recordDetail.value.adjustmentValue : ""),
                        f: e.t(adjustmentHistory.length),
                        g: recordDetail.value && recordDetail.value.nextAdjustDate,
                        h: e.t(recordDetail.value ? recordDetail.value.nextAdjustDate : ""),
                        i: adjustmentHistory.length > 0,
                        j: e.f(adjustmentHistory, (item, index, key) =>
                          e.e(
                            {
                              a: e.t(item.date),
                              b: e.t(item.value),
                              c: e.t(item.note),
                              d: item.doctor,
                            },
                            item.doctor ? { e: e.t(item.doctor) } : {},
                            { f: item.comfort > 0 },
                            item.comfort > 0 ? { g: e.t(item.comfort) } : {},
                            { h: index },
                          ),
                        ),
                      }
                    : {
                        k: e.o(goAppointment),
                      },
                )
              : {},
          )
      );
    },
  }),
  c = e._export_sfc(a, [["__scopeId", "data-v-64c0d952"]]);
wx.createPage(c);
