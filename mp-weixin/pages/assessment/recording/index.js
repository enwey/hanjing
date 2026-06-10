"use strict";
const e = require("../../../common/vendor.js"),
  a = require("../../../api/index.js");
Math || l();
const l = () => "../../../components/base/hj-navbar.js",
  u = e.defineComponent({
    __name: "index",
    setup(l) {
      const u = e.ref(!1),
        v = e.ref(!1),
        n = e.ref(!1),
        t = e.ref(0),
        o = e.ref(!1);
      let r = null;
      const s = e.computed(() => {
          const e = Math.floor(t.value / 60),
            a = t.value % 60;
          return `${String(e).padStart(2, "0")}:${String(a).padStart(2, "0")}`;
        }),
        i = e.computed(() => {
          const e = [];
          for (let a = 0; a < 16; a++)
            u.value ? e.push(10 + Math.floor(40 * Math.random())) : e.push(6);
          return e;
        });
      function c() {
        ((u.value = !0),
          (v.value = !1),
          (t.value = 0),
          (r = setInterval(() => {
            t.value++;
          }, 1e3)));
      }
      async function d() {
        o.value = !0;
        try {
          const l = (await a.submitSnoreRecording({ duration: t.value })).data;
          l && l.id
            ? e.index.navigateTo({
                url: "/pages/assessment/snore-result/index?id=" + l.id,
              })
            : e.index.showToast({ title: "分析结果异常", icon: "none" });
        } catch (l) {
          (console.error("[SnoreRecording] 提交失败", l),
            e.index.showToast({
              title: (l && l.message) || "分析失败，请重试",
              icon: "none",
            }));
        } finally {
          o.value = !1;
        }
      }
      return (
        e.onUnmounted(() => {
          r && clearInterval(r);
        }),
        (a, l) =>
          e.e(
            {
              a: e.p({ title: "AI鼾声分析", showBack: !0 }),
              b: u.value || n.value,
            },
            u.value || n.value
              ? {
                  c: e.f(i.value, (e, a, l) => ({
                    a: a,
                    b: e + "px",
                    c: 0.05 * a + "s",
                  })),
                  d: u.value && !v.value ? 1 : "",
                }
              : {},
            { e: u.value || n.value },
            u.value || n.value ? { f: e.t(s.value) } : {},
            { g: u.value && !v.value ? 1 : "", h: !u.value && !n.value },
            u.value || n.value ? (o.value || n.value, {}) : {},
            {
              i: o.value,
              j: n.value,
              k: u.value && !v.value ? 1 : "",
              l: v.value ? 1 : "",
              m: n.value && !u.value ? 1 : "",
              n: o.value ? 1 : "",
              o: e.o(
                (e) =>
                  u.value || n.value
                    ? u.value
                      ? (r && clearInterval(r),
                        (u.value = !1),
                        (v.value = !1),
                        void (n.value = !0))
                      : null
                    : c(),
                "e5",
              ),
              p: !u.value && !n.value,
            },
            u.value || n.value
              ? ((u.value && !v.value) ||
                  v.value ||
                  (n.value && !o.value) ||
                  o.value,
                {})
              : {},
            {
              q: u.value && !v.value,
              r: v.value,
              s: n.value && !o.value,
              t: o.value,
              v: n.value && !o.value,
            },
            n.value && !o.value ? { w: e.o(c, "2f"), x: e.o(d, "5b") } : {},
            { y: o.value },
            (o.value, {}),
          )
      );
    },
  }),
  v = e._export_sfc(u, [["__scopeId", "data-v-70350287"]]);
wx.createPage(v);
