"use strict";
const e = require("../../common/vendor.js"),
  a = require("../../api/index.js");
Math || i();
const i = () => "../../components/base/hj-navbar.js",
  t = e.defineComponent({
    __name: "detail",
    setup(i) {
      const t = e.ref(null),
        n = e.ref(!0),
        l = e.ref(0);
      function r(e) {
        return "¥" + (e / 100).toFixed(2);
      }
      function o() {
        e.index.showToast({ title: "已加入购物车", icon: "success" });
      }
      return (
        e.onLoad(async (i) => {
          const l = null == i ? void 0 : i.id;
          if (!l) return void e.index.navigateBack();
          const r = await a.getProductDetail(l);
          ((t.value = r.data || r), (n.value = !1));
        }),
        (a, i) =>
          e.e(
            { a: e.p({ title: "商品详情" }), b: n.value },
            n.value
              ? {}
              : t.value
                ? e.e(
                    {
                      d: e.f(t.value.images, (e, a, i) => ({ a: e, b: a })),
                      e: l.value,
                      f: e.o((e) => (l.value = e.detail.current), "05"),
                      g: e.t(r(t.value.price)),
                      h: t.value.originalPrice,
                    },
                    t.value.originalPrice
                      ? { i: e.t(r(t.value.originalPrice)) }
                      : {},
                    { j: t.value.originalPrice },
                    t.value.originalPrice
                      ? {
                          k: e.t(
                            Math.round(
                              100 * (1 - t.value.price / t.value.originalPrice),
                            ),
                          ),
                        }
                      : {},
                    {
                      l: e.t(t.value.name),
                      m: e.t(t.value.sales),
                      n: e.t(t.value.description),
                      o: e.t(r(t.value.price)),
                      p: e.o(o, "d5"),
                    },
                  )
                : {},
            { c: t.value },
          )
      );
    },
  }),
  n = e._export_sfc(t, [["__scopeId", "data-v-5e948475"]]);
wx.createPage(n);
