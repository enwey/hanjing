"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
if (!Array) {
  e.resolveComponent("hj-empty")();
}
Math;
const a = e.defineComponent({
    __name: "index",
    setup(a) {
      const n = e.ref([]),
        o = e.ref("all"),
        u = e.computed(() =>
          "all" === o.value
            ? n.value
            : n.value.filter((e) => e.status === o.value),
        ),
        i = (e) => {
          const t = new Date(e);
          return `${t.getMonth() + 1}月${t.getDate()}日 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
        };
      return (
        e.onMounted(async () => {
          var e;
          try {
            const a = await t.getLiveRooms();
            n.value = (null == (e = a.data) ? void 0 : e.list) || a.list || [];
          } catch (a) {}
        }),
        (t, a) =>
          e.e(
            {
              a: "all" === o.value ? 1 : "",
              b: e.o((e) => (o.value = "all"), "a8"),
              c: "replay" === o.value ? 1 : "",
              d: e.o((e) => (o.value = "replay"), "86"),
              e: "upcoming" === o.value ? 1 : "",
              f: e.o((e) => (o.value = "upcoming"), "89"),
              g: e.f(u.value, (t, a, n) => {
                return e.e(
                  {
                    a: t.cover,
                    b: e.t(
                      "live" === t.status
                        ? "直播中"
                        : "replay" === t.status
                          ? "回放"
                          : "预告",
                    ),
                    c: e.n(t.status),
                    d: "upcoming" === t.status,
                  },
                  "upcoming" === t.status ? { e: e.t(i(t.startTime)) } : {},
                  {
                    f: e.t(t.title),
                    g: e.t(t.anchorName[0]),
                    h: e.t(t.anchorName),
                    i: "upcoming" !== t.status,
                  },
                  "upcoming" !== t.status
                    ? {
                        j: e.t(
                          ((o = t.viewerCount),
                          o > 1e3 ? (o / 1e3).toFixed(1) + "k" : String(o)),
                        ),
                      }
                    : {},
                  {
                    k: e.f(t.tags, (t, a, n) => ({ a: e.t(t), b: t })),
                    l: t.id,
                    m: e.o(
                      (a) =>
                        ((t) => {
                          "upcoming" !== t.status
                            ? e.index.navigateTo({
                                url: "/pages/live/playback/index?id=" + t.id,
                              })
                            : e.index.showToast({
                                title: "直播尚未开始",
                                icon: "none",
                              });
                        })(t),
                      t.id,
                    ),
                  },
                );
                var o;
              }),
              h: !u.value.length,
            },
            u.value.length ? {} : { i: e.p({ text: "暂无直播" }) },
          )
      );
    },
  }),
  n = e._export_sfc(a, [["__scopeId", "data-v-b8fa8280"]]);
wx.createPage(n);
