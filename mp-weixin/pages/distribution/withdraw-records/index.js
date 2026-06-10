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
          pending: "处理中",
          processing: "处理中",
          success: "已到账",
          failed: "失败",
        };
      return (
        e.onMounted(async () => {
          var e;
          try {
            const a = await t.getWithdrawRecords();
            n.value = (null == (e = a.data) ? void 0 : e.list) || a.list || [];
          } catch (a) {}
        }),
        (t, a) =>
          e.e(
            {
              a: e.f(n.value, (t, a, n) => {
                return {
                  a: e.t((t.amount / 100).toFixed(2)),
                  b: e.t(t.accountInfo),
                  c: e.t(s[t.status]),
                  d: e.n(t.status),
                  e: e.t(((o = t.createdAt), o.split("T")[0])),
                  f: t.id,
                };
                var o;
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
