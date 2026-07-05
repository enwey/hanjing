"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
const a = e.defineComponent({
    __name: "index",
    setup(a) {
      const o = e.ref(""),
        i = e.ref([]),
        n = e.ref([]),
        r = e.ref([]),
        s = e.ref([]),
        c = async () => {
          try {
            const eData = await t.getDistributionRules(),
              aData = eData.data || eData || {};
            o.value = aData.qualificationText || "";
            i.value = aData.levels || [];
            n.value = aData.commissionRules || [];
            r.value = aData.promotionWays || [];
            s.value = aData.withdrawRules || [];
          } catch (tErr) {
            e.index.showToast({ title: "加载分销规则失败", icon: "none" });
          }
        };
      return (
        e.onMounted(c),
        (t, a) => ({
          a: e.t(o.value),
          b: e.f(i.value, (t, a, o) => ({
            a: e.t(t.label),
            b: e.t(t.directOrderRequired),
            c: e.t(t.level1Rate),
            d: e.t(t.level2Rate),
            e: t.level,
          })),
          c: e.f(n.value, (t, a, o) => ({ a: e.t(t), b: a })),
          d: e.f(r.value, (t, a, o) => ({ a: e.t(t), b: a })),
          e: e.f(s.value, (t, a, o) => ({ a: e.t(t), b: a })),
        })
      );
    },
  }),
  o = e._export_sfc(a, [["__scopeId", "data-v-9e9a64dc"]]);
wx.createPage(o);
