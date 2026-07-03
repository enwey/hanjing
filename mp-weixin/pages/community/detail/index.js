"use strict";
const e = require("../../../common/vendor.js"),
  api = require("../../../api/index.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  o = e.defineComponent({
    __name: "index",
    setup(a) {
      var o, l, i;
      const postId = e.ref(""),
        postDetail = e.ref(null),
        commentsList = e.ref([]);
      e.index.$on("pageLoad", () => {});
      const v = getCurrentPages(),
        r = v[v.length - 1],
        d =
          (null == (o = null == r ? void 0 : r.options) ? void 0 : o.id) ||
          (null ==
          (i = null == (l = null == r ? void 0 : r.$page) ? void 0 : l.options)
            ? void 0
            : i.id);

      async function loadPostDetail(id) {
        try {
          const res = await api.getCommunityPostDetail(id);
          if (res && res.code === 0) {
            postDetail.value = res.data;
            commentsList.value = res.data.comments || [];
          }
        } catch (err) {
          console.error(err);
        }
      }

      if (d) {
        postId.value = d;
        loadPostDetail(d);
      }

      const commentInput = e.ref(""),
        isSubmitting = e.ref(!1),
        formatTimeAgo = (e) => {
          const t = new Date("2026-06-04"),
            a = new Date(e),
            o = (t.getTime() - a.getTime()) / 1e3 / 60;
          return o < 60
            ? `${Math.round(o)}分钟前`
            : o < 1440
              ? `${Math.round(o / 60)}小时前`
              : `${Math.round(o / 1440)}天前`;
        },
        submitComment = async () => {
          if (commentInput.value.trim()) {
            isSubmitting.value = true;
            try {
              const res = await api.commentCommunityPost(postId.value, commentInput.value);
              if (res && res.code === 0) {
                commentsList.value.unshift(res.data);
                postDetail.value.comments++;
                commentInput.value = "";
                e.index.showToast({ title: "评论成功", icon: "success" });
              }
            } catch (err) {
              console.error(err);
              e.index.showToast({ title: "评论失败", icon: "none" });
            } finally {
              isSubmitting.value = false;
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
              await api.reportCommunityPost(postId.value, reasons[res.tapIndex] || "其他原因");
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
          { a: e.p({ title: "帖子详情", showBack: !0 }), b: postDetail.value },
          postDetail.value
            ? e.e(
                {
                  reportPost: e.o(reportPost),
                  c: e.t(postDetail.value.author[0]),
                  d:
                    "doctor" === postDetail.value.role
                      ? "#3B6BF5"
                      : "expert" === postDetail.value.role
                        ? "#8B5CF6"
                        : "#1A9D5C",
                  e: e.t(postDetail.value.author),
                  f: e.t(postDetail.value.roleLabel),
                  g: e.n("role--" + postDetail.value.role),
                  h: e.t(formatTimeAgo(postDetail.value.createdAt)),
                  i: e.t(postDetail.value.title),
                  j: e.t(postDetail.value.content),
                  k: postDetail.value.tags.length,
                },
                postDetail.value.tags.length
                  ? { l: e.f(postDetail.value.tags, (t, a, o) => ({ a: e.t(t), b: t })) }
                  : {},
                {
                  m: e.t(postDetail.value.isLiked ? "❤️" : "🤍"),
                  n: e.n(postDetail.value.isLiked ? "action-icon liked" : "action-icon"),
                  o: e.t(postDetail.value.likes),
                  p: e.o(async (e) => {
                    const newLiked = !postDetail.value.isLiked;
                    postDetail.value.isLiked = newLiked;
                    postDetail.value.likes += newLiked ? 1 : -1;
                    try {
                      await api.likeCommunityPost(postDetail.value.id, newLiked);
                    } catch (err) {
                      console.error(err);
                    }
                  }, "78"),
                  q: e.t(postDetail.value.comments),
                  r: e.t(postDetail.value.comments),
                  s: e.f(commentsList.value, (t, a, o) => {
                    var l, i;
                    return e.e(
                      {
                        a: e.t(t.author[0]),
                        b: e.t(t.author),
                        c: e.t(formatTimeAgo(t.createdAt)),
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
                        j: e.o((e) => (commentInput.value = "@" + t.author + " "), t.id),
                        k: t.id,
                      },
                    );
                  }),
                },
              )
            : {},
          {
            t: e.o(submitComment, "24"),
            v: commentInput.value,
            w: e.o((e) => (commentInput.value = e.detail.value), "e3"),
            x: commentInput.value.trim() ? "" : 1,
            y: e.o(submitComment, "80"),
          },
        );
    },
  }),
  l = e._export_sfc(o, [["__scopeId", "data-v-d95e15f4"]]);
wx.createPage(l);
