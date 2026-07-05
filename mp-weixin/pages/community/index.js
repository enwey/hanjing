"use strict";
const e = require("../../common/vendor.js"),
  api = require("../../api/index.js");
Math || o();
const o = () => "../../components/base/hj-navbar.js",
  i = e.defineComponent({
    __name: "index",
    setup(o) {
      const isLoading = e.ref(!0),
        activeTab = e.ref("hot"),
        posts = e.ref([]),
        isExpertPost = (item) =>
          "专家" === item.category || "doctor" === item.role || "expert" === item.role,
        displayPosts = e.computed(() => {
          let list = [...posts.value];
          "expert" === activeTab.value &&
            (list = list.filter((item) => isExpertPost(item)));
          "hot" === activeTab.value &&
            list.sort((a, b) => {
              const likeDiff = Number(b.likes || 0) - Number(a.likes || 0);
              if (likeDiff !== 0) return likeDiff;
              return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
          ("latest" === activeTab.value || "expert" === activeTab.value) &&
            list.sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            );
          return [...list.filter((item) => item.isTop), ...list.filter((item) => !item.isTop)];
        });
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
      function splitTags(tags) {
        const values = Array.isArray(tags) ? tags.filter(Boolean) : [];
        return {
          category: values[0] || "",
          labels: values.slice(1),
        };
      }
      function formatPublishTime(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const pad = (num) => String(num).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
      }
      function normalizePost(post) {
        const { category, labels } = splitTags(post.tags);
        return {
          ...post,
          author: post.author || "",
          avatar: post.avatar || "",
          roleLabel: post.roleLabel || "",
          content: post.content || "",
          title: post.title || "",
          category,
          labels,
          likes: Number(post.likes || 0),
          comments: Number(post.comments || 0),
          createdAt: post.createdAt || "",
          isLiked: !!post.isLiked,
        };
      }
      async function loadPosts() {
        isLoading.value = !0;
        try {
          const res = await api.getCommunityPosts();
          if (res && res.code === 0) {
            posts.value = Array.isArray(res.data) ? res.data.map(normalizePost) : [];
          }
        } catch (err) {
          console.error(err);
        } finally {
          isLoading.value = !1;
        }
      }
      function handleNewPost(post) {
        posts.value.unshift(normalizePost(post));
        activeTab.value = "latest";
        e.index.showToast({ title: "帖子已发布", icon: "success" });
      }
      function goPostDetail(postId) {
        e.index.navigateTo({ url: `/pages/community/detail/index?id=${postId}` });
      }
      function goPublishPost() {
        e.index.navigateTo({ url: "/pages/community/publish/index" });
      }
      return (
        e.onMounted(() => {
          loadPosts();
          e.index.$on("newPost", handleNewPost);
        }),
        e.onUnmounted(() => {
          e.index.$off("newPost", handleNewPost);
        }),
        (t, o) =>
          e.e(
            {
              a: e.p({ title: "医患社区", "show-back": !0 }),
              b: e.o(goPublishPost, "publish-entry"),
              c: e.f(
                [
                  { key: "hot", label: "热门" },
                  { key: "latest", label: "最新" },
                  { key: "expert", label: "专家" },
                ],
                (tab, o, i) => ({
                  a: e.t(tab.label),
                  b: tab.key,
                  c: activeTab.value === tab.key ? 1 : "",
                  d: e.o(() => {
                    activeTab.value = tab.key;
                  }, tab.key),
                }),
              ),
              d: e.f(displayPosts.value, (post, o, i) =>
                e.e(
                  { a: post.isTop },
                  post.isTop ? {} : {},
                  {
                    b: post.avatar,
                    c: e.t(post.author),
                    d: e.t(post.roleLabel),
                    e: e.n("role--" + post.role),
                    f: e.t(formatPublishTime(post.createdAt)),
                    g: !!post.title,
                    h: e.t(post.title),
                    i: e.t(post.content),
                    j: !!post.category,
                    k: e.t(post.category),
                    l: e.n(getCategoryClass(post.category)),
                    m: post.labels.length,
                  },
                  post.labels.length
                    ? {
                        n: e.f(post.labels, (tag, o, i) => ({
                          a: e.t(tag),
                          b: tag,
                        })),
                      }
                    : {},
                  {
                    o: post.isLiked
                      ? "/static/icons/heart-active.svg"
                      : "/static/icons/heart.svg",
                    p: post.isLiked ? "liked" : "",
                    q: e.t(post.likes),
                    r: e.o(
                      async () => {
                        const nextLiked = !post.isLiked;
                        const previousLiked = post.isLiked;
                        const previousLikes = post.likes;
                        post.isLiked = nextLiked;
                        post.likes += nextLiked ? 1 : -1;
                        try {
                          await api.likeCommunityPost(post.id, nextLiked);
                        } catch (err) {
                          console.error(err);
                          post.isLiked = previousLiked;
                          post.likes = previousLikes;
                          e.index.showToast({ title: "点赞失败，请稍后重试", icon: "none" });
                        }
                      },
                      post.id,
                    ),
                    s: e.t(post.comments),
                    t: e.o(() => goPostDetail(post.id), post.id),
                    u: post.id,
                    v: e.o(() => goPostDetail(post.id), post.id),
                  },
                ),
              ),
              e: !displayPosts.value.length && !isLoading.value,
            },
            (displayPosts.value.length || isLoading.value, {}),
            { f: e.o(goPublishPost, "fab") },
          )
      );
    },
  }),
  n = e._export_sfc(i, [["__scopeId", "data-v-b7ab25fd"]]);
wx.createPage(n);
