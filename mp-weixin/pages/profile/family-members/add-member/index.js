"use strict";
const e = require("../../../../common/vendor.js"),
  a = require("../../../../api/index.js");
Math || l();
const l = () => "../../../../components/base/hj-navbar.js",
  u = e.defineComponent({
    __name: "index",
    setup(l) {
      const u = e.ref(""),
        t = e.ref("spouse"),
        o = e.ref("1"),
        v = e.ref(35),
        n = e.ref(""),
        i = [
          { value: "spouse", label: "配偶" },
          { value: "child", label: "子女" },
          { value: "parent", label: "父母" },
          { value: "sibling", label: "兄弟姐妹" },
          { value: "other", label: "其他" },
        ];
      async function s() {
        u.value.trim()
          ? (await a.addFamilyMember({
              name: u.value.trim(),
              relation: t.value,
              gender: o.value,
              age: v.value,
              phone: n.value,
            }),
            e.index.showToast({ title: "添加成功", icon: "success" }),
            setTimeout(() => e.index.navigateBack(), 800))
          : e.index.showToast({ title: "请输入姓名", icon: "none" });
      }
      return (a, l) => ({
        a: e.p({ title: "添加成员", "show-back": !0 }),
        b: u.value,
        c: e.o((e) => (u.value = e.detail.value), "01"),
        d: e.f(i, (a, l, u) => ({
          a: e.t(a.label),
          b: a.value,
          c: t.value === a.value ? 1 : "",
          d: e.o((e) => (t.value = a.value), a.value),
        })),
        e: "1" === o.value ? 1 : "",
        f: e.o((e) => (o.value = "1"), "31"),
        g: "2" === o.value ? 1 : "",
        h: e.o((e) => (o.value = "2"), "fb"),
        i: v.value,
        j: e.o((e) => (v.value = e.detail.value), "06"),
        k: n.value,
        l: e.o((e) => (n.value = e.detail.value), "a9"),
        m: e.o(s, "90"),
      });
    },
  }),
  t = e._export_sfc(u, [["__scopeId", "data-v-33d45858"]]);
wx.createPage(t);
