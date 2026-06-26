"use strict";
const e = require("../../../common/vendor.js"),
  api = require("../../../api/index.js");
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

      async function loadPostDetail(postId) {
        try {
          const res = await api.getCommunityPostDetail(postId);
          if (res && res.code === 0) {
            n.value = res.data;
            s.value = res.data.comments || [];
          }
        } catch (err) {
          console.error(err);
        }
      }

      if (d) {
        u.value = d;
        loadPostDetail(d);
      }

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
          if (c.value.trim()) {
            m.value = true;
            try {
              const res = await api.commentCommunityPost(u.value, c.value);
              if (res && res.code === 0) {
                s.value.unshift(res.data);
                n.value.comments++;
                c.value = "";
                e.index.showToast({ title: "评论成功", icon: "success" });
              }
            } catch (err) {
              console.error(err);
              e.index.showToast({ title: "评论失败", icon: "none" });
            } finally {
              m.value = false;
            }
          }
        };
      function reportPost() {
        e.index.showActionSheet({
          itemList: ["垃圾广告", "违规言论", "侮辱谩骂", "涉嫌欺诈", "其他原因"],
          success: async (res) => {
            const reasons = ["垃圾广告", "违规言论", "侮辱谩骂", "涉嫌欺诈", "其他原因"];
            e.index.showLoading({ title: "提交举报..." });
            try {
              await api.reportCommunityPost(u.value, reasons[res.tapIndex] || "其他原因");
              e.index.hideLoading();
              e.index.showToast({ title: "举报成功，感谢您的反馈！", icon: "success" });
            } catch (err) {
              e.index.hideLoading();
              e.index.showToast({ title: "举报失败，请稍后重试", icon: "none" });
            }
          }
        });
      }
      return (t, a) =>
        e.e(
          { a: e.p({ title: "帖子详情", showBack: !0 }), b: n.value },
          n.value
            ? e.e(
                {
                  reportPost: e.o(reportPost),
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
                  p: e.o(async (e) => {
                    const newLiked = !n.value.isLiked;
                    n.value.isLiked = newLiked;
                    n.value.likes += newLiked ? 1 : -1;
                    try {
                      await api.likeCommunityPost(n.value.id, newLiked);
                    } catch (err) {
                      console.error(err);
                    }
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
