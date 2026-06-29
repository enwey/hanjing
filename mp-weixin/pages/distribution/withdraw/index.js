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
        r = e.ref(""),
        s = e.ref(""),
        v = e.ref(""),
        c = e.computed(() => parseFloat(o.value) || 0),
        d = e.computed(() => n.value / 100),
        m = e.computed(() => {
          if (c.value <= 0) return 0;
          if ("bank" !== i.value) return 0;
          return Math.max(c.value * 0.01, 1);
        }),
        f = e.computed(() => Math.max(c.value - m.value, 0)),
        p = e.computed(() => {
          if (c.value < 50) return !1;
          if (c.value > d.value) return !1;
          if ("bank" === i.value && (!r.value || !s.value || !v.value)) return !1;
          return !0;
        }),
        h = async () => {
          if (!p.value) return;
          try {
            await a.applyWithdraw(
              Math.round(100 * c.value),
              i.value,
              "bank" === i.value
                ? {
                    bankName: r.value,
                    accountName: s.value,
                    accountNo: v.value,
                  }
                : null,
            );
            e.index.showToast({ title: "提现申请已提交", icon: "success" });
            o.value = "";
            const t = await a.getDistributorInfo(),
              iData = t.data || t;
            n.value = iData.availableCommission || 0;
            l.value = iData.withdrawnAmount || 0;
          } catch (t) {
            e.index.showToast({
              title: t && t.message ? t.message : "提现失败",
              icon: "none",
            });
          }
        },
        g = async () => {
          try {
            const eData = await a.getDistributorInfo(),
              tData = eData.data || eData;
            u.value = tData.totalCommission || 0;
            n.value = tData.availableCommission || 0;
            l.value = tData.withdrawnAmount || 0;
          } catch (eData) {}
        };
      return (
        e.onMounted(g),
        e.onShow(g),
        (a, t) => ({
          a: e.t((n.value / 100).toFixed(2)),
          b: e.t((u.value / 100).toFixed(2)),
          c: e.t((l.value / 100).toFixed(2)),
          d: o.value,
          e: e.o((e) => (o.value = e.detail.value), "f1"),
          f: "wechat" === i.value ? 1 : "",
          g: e.o((e) => (i.value = "wechat"), "c3"),
          h: "bank" === i.value ? 1 : "",
          i: e.o((e) => (i.value = "bank"), "ff"),
          j: "bank" === i.value,
          k: r.value,
          l: e.o((e) => (r.value = e.detail.value), "bank-name"),
          m: s.value,
          n: e.o((e) => (s.value = e.detail.value), "bank-account-name"),
          o: v.value,
          p: e.o((e) => (v.value = e.detail.value), "bank-account-no"),
          q: e.t(m.value.toFixed(2)),
          r: e.t(f.value.toFixed(2)),
          s: p.value ? "" : 1,
          t: e.o(h, "06"),
          u: e.o((a) => {
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
