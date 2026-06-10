"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../mock/posts.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  o = e.defineComponent({
    __name: "index",
    setup(a) {
      var o, l, i;
      const u = e.ref(""),
        n = e.ref(null),
        s = e.ref([]);
      e.index.$on("pageLoad", () => {});
      const v = getCurrentPages(),
        r = v[v.length - 1],
        d =
          (null == (o = null == r ? void 0 : r.options) ? void 0 : o.id) ||
          (null ==
          (i = null == (l = null == r ? void 0 : r.$page) ? void 0 : l.options)
            ? void 0
            : i.id);
      if (d) {
        u.value = d;
        const e = t.mockPosts.find((e) => e.id === d);
        e && ((n.value = { ...e }), (s.value = [...(t.mockComments[d] || [])]));
      }
      n.value ||
        ((n.value = { ...t.mockPosts[0] }),
        (s.value = [...(t.mockComments[t.mockPosts[0].id] || [])]),
        t.mockPosts[0] && (u.value = t.mockPosts[0].id));
      const c = e.ref(""),
        m = e.ref(!1),
        k = (e) => {
          const t = new Date("2026-06-04"),
            a = new Date(e),
            o = (t.getTime() - a.getTime()) / 1e3 / 60;
          return o < 60
            ? `${Math.round(o)}分钟前`
            : o < 1440
              ? `${Math.round(o / 60)}小时前`
              : `${Math.round(o / 1440)}天前`;
        },
        h = async () => {
          c.value.trim() &&
            ((m.value = !0),
            setTimeout(() => {
              (s.value.unshift({
                id: "c-" + Date.now(),
                author: "我",
                avatar: "",
                content: c.value,
                likes: 0,
                isLiked: !1,
                createdAt: new Date().toISOString(),
              }),
                n.value.comments++,
                (c.value = ""),
                (m.value = !1),
                e.index.showToast({ title: "评论成功", icon: "success" }));
            }, 500));
        };
      return (t, a) =>
        e.e(
          { a: e.p({ title: "帖子详情", showBack: !0 }), b: n.value },
          n.value
            ? e.e(
                {
                  c: e.t(n.value.author[0]),
                  d:
                    "doctor" === n.value.role
                      ? "#3B6BF5"
                      : "expert" === n.value.role
                        ? "#8B5CF6"
                        : "#1A9D5C",
                  e: e.t(n.value.author),
                  f: e.t(n.value.roleLabel),
                  g: e.n("role--" + n.value.role),
                  h: e.t(k(n.value.createdAt)),
                  i: e.t(n.value.title),
                  j: e.t(n.value.content),
                  k: n.value.tags.length,
                },
                n.value.tags.length
                  ? { l: e.f(n.value.tags, (t, a, o) => ({ a: e.t(t), b: t })) }
                  : {},
                {
                  m: e.t(n.value.isLiked ? "❤️" : "🤍"),
                  n: e.n(n.value.isLiked ? "action-icon liked" : "action-icon"),
                  o: e.t(n.value.likes),
                  p: e.o((e) => {
                    ((n.value.isLiked = !n.value.isLiked),
                      (n.value.likes += n.value.isLiked ? 1 : -1));
                  }, "78"),
                  q: e.t(n.value.comments),
                  r: e.t(n.value.comments),
                  s: e.f(s.value, (t, a, o) => {
                    var l, i;
                    return e.e(
                      {
                        a: e.t(t.author[0]),
                        b: e.t(t.author),
                        c: e.t(k(t.createdAt)),
                        d: e.t(t.content),
                        e: null == (l = t.replies) ? void 0 : l.length,
                      },
                      (null == (i = t.replies) ? void 0 : i.length)
                        ? {
                            f: e.f(t.replies, (t, a, o) => ({
                              a: e.t(t.author),
                              b: e.t(t.content),
                              c: t.id,
                            })),
                          }
                        : {},
                      {
                        g: e.t(t.isLiked ? "❤️" : "🤍"),
                        h: e.t(t.likes),
                        i: e.o((e) => {
                          return (
                            ((a = t).isLiked = !a.isLiked),
                            void (a.likes += a.isLiked ? 1 : -1)
                          );
                          var a;
                        }, t.id),
                        j: e.o((e) => (c.value = "@" + t.author + " "), t.id),
                        k: t.id,
                      },
                    );
                  }),
                },
              )
            : {},
          {
            t: e.o(h, "24"),
            v: c.value,
            w: e.o((e) => (c.value = e.detail.value), "e3"),
            x: c.value.trim() ? "" : 1,
            y: e.o(h, "80"),
          },
        );
    },
  }),
  l = e._export_sfc(o, [["__scopeId", "data-v-d95e15f4"]]);
wx.createPage(l);
