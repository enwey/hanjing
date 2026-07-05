"use strict";
const e = require("../../../common/vendor.js"),
  a = require("../../../api/index.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  relationLabels = {
    spouse: "配偶",
    child: "子女",
    parent: "父母",
    sibling: "兄弟姐妹",
    other: "其他",
    self: "本人",
  },
  n = e.defineComponent({
    __name: "index",
    setup(t) {
      const n = e.ref([]),
        i = e.ref(!0);
      async function fetchFamilyMembers() {
        var e;
        i.value = !0;
        const t = await a.getFamilyMembers();
        ((n.value = (null == (e = t.data) ? void 0 : e.list) || t.list || []),
          (i.value = !1));
      }
      function goAddMember() {
        e.index.navigateTo({
          url: "/pages/profile/family-members/add-member/index",
        });
      }
      return (
        e.onMounted(async () => {
          await fetchFamilyMembers();
        }),
        (t, c) =>
          e.e(
            { a: e.p({ title: "家庭成员", "show-back": !0 }), b: i.value },
            i.value
              ? {}
              : e.e(
                  {
                    c: e.f(n.value, (t, n, i) =>
                      e.e(
                        {
                          a: e.t(t.name.slice(0, 1)),
                          b: e.t(t.name),
                          c: e.t(relationLabels[t.relation] || t.relation),
                          d: e.t("1" === t.gender || 1 === t.gender ? "男" : "女"),
                          e: e.t(t.age),
                          f: e.t(t.phone),
                          g: t.hasSnore,
                          idCard: t.idCard,
                          cardNo: t.cardNo,
                        },
                        (t.hasSnore, {}),
                        { h: t.lastVisit },
                        t.lastVisit ? { i: e.t(t.lastVisit) } : {},
                        {
                          j: e.o(
                            (n) => {
                              e.index.navigateTo({
                                url: "/pages/profile/family-members/add-member/index?id=" + t.id,
                              });
                            },
                            t.id
                          ),
                          k: t.id,
                        },
                      ),
                    ),
                    d: 0 === n.value.length,
                  },
                  (n.value.length, {}),
                ),
            { e: e.o(goAddMember, "c5") },
          )
      );
    },
  }),
  i = e._export_sfc(n, [["__scopeId", "data-v-30acdad2"]]);
wx.createPage(i);
