"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../mock/posts.js");
Math || o();
const o = () => "../../components/base/hj-navbar.js",
  i = e.defineComponent({
    __name: "index",
    setup(o) {
      const i = e.ref(!0),
        n = e.ref("hot"),
        a = e.ref([]),
        l = e.computed(() => {
          let e = [...a.value];
          ("expert" === n.value &&
            (e = e.filter((e) => "doctor" === e.role || "expert" === e.role)),
            "hot" === n.value && e.sort((e, t) => t.likes - e.likes),
            "latest" === n.value &&
              e.sort(
                (e, t) =>
                  new Date(t.createdAt).getTime() -
                  new Date(e.createdAt).getTime(),
              ));
          return [...e.filter((e) => e.isTop), ...e.filter((e) => !e.isTop)];
        });
      function s(t) {
        (a.value.unshift(t),
          (n.value = "latest"),
          e.index.showToast({ title: "帖子已发布", icon: "success" }));
      }
      function r(e) {
        const t = new Date("2026-06-04"),
          o = new Date(e),
          i = (t.getTime() - o.getTime()) / 1e3 / 60;
        return i < 60
          ? `${Math.round(i)}分钟前`
          : i < 1440
            ? `${Math.round(i / 60)}小时前`
            : `${Math.round(i / 1440)}天前`;
      }
      function u(t) {
        e.index.navigateTo({ url: `/pages/community/detail/index?id=${t}` });
      }
      function d() {
        e.index.navigateTo({ url: "/pages/community/publish/index" });
      }
      return (
        e.onMounted(() => {
          (setTimeout(() => {
            ((a.value = [...t.mockPosts]), (i.value = !1));
          }, 300),
            e.index.$on("newPost", s));
        }),
        e.onUnmounted(() => {
          e.index.$off("newPost", s);
        }),
        (t, o) =>
          e.e(
            {
              a: e.p({ title: "医患社区", "show-back": !0 }),
              b: e.o(d, "61"),
              c: e.f(
                [
                  { key: "hot", label: "热门" },
                  { key: "latest", label: "最新" },
                  { key: "expert", label: "专家" },
                ],
                (t, o, i) => ({
                  a: e.t(t.label),
                  b: t.key,
                  c: n.value === t.key ? 1 : "",
                  d: e.o((e) => {
                    return ((o = t.key), void (n.value = o));
                    var o;
                  }, t.key),
                }),
              ),
              d: e.f(l.value, (t, o, i) =>
                e.e(
                  { a: t.isTop },
                  (t.isTop, {}),
                  {
                    b: e.t(t.author[0]),
                    c:
                      "doctor" === t.role
                        ? "#3B6BF5"
                        : "expert" === t.role
                          ? "#8B5CF6"
                          : "#1A9D5C",
                    d: e.t(t.author),
                    e: e.t(t.roleLabel),
                    f: e.n("role--" + t.role),
                    g: e.t(r(t.createdAt)),
                    h: t.title,
                  },
                  t.title ? { i: e.t(t.title) } : {},
                  { j: e.t(t.content), k: t.tags.length },
                  t.tags.length
                    ? { l: e.f(t.tags, (t, o, i) => ({ a: e.t(t), b: t })) }
                    : {},
                  {
                    m: e.t(t.isLiked ? "❤️" : "🤍"),
                    n: e.n(t.isLiked ? "action-icon liked" : "action-icon"),
                    o: e.t(t.likes),
                    p: e.o(
                      (e) =>
                        (function (e) {
                          ((e.isLiked = !e.isLiked),
                            (e.likes += e.isLiked ? 1 : -1));
                        })(t),
                      t.id,
                    ),
                    q: e.t(t.comments),
                    r: e.o((e) => u(t.id), t.id),
                    s: t.id,
                    t: e.o((e) => u(t.id), t.id),
                  },
                ),
              ),
              e: !l.value.length && !i.value,
            },
            (l.value.length || i.value, {}),
            { f: e.o(d, "9e") },
          )
      );
    },
  }),
  n = e._export_sfc(i, [["__scopeId", "data-v-b7ab25fd"]]);
wx.createPage(n);
