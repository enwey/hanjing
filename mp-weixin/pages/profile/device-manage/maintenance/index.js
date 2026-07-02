"use strict";
const e = require("../../../../common/vendor.js"),
  t = require("../../../../api/index.js");
Math || a();
const a = () => "../../../../components/base/hj-navbar.js",
  n = e.defineComponent({
    __name: "index",
    setup(a) {
      const n = e.ref([]),
        c = e.ref(!0);
      function currentParams() {
        const patientId = e.index.getStorageSync("selected_treatment_patient_id") || "";
        return patientId ? { patientId } : {};
      }
      e.onMounted(async () => {
        var e;
        const a = await t.getDeviceMaintenance(currentParams());
        ((n.value = (null == (e = a.data) ? void 0 : e.list) || a.list || []),
          (c.value = !1));
      });
      const s = {
          clean: "清洁",
          repair: "维修",
          adjust: "调整",
          replace: "更换",
        },
        o = {
          clean: "#3B6BF5",
          repair: "#EF4444",
          adjust: "#F59E0B",
          replace: "#1A9D5C",
        };
      return (t, a) =>
        e.e(
          { a: e.p({ title: "维护记录", "show-back": !0 }), b: c.value },
          c.value
            ? {}
            : e.e(
                {
                  c: e.f(n.value, (t, a, n) =>
                    e.e(
                      {
                        a: e.t(s[t.type]),
                        b: o[t.type] + "18",
                        c: o[t.type],
                        d: e.t(t.date),
                        e: e.t(t.description),
                        f: t.cost > 0,
                      },
                      t.cost > 0 ? { g: e.t(t.cost) } : {},
                      { h: t.id },
                    ),
                  ),
                  d: 0 === n.value.length,
                },
                (n.value.length, {}),
              ),
        );
    },
  }),
  c = e._export_sfc(n, [["__scopeId", "data-v-6756cb81"]]);
wx.createPage(c);
