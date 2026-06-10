"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js"),
  a = e.defineComponent({
    __name: "index",
    setup(a) {
      const n = e.ref(null),
        i = e.ref([]),
        r = (e) => {
          const t = new Date(e);
          return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
        };
      return (
        e.onMounted(async () => {
          var e, a, r, l;
          const u = getCurrentPages(),
            d = null == (e = u[u.length - 1].options) ? void 0 : e.id;
          if (d)
            try {
              const e = await t.getLiveRoomDetail(d);
              if (
                ((n.value = e.data || e),
                null == (r = null == (a = n.value) ? void 0 : a.productIds)
                  ? void 0
                  : r.length)
              ) {
                const e = await t.getProducts(),
                  a = (null == (l = e.data) ? void 0 : l.list) || e.list || [];
                i.value = a.filter((e) => n.value.productIds.includes(e.id));
              }
            } catch (o) {}
        }),
        (t, a) => {
          return e.e(
            { a: e.t("1小时30分"), b: n.value },
            n.value
              ? {
                  c: e.t(n.value.title),
                  d: e.t(n.value.anchorName[0]),
                  e: e.t(n.value.anchorName),
                  f: e.t(r(n.value.startTime)),
                  g: e.t(
                    ((l = n.value.viewerCount),
                    l > 1e3 ? (l / 1e3).toFixed(1) + "k" : String(l)),
                  ),
                  h: e.t(n.value.description),
                }
              : {},
            { i: i.value.length },
            i.value.length
              ? {
                  j: e.f(i.value, (t, a, n) => ({
                    a: t.image,
                    b: e.t(t.name),
                    c: t.id,
                    d: e.o((a) => {
                      return (
                        (n = "/pages/product/detail?id=" + t.id),
                        e.index.navigateTo({ url: n })
                      );
                      var n;
                    }, t.id),
                    e: e.t((t.price / 100).toFixed(0)),
                  })),
                }
              : {},
          );
          var l;
        }
      );
    },
  }),
  n = e._export_sfc(a, [["__scopeId", "data-v-e4fc628d"]]);
wx.createPage(n);
