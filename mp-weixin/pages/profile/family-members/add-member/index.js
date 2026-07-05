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
        v = e.ref(""),
        n = e.ref(""),
        idCard = e.ref(""),
        cardNo = e.ref(""),
        isEdit = e.ref(false),
        isSelf = e.ref(false);

      let memberId = "";

      const baseRelationOptions = [
        { value: "spouse", label: "配偶" },
        { value: "child", label: "子女" },
        { value: "parent", label: "父母" },
        { value: "sibling", label: "兄弟姐妹" },
        { value: "other", label: "其他" },
      ];
      const relationOptions = e.computed(() => isSelf.value
        ? [{ value: "self", label: "本人" }, ...baseRelationOptions]
        : baseRelationOptions);

      e.onLoad(async (options) => {
        if (options && options.id) {
          memberId = options.id;
          isEdit.value = true;
          await loadMemberDetails(options.id);
        }
      });

      async function loadMemberDetails(id) {
        try {
          const res = await a.getFamilyMemberDetail(id);
          if (res && res.data) {
            const data = res.data;
            u.value = data.name || "";
            t.value = data.relation || "spouse";
            isSelf.value = data.relation === "self";
            o.value = String(data.gender || "1");
            v.value = data.age === null || data.age === undefined ? "" : String(data.age);
            n.value = data.phone || "";
            idCard.value = data.idCard || "";
            cardNo.value = data.cardNo || "";
          }
        } catch (err) {
          console.error("加载家庭成员详情失败:", err);
          e.index.showToast({ title: "加载详情失败", icon: "none" });
        }
      }

      async function submitAddMember() {
        if (isSelf.value) {
          return;
        }
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
        const payload = {
          name: name,
          relation: t.value,
          gender: o.value,
          age: ageVal,
          phone: phoneVal,
          idCard: idCardVal,
          cardNo: cardNoVal,
        };

        try {
          if (isEdit.value) {
            await a.updateFamilyMember(memberId, payload);
            e.index.showToast({ title: "保存成功", icon: "success" });
          } else {
            await a.addFamilyMember(payload);
            e.index.showToast({ title: "关联成功", icon: "success" });
          }
          setTimeout(() => {
            const pages = getCurrentPages();
            const prevPage = pages[pages.length - 2];
            if (prevPage && prevPage.$vm && typeof prevPage.$vm.fetchFamilyMembers === 'function') {
              prevPage.$vm.fetchFamilyMembers();
            } else if (prevPage && typeof prevPage.fetchFamilyMembers === 'function') {
              prevPage.fetchFamilyMembers();
            }
            e.index.navigateBack();
          }, 800);
        } catch (err) {
          console.error("提交家庭成员失败:", err);
        }
      }

      function deleteMember() {
        if (isSelf.value) {
          return;
        }
        e.index.showModal({
          title: "确认解除关联",
          content: "确定要解除与该家庭成员的关联吗？解除后不会删除对方的独立档案。",
          success: async (resModal) => {
            if (resModal.confirm) {
              try {
                await a.deleteFamilyMember(memberId);
                e.index.showToast({ title: "已解除关联", icon: "success" });
                setTimeout(() => {
                  const pages = getCurrentPages();
                  const prevPage = pages[pages.length - 2];
                  if (prevPage && prevPage.$vm && typeof prevPage.$vm.fetchFamilyMembers === 'function') {
                    prevPage.$vm.fetchFamilyMembers();
                  } else if (prevPage && typeof prevPage.fetchFamilyMembers === 'function') {
                    prevPage.fetchFamilyMembers();
                  }
                  e.index.navigateBack();
                }, 800);
              } catch (err) {
                console.error("解除关联失败:", err);
              }
            }
          }
        });
      }

      return (a, l) => ({
        a: e.p({ title: isEdit.value ? "成员详情" : "添加家庭成员", "show-back": !0 }),
        b: u.value,
        c: e.o((e) => (u.value = e.detail.value), "01"),
        d: e.f(relationOptions.value, (a, l, u) => ({
          a: e.t(a.label),
          b: a.value,
          c: t.value === a.value ? 1 : "",
          d: e.o((e) => { if (!isSelf.value) t.value = a.value; }, a.value),
        })),
        e: "1" === o.value ? 1 : "",
        f: e.o((e) => { if (!isSelf.value) o.value = "1"; }, "31"),
        g: "2" === o.value ? 1 : "",
        h: e.o((e) => { if (!isSelf.value) o.value = "2"; }, "fb"),
        i: v.value,
        j: e.o((e) => (v.value = e.detail.value), "06"),
        k: n.value,
        l: e.o((e) => (n.value = e.detail.value), "a9"),
        nIdCard: idCard.value,
        oIdCardInput: e.o((e) => (idCard.value = e.detail.value), "id1"),
        pCardNo: cardNo.value,
        qCardNoInput: e.o((e) => (cardNo.value = e.detail.value), "id2"),
        m: e.o(submitAddMember, "90"),
        isEdit: isEdit.value,
        isSelf: isSelf.value,
        onDeleteTap: e.o(deleteMember, "del")
      });
    },
  }),
  t = e._export_sfc(u, [["__scopeId", "data-v-33d45858"]]);
wx.createPage(t);
