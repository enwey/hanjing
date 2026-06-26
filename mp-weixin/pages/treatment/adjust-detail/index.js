"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
Math || o();
const o = () => "../../../components/base/hj-navbar.js",
  a = e.defineComponent({
    __name: "index",
    setup(o) {
      const a = e.ref(!0),
        c = e.ref(null),
        r = e.reactive([]);
      return (
        e.onMounted(async () => {
          try {
            const e = await t.getTreatmentRecord();
            c.value = e.data;

            const adjRes = await t.getDeviceAdjustments();
            if (adjRes && adjRes.data) {
              r.splice(0, r.length, ...adjRes.data);
            }
          } catch (e) {
            console.error(e);
          } finally {
            a.value = !1;
          }
        }),
        (t, o) =>
          e.e(
            {
              a: e.p({ title: "设备调整", showBack: !0 }),
              b: !a.value && c.value,
            },
            !a.value && c.value
              ? {
                  c: e.t(c.value.deviceModel),
                  d: e.t(c.value.adjustmentValue),
                  e: e.t(r.filter((e) => e.comfort > 0).length),
                  f: e.t(c.value.nextAdjustDate || "待定"),
                  hasHistory: r.length > 0,
                  g: e.f(r, (t, o, a) =>
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
