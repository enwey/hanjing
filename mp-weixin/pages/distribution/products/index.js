"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
if (!Array) {
  e.resolveComponent("hj-empty")();
}
Math;
const i = e.defineComponent({
    __name: "index",
    setup(i) {
      const a = e.ref([]);
      return (
        e.onMounted(async () => {
          var e;
          try {
            const i = await t.getDistributionProducts();
            a.value = (null == (e = i.data) ? void 0 : e.list) || i.list || [];
          } catch (i) {}
        }),
        (t, i) =>
          e.e(
            {
              a: e.f(a.value, (t, i, a) => ({
                a: t.image,
                b: e.t(t.name),
                c: e.t((t.price / 100).toFixed(0)),
                d: e.t(100 * t.commissionRate),
                e: e.t(((t.price * t.commissionRate) / 100).toFixed(0)),
                f: t.id,
                g: e.o((i) => {
                  return (
                    (a = "/pages/product/detail?id=" + t.id),
                    e.index.navigateTo({ url: a })
                  );
                  var a;
                }, t.id),
              })),
              b: !a.value.length,
            },
            a.value.length ? {} : { c: e.p({ text: "暂无推广商品" }) },
          )
      );
    },
  }),
  a = e._export_sfc(i, [["__scopeId", "data-v-17829149"]]);
wx.createPage(a);
