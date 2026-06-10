"use strict";
const e = require("../../../common/vendor.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  a = e.defineComponent({
    __name: "index",
    setup(t) {
      const a = e.ref(""),
        n = e.ref(""),
        i = e.ref([]),
        o = e.ref(!1),
        l = [
          "适应期",
          "治疗分享",
          "AHI改善",
          "设备保养",
          "科普问答",
          "情感支持",
          "经验交流",
        ];
      function s() {
        a.value.trim() && n.value.trim()
          ? ((o.value = !0),
            setTimeout(() => {
              const t = {
                id: "p-new-" + Date.now(),
                author: "我",
                avatar: "",
                role: "patient",
                roleLabel: "鼾症患者",
                title: a.value.trim(),
                content: n.value.trim(),
                images: [],
                tags: [...i.value],
                likes: 0,
                comments: 0,
                isLiked: !1,
                createdAt: new Date().toISOString(),
                isTop: !1,
              };
              (e.index.$emit("newPost", t),
                e.index.showToast({ title: "发布成功", icon: "success" }),
                setTimeout(() => e.index.navigateBack(), 800));
            }, 600))
          : e.index.showToast({ title: "请填写标题和内容", icon: "none" });
      }
      return (t, u) => ({
        a: e.p({ title: "发帖", showBack: !0 }),
        b: a.value,
        c: e.o((e) => (a.value = e.detail.value), "31"),
        d: n.value,
        e: e.o((e) => (n.value = e.detail.value), "f3"),
        f: e.t(n.value.length),
        g: e.f(l, (t, a, n) => ({
          a: e.t(t),
          b: t,
          c: i.value.includes(t) ? 1 : "",
          d: e.o(
            (e) =>
              (function (e) {
                const t = i.value.indexOf(e);
                t >= 0
                  ? i.value.splice(t, 1)
                  : i.value.length < 3 && i.value.push(e);
              })(t),
            t,
          ),
        })),
        h: e.t(o.value ? "发布中..." : "发布帖子"),
        i: a.value.trim() && n.value.trim() && !o.value ? "" : 1,
        j: e.o(s, "76"),
      });
    },
  }),
  n = e._export_sfc(a, [["__scopeId", "data-v-c3d232f9"]]);
wx.createPage(n);
