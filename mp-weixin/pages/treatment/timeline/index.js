"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  o = e.defineComponent({
    __name: "index",
    setup(a) {
      const o = e.ref(!0),
        l = e.ref([]),
        n = e.ref(null),
        currentParams = () => {
          const patientId = e.index.getStorageSync("selected_treatment_patient_id") || "";
          return patientId ? { patientId } : {};
        },
        c = {
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
            ((l.value = e.data), (n.value = a.data));
          } catch (e) {
            console.error(e);
          } finally {
            o.value = !1;
          }
        }),
        (t, a) =>
          e.e(
            { a: e.p({ title: "治疗时间线", showBack: !0 }), b: !o.value },
            o.value
              ? {}
              : e.e(
                  { c: n.value },
                  n.value
                    ? {
                        d: e.t(n.value.deviceModel),
                        e: e.t(n.value.adjustmentValue),
                        f: e.t(n.value.nextAdjustDate || "待定"),
                      }
                    : {},
                  {
                    g: e.f(l.value, (t, a, o) =>
                      e.e(
                        {
                          a: e.t(t.date.slice(5)),
                          b: e.t(c[t.type] || t.type),
                          c: t.color,
                          d: a < l.value.length - 1,
                        },
                        a < l.value.length - 1 ? { e: t.color + "30" } : {},
                        {
                          f: e.t(t.title),
                          g: e.t(t.description),
                          h: t.doctorName,
                        },
                        t.doctorName ? { i: e.t(t.doctorName) } : {},
                        { j: t.id, k: a === l.value.length - 1 ? 1 : "" },
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
