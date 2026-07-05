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
            c.value = res.data.list.map((item) => ({
              ...item,
              salesCount: Number(item.salesCount || 0),
              price: Number(item.price || 0),
              originalPrice: Number(item.originalPrice || 0),
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
                  const hasDiscount = Number(a.originalPrice) > Number(a.price) && Number(a.price) > 0;
                  return e.e(
                    { a: a.imageUrl },
                    a.imageUrl
                      ? { b: a.imageUrl }
                      : {
                          c: "device" === a.category
                            ? "/static/icons/tab-treatment-active.png"
                            : "service" === a.category
                              ? "/static/icons/tab-appointment-active.png"
                              : "/static/icons/tab-profile-active.png",
                        },
                    { d: hasDiscount },
                    hasDiscount
                      ? {
                          e: e.t(
                            Math.round(100 * (1 - a.price / a.originalPrice)),
                          ),
                        }
                      : {},
                    {
                      f: ((o = a.category), s[o] || "#F3F4F6"),
                      g: e.t(a.name),
                      h: e.t(formatPriceYuan(a.price)),
                      i: hasDiscount,
                    },
                    hasDiscount ? { j: e.t(formatPriceYuan(a.originalPrice)) } : {},
                    {
                      k: e.t(
                        ((c = a.salesCount),
                        c >= 1e3 ? (c / 1e3).toFixed(1) + "k" : String(c)),
                      ),
                      l: a.id,
                      m: e.o((i) => {
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
