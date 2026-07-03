"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
if (!Array) {
  e.resolveComponent("hj-empty")();
}
Math;
const a = e.defineComponent({
    __name: "index",
    setup(a) {
      const memberList = e.ref([]),
        teamCount = e.ref(0),
        level2Count = e.ref(0),
        totalSales = e.ref(0),
        levelNames = { gold: "金牌", silver: "银牌", diamond: "钻石" },
        loadData = async () => {
          try {
            const [membersRes, infoRes] = await Promise.all([
              t.getTeamMembers(),
              t.getDistributorInfo(),
            ]);
            const members = ((membersRes.data && membersRes.data.list) || membersRes.list || []).map((t) => ({
              ...t,
              avatarText: (t.nickname || "用").slice(0, 1),
              joinedAtText: t.joinedAt || "",
            }));
            memberList.value = members;
            const u = infoRes.data || infoRes;
            teamCount.value = u.teamCount || 0;
            level2Count.value = u.teamLevel2Count || 0;
            totalSales.value = members.reduce((sum, item) => sum + Number(item.totalSales || 0), 0) / 1e4;
          } catch (err) {
            e.index.showToast({ title: "加载团队成员失败", icon: "none" });
          }
        };
      return (
        e.onMounted(loadData),
        e.onShow(loadData),
        (t, a) =>
          e.e(
            {
              a: e.t(teamCount.value),
              b: e.t(level2Count.value),
              c: e.t(totalSales.value.toFixed(1)),
              d: e.f(memberList.value, (t, a, n) => ({
                a: e.t(t.avatarText),
                b: e.t(t.nickname),
                c: e.t(t.orderCount),
                d: e.t(levelNames[t.level] || "银牌"),
                e: e.n(t.level),
                f: e.t((t.totalSales / 1e4).toFixed(1)),
                g: t.id,
                h: e.t(t.statusText || ""),
                i: e.t(t.statusClass || ""),
                j: e.t(t.joinedAtText || ""),
              })),
              e: !memberList.value.length,
            },
            memberList.value.length ? {} : { f: e.p({ text: "暂无团队成员" }) },
          )
      );
    },
  }),
  n = e._export_sfc(a, [["__scopeId", "data-v-e9b2690b"]]);
wx.createPage(n);
