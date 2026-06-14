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
        l = [
          {
            id: "prod-001",
            name: "鼾静 HJ-MAD-03 下颌前移式阻鼾器",
            desc: "医疗级定制材料，精准前移量调节",
            price: 89800,
            originalPrice: 128e3,
            image: "",
            category: "device",
            sales: 1280,
            badge: "热销",
          },
          {
            id: "prod-002",
            name: "鼾静 HJ-MAD-01 基础款阻鼾器",
            desc: "适合初次使用，舒适轻薄设计",
            price: 59800,
            originalPrice: 79800,
            image: "",
            category: "device",
            sales: 860,
            badge: "入门推荐",
          },
          {
            id: "prod-003",
            name: "阻鼾器专用清洁片（30片装）",
            desc: "温和无刺激，彻底去除异味细菌",
            price: 5800,
            originalPrice: 7800,
            image: "",
            category: "accessory",
            sales: 3200,
          },
          {
            id: "prod-004",
            name: "阻鼾器收纳保护盒",
            desc: "透气防尘，旅行携带方便",
            price: 2800,
            image: "",
            category: "accessory",
            sales: 980,
          },
          {
            id: "prod-005",
            name: "前移量调节工具套装",
            desc: "专业调节辅助工具，精准每步 0.5mm",
            price: 3500,
            image: "",
            category: "accessory",
            sales: 420,
          },
          {
            id: "prod-006",
            name: "睡眠健康管理套餐（3个月）",
            desc: "含初诊评估 + 设备定制 + 3次复诊随访",
            price: 158e3,
            originalPrice: 218e3,
            image: "",
            category: "service",
            sales: 156,
            badge: "限时优惠",
          },
          {
            id: "prod-007",
            name: "在线复诊服务（单次）",
            desc: "视频面诊，医生远程评估调整方案",
            price: 19900,
            image: "",
            category: "service",
            sales: 340,
          },
        ],
        d = e.computed(() =>
          "all" === r.value
            ? c.value
            : c.value.filter((e) => e.category === r.value),
        );
      function t(e) {
        return "¥" + (e / 100).toFixed(2);
      }
      const navbarHeight = e.ref(88);
      e.onMounted(() => {
        try {
          const windowInfo = e.index.getWindowInfo();
          const statusBarHeight = windowInfo.statusBarHeight || 44;
          navbarHeight.value = statusBarHeight + 44;
        } catch (err) {
          console.error(err);
        }
        setTimeout(() => {
          ((c.value = l), (o.value = !1));
        }, 300);
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
                    { a: a.image },
                    a.image
                      ? { b: a.image }
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
                      j: e.t(t(a.price)),
                      k: a.originalPrice,
                    },
                    a.originalPrice ? { l: e.t(t(a.originalPrice)) } : {},
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
