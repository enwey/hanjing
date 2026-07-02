"use strict";
const e = require("../../../../common/vendor.js"),
  a = require("../../../../api/index.js");
Math || t();
const t = () => "../../../../components/base/hj-navbar.js",
  n = e.defineComponent({
    __name: "index",
    setup(t) {
      const n = e.ref([]),
        l = e.ref(!0),
        i = e.ref(!1),
        o = e.ref(0),
        u = e.ref("");
      function currentParams() {
        const patientId = e.index.getStorageSync("selected_treatment_patient_id") || "";
        return patientId ? { patientId } : {};
      }
      async function v() {
        var t;
        if (0 === o.value)
          return void e.index.showToast({ title: "请选择评分", icon: "none" });
        if (!u.value.trim())
          return void e.index.showToast({
            title: "请输入反馈内容",
            icon: "none",
          });
        (await a.submitDeviceFeedback({ ...currentParams(), rating: o.value, content: u.value }),
          (o.value = 0),
          (u.value = ""),
          (i.value = !1),
          e.index.showToast({ title: "提交成功", icon: "success" }));
        const l = await a.getDeviceFeedback(currentParams());
        n.value = (null == (t = l.data) ? void 0 : t.list) || l.list || [];
      }
      return (
        e.onMounted(async () => {
          var e;
          const t = await a.getDeviceFeedback(currentParams());
          ((n.value = (null == (e = t.data) ? void 0 : e.list) || t.list || []),
            (l.value = !1));
        }),
        (a, t) =>
          e.e(
            { a: e.p({ title: "使用反馈", "show-back": !0 }), b: l.value },
            l.value
              ? {}
              : e.e(
                  {
                    c: e.f(n.value, (a, t, n) =>
                      e.e(
                        {
                          a: e.t(a.date),
                          b: e.f(5, (t, n, l) => ({
                            a: e.t(t <= a.rating ? "*" : "-"),
                            b: t,
                            c: t <= a.rating ? 1 : "",
                          })),
                          c: e.t(a.content),
                          d: a.reply,
                        },
                        a.reply ? { e: e.t(a.reply) } : {},
                        { f: a.id },
                      ),
                    ),
                    d: 0 === n.value.length,
                  },
                  (n.value.length, {}),
                ),
            { e: e.o((e) => (i.value = !0), "2e"), f: i.value },
            i.value
              ? {
                  g: e.f(5, (a, t, n) => ({
                    a: e.t(a <= o.value ? "*" : "O"),
                    b: a,
                    c: a <= o.value ? 1 : "",
                    d: e.o((e) => {
                      return ((t = a), void (o.value = t));
                      var t;
                    }, a),
                  })),
                  h: u.value,
                  i: e.o((e) => (u.value = e.detail.value), "c9"),
                  j: e.o((e) => (i.value = !1), "16"),
                  k: e.o(v, "c8"),
                  l: e.o(() => {}, "a7"),
                  m: e.o((e) => (i.value = !1), "0c"),
                }
              : {},
          )
      );
    },
  }),
  l = e._export_sfc(n, [["__scopeId", "data-v-86cd8c34"]]);
wx.createPage(l);
