"use strict";
const e = require("../../../../common/vendor.js"),
  a = require("../../../../api/index.js");
Math || n();
const n = () => "../../../../components/base/hj-navbar.js",
  u = e.defineComponent({
    __name: "index",
    setup(n) {
      const u = e.ref(null),
        l = e.ref(!0),
        t = e.ref(!1),
        v = e.ref({ nickname: "", gender: 1, birthday: "" });
      function i() {
        t.value = !0;
      }
      async function r() {
        try {
          await a.updateUserProfile(v.value);
          u.value = { ...u.value, ...v.value };
          
          // Update Pinia user store profile directly to trigger instant reactivity
          try {
            const userStore = require("../../../../stores/index.js").useUserStore();
            if (userStore) {
              if (userStore.profile) {
                userStore.profile.nickname = v.value.nickname;
                userStore.profile.gender = v.value.gender;
                userStore.profile.birthday = v.value.birthday;
              } else {
                userStore.profile = {
                  nickname: v.value.nickname,
                  gender: v.value.gender,
                  birthday: v.value.birthday,
                };
              }
              console.log("[Personal Info Save] Pinia userStore.profile updated:", JSON.stringify(userStore.profile));
            }
          } catch (storeErr) {
            console.error("[Personal Info Save] Failed to update Pinia userStore profile:", storeErr);
          }
          
          t.value = !1;
          e.index.showToast({ title: "保存成功", icon: "success" });
        } catch (err) {
          console.error("[Personal Info Save] Failed to update profile:", err);
          e.index.showToast({ title: "更新失败", icon: "none" });
        }
      }
      function c() {
        (Object.assign(v.value, {
          nickname: u.value.nickname,
          gender: u.value.gender,
          birthday: u.value.birthday || "",
        }),
          (t.value = !1));
      }
      return (
        e.onMounted(async () => {
          const e = await a.getUserProfile();
          ((u.value = e.data || e),
            Object.assign(v.value, {
              nickname: u.value.nickname,
              gender: u.value.gender,
              birthday: u.value.birthday || "",
            }),
            (l.value = !1));
        }),
        (a, n) =>
          e.e(
            { a: e.p({ title: "个人信息", "show-back": !0 }), b: l.value },
            l.value
              ? {}
              : e.e(
                  { c: e.t((u.value.nickname || "?").slice(0, 1)), d: t.value },
                  t.value
                    ? {
                        e: v.value.nickname,
                        f: e.o(
                          (e) => (v.value.nickname = e.detail.value),
                          "85",
                        ),
                      }
                    : { g: e.t(u.value.nickname) },
                  { h: e.t(u.value.phone), i: !t.value },
                  t.value
                    ? {
                        k: 1 === v.value.gender ? 1 : "",
                        l: e.o((e) => (v.value.gender = 1), "20"),
                        m: 2 === v.value.gender ? 1 : "",
                        n: e.o((e) => (v.value.gender = 2), "8a"),
                      }
                    : { j: e.t(1 === u.value.gender ? "男" : "女") },
                  { o: t.value },
                  t.value
                    ? {
                        p: v.value.birthday,
                        q: e.o(
                          (e) => (v.value.birthday = e.detail.value),
                          "24",
                        ),
                      }
                    : { r: e.t(u.value.birthday || "未设置") },
                  { s: !t.value },
                  t.value
                    ? { v: e.o(r, "8f"), w: e.o(c, "9a") }
                    : { t: e.o(i, "fc") },
                ),
          )
      );
    },
  }),
  l = e._export_sfc(u, [["__scopeId", "data-v-acab1652"]]);
wx.createPage(l);
