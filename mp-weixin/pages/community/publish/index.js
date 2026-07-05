"use strict";
const e = require("../../../common/vendor.js"),
  api = require("../../../api/index.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  a = e.defineComponent({
    __name: "index",
    setup(t) {
      const title = e.ref(""),
        content = e.ref(""),
        selectedCategory = e.ref("睡眠科普"),
        selectedTags = e.ref([]),
        isSubmitting = e.ref(!1),
        categoryOptions = [
          "睡眠科普",
          "治疗知识",
          "设备介绍",
          "患者故事",
          "阻鼾器配戴",
          "科普问答",
        ],
        tagOptions = [
          "适应期",
          "治疗分享",
          "AHI改善",
          "设备保养",
          "情感支持",
          "经验交流",
        ];
      async function submitPublish() {
        if (!title.value.trim() || !content.value.trim()) {
          e.index.showToast({ title: "请填写标题和内容", icon: "none" });
          return;
        }
        isSubmitting.value = !0;
        try {
          const res = await api.createCommunityPost({
            title: title.value.trim(),
            content: content.value.trim(),
            tags: [selectedCategory.value, ...selectedTags.value],
          });
          if (res && res.code === 0) {
            e.index.$emit("newPost", res.data);
            e.index.showToast({ title: "发布成功", icon: "success" });
            setTimeout(() => e.index.navigateBack(), 800);
          } else {
            e.index.showToast({ title: "发布失败，请重试", icon: "none" });
          }
        } catch (err) {
          console.error(err);
          e.index.showToast({ title: "发布失败，请重试", icon: "none" });
        } finally {
          isSubmitting.value = !1;
        }
      }
      function toggleTag(tag) {
        const index = selectedTags.value.indexOf(tag);
        if (index >= 0) {
          selectedTags.value.splice(index, 1);
          return;
        }
        if (selectedTags.value.length >= 3) {
          e.index.showToast({ title: "最多选择3个标签", icon: "none" });
          return;
        }
        selectedTags.value.push(tag);
      }
      return (t, n) => ({
        a: e.p({ title: "发帖", showBack: !0 }),
        b: e.f(categoryOptions, (t, a, n) => ({
          a: e.t(t),
          b: t,
          c: selectedCategory.value === t ? 1 : "",
          d: e.o(() => {
            selectedCategory.value = t;
          }, t),
        })),
        c: title.value,
        d: e.o((e) => (title.value = e.detail.value), "title"),
        e: content.value,
        f: e.o((e) => (content.value = e.detail.value), "content"),
        g: e.t(content.value.length),
        h: e.f(tagOptions, (t, a, n) => ({
          a: e.t(t),
          b: t,
          c: selectedTags.value.includes(t) ? 1 : "",
          d: e.o(() => toggleTag(t), t),
        })),
        i: e.t(isSubmitting.value ? "发布中..." : "发布帖子"),
        j: title.value.trim() && content.value.trim() && !isSubmitting.value ? "" : 1,
        k: e.o(submitPublish, "submit"),
      });
    },
  }),
  n = e._export_sfc(a, [["__scopeId", "data-v-c3d232f9"]]);
wx.createPage(n);
