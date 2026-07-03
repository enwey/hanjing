"use strict";
const e = require("../../common/vendor.js");
Math || a();
const a = () => "../../components/base/hj-navbar.js",
  i = e.defineComponent({
    __name: "index",
    setup(a) {
      const i = [
          { key: "all", label: "全部" },
          { key: "device", label: "医疗器械" },
          { key: "accessory", label: "配件耗材" },
          { key: "service", label: "服务套餐" },
        ],
        r = e.ref("all"),
        c = e.ref([]),
        o = e.ref(!0),
        d = e.computed(() =>
          "all" === r.value
            ? c.value
            : c.value.filter((e) => e.category === r.value),
        );
      function formatPriceYuan(e) {
        return "¥" + (e / 100).toFixed(2);
      }
      const navbarHeight = e.ref(88);
      e.onMounted(async () => {
        try {
          const windowInfo = e.index.getWindowInfo();
          const statusBarHeight = windowInfo.statusBarHeight || 44;
          navbarHeight.value = statusBarHeight + 44;
        } catch (err) {
          console.error(err);
        }
        try {
          const api = require("../../api/index.js");
          const res = await api.getProducts();
          if (res && res.data && res.data.list) {
            c.value = res.data.list.map(item => ({
              ...item,
              sales: item.salesCount !== undefined ? item.salesCount : item.sales
            }));
          }
        } catch (err) {
          console.error("加载商品列表错误", err);
          e.index.showToast({ title: err.message || "商品加载失败", icon: "none" });
          c.value = [];
        } finally {
          o.value = !1;
        }
      });
      const s = { device: "#D9E6FF", accessory: "#D3F5E3", service: "#FFF3CD" };
      return (a, c) =>
        e.e(
          {
            a: e.p({ title: "健康商城" }),
            b: e.f(i, (a, i, c) =>
              e.e(
                { a: e.t(a.label), b: r.value === a.key },
                (r.value, a.key, {}),
                {
                  c: a.key,
                  d: r.value === a.key ? 1 : "",
                  e: e.o((e) => {
                    return ((i = a.key), void (r.value = i));
                    var i;
                  }, a.key),
                },
              ),
            ),
            c: o.value,
            f: e.unref(navbarHeight),
          },
          o.value
            ? {}
            : {
                d: e.f(d.value, (a, i, r) => {
                  return e.e(
                    { a: a.imageUrl || a.image },
                    (a.imageUrl || a.image)
                      ? { b: a.imageUrl || a.image }
                      : {
                          c: e.t(
                            "device" === a.category
                              ? "⚕"
                              : "service" === a.category
                                ? "★"
                                : "◆",
                          ),
                        },
                    { d: a.badge },
                    a.badge
                      ? { e: e.t(a.badge) }
                      : a.originalPrice
                        ? {
                            g: e.t(
                              Math.round(100 * (1 - a.price / a.originalPrice)),
                            ),
                          }
                        : {},
                    {
                      f: a.originalPrice,
                      h: ((o = a.category), s[o] || "#F3F4F6"),
                      i: e.t(a.name),
                      j: e.t(formatPriceYuan(a.price)),
                      k: a.originalPrice,
                    },
                    a.originalPrice ? { l: e.t(formatPriceYuan(a.originalPrice)) } : {},
                    {
                      m: e.t(
                        ((c = a.sales),
                        c >= 1e3 ? (c / 1e3).toFixed(1) + "k" : String(c)),
                      ),
                      n: a.id,
                      o: e.o((i) => {
                        return (
                          (r = a.id),
                          void e.index.navigateTo({
                            url: `/pages/product/detail?id=${r}`,
                          })
                        );
                        var r;
                      }, a.id),
                    },
                  );
                  var c, o;
                }),
              },
          { e: !o.value && 0 === d.value.length },
          (o.value || d.value.length, {}),
        );
    },
  }),
  r = e._export_sfc(i, [["__scopeId", "data-v-789c78ca"]]);
wx.createPage(r);
