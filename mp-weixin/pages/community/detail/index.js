"use strict";
const e = require("../../../common/vendor.js"),
  api = require("../../../api/index.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  o = e.defineComponent({
    __name: "index",
    setup(a) {
      const postId = e.ref(""),
        postDetail = e.ref(null),
        commentsList = e.ref([]),
        isLoading = e.ref(!0),
        loadFailed = e.ref(!1),
        loadErrorMessage = e.ref("加载帖子详情失败，请稍后重试"),
        commentInput = e.ref(""),
        isSubmitting = e.ref(!1),
        replyTarget = e.ref(null);
      function getRoleLabel(role, roleLabel) {
        return roleLabel || ("doctor" === role ? "专家医生" : "expert" === role ? "睡眠专家" : "鼾友");
      }
      function getCategoryClass(name) {
        return [
          "阻鼾器配戴",
          "睡眠科普",
          "科普问答",
          "专家",
        ].includes(name)
          ? "tag-theme--blue"
          : ["打鼾治疗", "治疗分享", "经验交流"].includes(name)
            ? "tag-theme--green"
            : ["OSAHS改善", "AHI改善"].includes(name)
              ? "tag-theme--orange"
              : ["适应期", "设备保养"].includes(name)
                ? "tag-theme--amber"
                : ["情感支持"].includes(name)
                  ? "tag-theme--pink"
                  : "tag-theme--violet";
      }
      function formatDateTime(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const pad = (num) => String(num).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      }
      function splitTags(tags) {
        const values = Array.isArray(tags) ? tags.filter(Boolean) : [];
        return {
          category: values[0] || "",
          labels: values.slice(1),
        };
      }
      function normalizeComment(comment) {
        return {
          id: comment.id,
          author: comment.author || "",
          avatar: comment.avatar || "",
          content: comment.content || "",
          likes: Number(comment.likes || 0),
          createdAt: comment.createdAt || "",
          displayTime: formatDateTime(comment.createdAt),
          parentId: comment.parentId || null,
          parentAuthor: comment.parentAuthor || "",
          isLiked: !!comment.isLiked,
        };
      }
      function normalizePostDetail(detail) {
        const tags = splitTags(detail.tags),
          comments = Array.isArray(detail.comments) ? detail.comments.map(normalizeComment) : [],
          role = detail.role || "patient";
        return {
          id: detail.id,
          author: detail.author || "",
          avatar: detail.avatar || "",
          role,
          roleLabel: getRoleLabel(role, detail.roleLabel),
          roleClass: `role--${role}`,
          title: detail.title || "",
          content: detail.content || "",
          coverUrl: detail.coverUrl || "",
          category: tags.category,
          labels: tags.labels,
          likes: Number(detail.likes || 0),
          commentsCount: Number(detail.commentsCount || 0),
          createdAt: detail.createdAt || "",
          displayTime: formatDateTime(detail.createdAt),
          isLiked: !!detail.isLiked,
          comments,
        };
      }
      async function loadPostDetail(id) {
        if (!id) return;
        isLoading.value = !0;
        loadFailed.value = !1;
        loadErrorMessage.value = "加载帖子详情失败，请稍后重试";
        try {
          const res = await api.getCommunityPostDetail(id);
          if (res && res.code === 0 && res.data) {
            const formattedDetail = normalizePostDetail(res.data);
            postDetail.value = formattedDetail;
            commentsList.value = formattedDetail.comments;
          } else {
            throw new Error((null == res ? void 0 : res.message) || "加载帖子详情失败");
          }
        } catch (err) {
          console.error("loadPostDetail error:", err);
          postDetail.value = null;
          commentsList.value = [];
          loadFailed.value = !0;
          loadErrorMessage.value = err && err.message ? err.message : "加载帖子详情失败，请稍后重试";
        } finally {
          isLoading.value = !1;
        }
      }
      e.onLoad((options) => {
        if (options && options.id) {
          postId.value = options.id;
          loadPostDetail(options.id);
        } else {
          isLoading.value = !1;
          loadFailed.value = !0;
          loadErrorMessage.value = "帖子参数缺失，请返回列表重试";
        }
      });
      const submitComment = async () => {
          if (!commentInput.value.trim()) return;
          isSubmitting.value = !0;
          try {
            const res = await api.commentCommunityPost(
              postId.value,
              commentInput.value,
              replyTarget.value ? replyTarget.value.id : null,
            );
            if (res && res.code === 0) {
              commentsList.value.unshift(normalizeComment(res.data || {}));
              postDetail.value && (postDetail.value.commentsCount += 1);
              commentInput.value = "";
              replyTarget.value = null;
              e.index.showToast({ title: "评论成功", icon: "success" });
            }
          } catch (err) {
            console.error(err);
            e.index.showToast({ title: "评论失败", icon: "none" });
          } finally {
            isSubmitting.value = !1;
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
          },
        });
      }
      async function handlePostLike() {
        if (!postDetail.value) return;
        const previousLiked = postDetail.value.isLiked,
          previousLikes = postDetail.value.likes,
          nextLiked = !previousLiked;
        postDetail.value.isLiked = nextLiked;
        postDetail.value.likes += nextLiked ? 1 : -1;
        try {
          await api.likeCommunityPost(postDetail.value.id, nextLiked);
        } catch (err) {
          console.error(err);
          postDetail.value.isLiked = previousLiked;
          postDetail.value.likes = previousLikes;
          e.index.showToast({ title: "点赞失败，请稍后重试", icon: "none" });
        }
      }
      async function handleCommentLike(comment) {
        const previousLiked = comment.isLiked,
          previousLikes = comment.likes,
          nextLiked = !previousLiked;
        comment.isLiked = nextLiked;
        comment.likes += nextLiked ? 1 : -1;
        try {
          await api.likeCommunityComment(comment.id, nextLiked);
        } catch (err) {
          console.error(err);
          comment.isLiked = previousLiked;
          comment.likes = previousLikes;
          e.index.showToast({ title: "点赞失败，请稍后重试", icon: "none" });
        }
      }
      function handleReply(comment) {
        replyTarget.value = comment;
      }
      function clearReplyTarget() {
        replyTarget.value = null;
        commentInput.value = "";
      }
      function retryLoad() {
        loadPostDetail(postId.value);
      }
      return (t, a) =>
        e.e(
          {
            a: e.p({ title: "帖子详情", showBack: !0 }),
            b: isLoading.value,
            c: loadFailed.value,
            d: e.t(loadErrorMessage.value),
            e: e.o(retryLoad, "retry"),
            f: postDetail.value,
          },
          isLoading.value
            ? {}
            : loadFailed.value
              ? {}
              : postDetail.value
            ? e.e(
                {
                  g: postDetail.value.avatar,
                  h: e.t(postDetail.value.author),
                  i: e.t(postDetail.value.roleLabel),
                  j: e.n(postDetail.value.roleClass),
                  k: e.t(postDetail.value.displayTime),
                  l: e.o(reportPost, "report"),
                  m: e.t(postDetail.value.title),
                  n: e.t(postDetail.value.content),
                  o: postDetail.value.coverUrl,
                  p: !!postDetail.value.category,
                  q: e.t(postDetail.value.category),
                  r: e.n(getCategoryClass(postDetail.value.category)),
                  s: postDetail.value.labels.length,
                },
                postDetail.value.labels.length
                  ? {
                      t: e.f(postDetail.value.labels, (tag, a, o) => ({
                        a: e.t(tag),
                        b: tag,
                      })),
                    }
                  : {},
                {
                  u: postDetail.value.isLiked
                    ? "/static/icons/heart-active.svg"
                    : "/static/icons/heart.svg",
                  v: postDetail.value.isLiked ? "liked" : "",
                  w: e.t(postDetail.value.likes),
                  x: e.o(handlePostLike, "post-like"),
                  y: e.t(postDetail.value.commentsCount),
                  z: e.t(postDetail.value.commentsCount),
                  A: commentsList.value.length,
                },
                commentsList.value.length
                  ? {
                      B: e.f(commentsList.value, (comment, a, o) => ({
                        a: comment.avatar,
                        b: comment.avatar,
                        c: e.t(comment.author),
                        d: e.t(comment.displayTime),
                        e: !!comment.parentAuthor,
                        f: e.t(comment.parentAuthor),
                        g: e.t(comment.content),
                        h: comment.isLiked
                          ? "/static/icons/heart-active.svg"
                          : "/static/icons/heart.svg",
                        i: comment.isLiked ? "liked" : "",
                        j: e.t(comment.likes),
                        k: e.o(() => handleCommentLike(comment), comment.id),
                        l: e.o(() => handleReply(comment), comment.id),
                        m: comment.id,
                      })),
                    }
                  : {},
                {
                  C: !commentsList.value.length,
                },
              )
            : {},
          {
            D: postDetail.value,
            E: replyTarget.value,
            F: e.t(replyTarget.value ? replyTarget.value.author : ""),
            G: e.o(clearReplyTarget, "clear-reply"),
            H: e.o(submitComment, "input-confirm"),
            I: replyTarget.value ? `回复 ${replyTarget.value.author}` : "写评论...",
            J: commentInput.value,
            K: e.o((e) => (commentInput.value = e.detail.value), "input"),
            L: commentInput.value.trim() && !isSubmitting.value ? "" : 1,
            M: e.t(isSubmitting.value ? "发送中" : "发送"),
            N: e.o(submitComment, "send"),
          },
        );
    },
  }),
  l = e._export_sfc(o, [["__scopeId", "data-v-d95e15f4"]]);
wx.createPage(l);
