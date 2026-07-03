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
        idCard = e.ref(""),
        cardNo = e.ref(""),
        i = [
          { value: "spouse", label: "配偶" },
          { value: "child", label: "子女" },
          { value: "parent", label: "父母" },
          { value: "sibling", label: "兄弟姐妹" },
          { value: "other", label: "其他" },
        ];
      async function submitAddMember() {
        const name = u.value.trim();
        if (!name) {
          e.index.showToast({ title: "请输入姓名", icon: "none" });
          return;
        }
        if (name.length > 20) {
          e.index.showToast({ title: "姓名最多20个字符", icon: "none" });
          return;
        }
        const ageVal = parseInt(v.value, 10);
        if (isNaN(ageVal) || ageVal < 1 || ageVal > 120) {
          e.index.showToast({ title: "年龄必须在1至120之间", icon: "none" });
          return;
        }
        const phoneVal = n.value.trim();
        if (phoneVal && !/^1[3-9]\d{9}$/.test(phoneVal)) {
          e.index.showToast({ title: "手机号格式不正确", icon: "none" });
          return;
        }
        const idCardVal = idCard.value.trim();
        if (idCardVal && !/^\d{17}[\dXx]$/.test(idCardVal)) {
          e.index.showToast({ title: "身份证格式不正确", icon: "none" });
          return;
        }
        const cardNoVal = cardNo.value.trim();
        await a.addFamilyMember({
          name: name,
          relation: t.value,
          gender: o.value,
          age: ageVal,
          phone: phoneVal,
          idCard: idCardVal,
          cardNo: cardNoVal,
        });
        e.index.showToast({ title: "添加成功", icon: "success" });
        setTimeout(() => e.index.navigateBack(), 800);
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
        nIdCard: idCard.value,
        oIdCardInput: e.o((e) => (idCard.value = e.detail.value), "id1"),
        pCardNo: cardNo.value,
        qCardNoInput: e.o((e) => (cardNo.value = e.detail.value), "id2"),
        m: e.o(submitAddMember, "90"),
      });
    },
  }),
  t = e._export_sfc(u, [["__scopeId", "data-v-33d45858"]]);
wx.createPage(t);
