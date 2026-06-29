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
      const n = e.ref([]),
        s = {
          pending: "待审核",
          processing: "处理中",
          approved: "已通过",
          transferred: "已到账",
          success: "已到账",
          rejected: "已驳回",
          failed: "已驳回",
        },
        o = async () => {
          try {
            const a = await t.getWithdrawRecords();
            n.value = ((a.data && a.data.list) || a.list || []).map((e) => {
              const info = e.accountInfo || {};
              const accountLabel = info.label
                || (info.method === "bank"
                  ? `${info.bankName || "银行卡"} ${info.accountNo || ""}`.trim()
                  : "微信零钱");
              return {
                ...e,
                accountLabel,
              };
            });
          } catch (a) {
            e.index.showToast({ title: "加载提现记录失败", icon: "none" });
          }
        };
      return (
        e.onMounted(o),
        e.onShow(o),
        (t, a) =>
          e.e(
            {
              a: e.f(n.value, (t, a, n) => {
                return {
                  a: e.t((t.amount / 100).toFixed(2)),
                  b: e.t(t.accountLabel),
                  c: e.t(s[t.status] || "处理中"),
                  d: e.n(t.status),
                  e: e.t(String(t.createdAt || "").split("T")[0]),
                  f: t.id,
                };
              }),
              b: !n.value.length,
            },
            n.value.length ? {} : { c: e.p({ text: "暂无提现记录" }) },
          )
      );
    },
  }),
  n = e._export_sfc(a, [["__scopeId", "data-v-1157dc5a"]]);
wx.createPage(n);
