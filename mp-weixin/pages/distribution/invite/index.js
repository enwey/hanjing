"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js"),
  s = e.defineComponent({
    __name: "index",
    setup(s) {
      const a = e.ref(""),
        i = [
          {
            title: "分享邀请码/海报",
            desc: "通过微信发送给好友，或保存海报发朋友圈",
          },
          { title: "好友扫码购买", desc: "好友扫码进入小程序，购买任意商品" },
          {
            title: "您获得佣金",
            desc: "好友下单成功后，佣金自动结算到您的账户",
          },
        ],
        o = () => {
          (e.index.setClipboardData({ data: a.value }),
            e.index.showToast({ title: "已复制", icon: "success" }));
        },
        c = () => e.index.showToast({ title: "海报已保存", icon: "success" });
      return (
        e.onMounted(async () => {
          try {
            const e = await t.getDistributorInfo();
            a.value = (e.data || e).inviteCode || "";
          } catch (e) {}
        }),
        (t, s) => ({
          a: e.t(a.value),
          b: e.o(o, "a0"),
          c: e.o(c, "fd"),
          d: e.f(i, (t, s, a) => ({
            a: e.t(s + 1),
            b: e.t(t.title),
            c: e.t(t.desc),
            d: s,
          })),
        })
      );
    },
  }),
  a = e._export_sfc(s, [["__scopeId", "data-v-466378e0"]]);
wx.createPage(a);
