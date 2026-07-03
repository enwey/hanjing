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
      const recordList = e.ref([]),
        statusNames = {
          pending: "待审核",
          processing: "处理中",
          approved: "已通过",
          transferred: "已到账",
          success: "已到账",
          rejected: "已驳回",
          failed: "已驳回",
        },
        loadRecords = async () => {
          try {
            const res = await t.getWithdrawRecords();
            recordList.value = ((res.data && res.data.list) || res.list || []).map((e) => {
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
          } catch (err) {
            e.index.showToast({ title: "加载提现记录失败", icon: "none" });
          }
        };
      return (
        e.onMounted(loadRecords),
        e.onShow(loadRecords),
        (t, a) =>
          e.e(
            {
              a: e.f(recordList.value, (t, a, n) => {
                return {
                  a: e.t((t.amount / 100).toFixed(2)),
                  b: e.t(t.accountLabel),
                  c: e.t(statusNames[t.status] || "处理中"),
                  d: e.n(t.status),
                  e: e.t(String(t.createdAt || "").split("T")[0]),
                  f: t.id,
                };
              }),
              b: !recordList.value.length,
            },
            recordList.value.length ? {} : { c: e.p({ text: "暂无提现记录" }) },
          )
      );
    },
  }),
  n = e._export_sfc(a, [["__scopeId", "data-v-1157dc5a"]]);
wx.createPage(n);
