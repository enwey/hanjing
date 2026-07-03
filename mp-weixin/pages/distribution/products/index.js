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
      const productList = e.ref([]),
        loadProducts = async () => {
          try {
            const res = await t.getDistributionProducts();
            productList.value = (res.data && res.data.list) || res.list || [];
          } catch (err) {
            e.index.showToast({ title: "加载推广商品失败", icon: "none" });
          }
        };
      return (
        e.onMounted(loadProducts),
        e.onShow(loadProducts),
        (t, i) =>
          e.e(
            {
              a: e.f(productList.value, (t, i, a) => ({
                a: t.image,
                b: e.t(t.name),
                c: e.t((t.price / 100).toFixed(2)),
                d: e.t(Number(t.commissionRate || 0)),
                e: e.t(((t.commission || 0) / 100).toFixed(2)),
                f: t.id,
                g: e.o((i) => {
                  return (
                    (a = "/pages/product/detail?id=" + t.id),
                    e.index.navigateTo({ url: a })
                  );
                  var a;
                }, t.id),
              })),
              b: !productList.value.length,
            },
            productList.value.length ? {} : { c: e.p({ text: "暂无推广商品" }) },
          )
      );
    },
  }),
  a = e._export_sfc(i, [["__scopeId", "data-v-17829149"]]);
wx.createPage(a);
