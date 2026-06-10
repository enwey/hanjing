"use strict";
const e = require("../../../common/vendor.js"),
  a = require("../../../api/index.js"),
  t = e.defineComponent({
    __name: "index",
    setup(t) {
      const o = e.ref(""),
        i = e.ref("wechat"),
        u = e.ref(0),
        n = e.ref(0),
        l = e.ref(0),
        r = e.computed(() => parseFloat(o.value) || 0),
        s = e.computed(() => n.value / 100),
        v = e.computed(() => r.value > 0 && r.value <= s.value),
        c = e.computed(() => Math.round(999 * r.value) / 1e3),
        d = async () => {
          if (v.value)
            try {
              (await a.applyWithdraw(Math.round(100 * r.value)),
                e.index.showToast({ title: "提现申请已提交", icon: "success" }),
                (o.value = ""));
              const t = await a.getDistributorInfo(),
                i = t.data || t;
              n.value = i.availableCommission || 0;
            } catch (t) {
              e.index.showToast({ title: "提现失败", icon: "none" });
            }
        };
      return (
        e.onMounted(async () => {
          try {
            const e = await a.getDistributorInfo(),
              t = e.data || e;
            ((u.value = t.totalCommission || 0),
              (n.value = t.availableCommission || 0),
              (l.value = t.withdrawnAmount || 0));
          } catch (e) {}
        }),
        (a, t) => ({
          a: e.t((n.value / 100).toFixed(2)),
          b: e.t((u.value / 100).toFixed(0)),
          c: e.t((l.value / 100).toFixed(0)),
          d: o.value,
          e: e.o((e) => (o.value = e.detail.value), "f1"),
          f: "wechat" === i.value ? 1 : "",
          g: e.o((e) => (i.value = "wechat"), "c3"),
          h: "bank" === i.value ? 1 : "",
          i: e.o((e) => (i.value = "bank"), "ff"),
          j: e.t(c.value.toFixed(2)),
          k: v.value ? "" : 1,
          l: e.o(d, "06"),
          m: e.o((a) => {
            return (
              (t = "/pages/distribution/withdraw-records/index"),
              e.index.navigateTo({ url: t })
            );
            var t;
          }, "00"),
        })
      );
    },
  }),
  o = e._export_sfc(t, [["__scopeId", "data-v-6825c219"]]);
wx.createPage(o);
