"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js"),
  s = e.defineComponent({
    __name: "index",
    setup(s) {
      const a = e.ref(""),
        o = e.ref(""),
        n = e.ref("/pages/index/index"),
        i = [
          {
            title: "分享邀请码/海报",
            desc: "通过微信发送给好友，或保存海报发朋友圈",
          },
          { title: "好友进入小程序", desc: "好友通过您的分享链接进入小程序并完成下单" },
          {
            title: "您获得佣金",
            desc: "订单完成后进入冻结期，满14天自动转为可提现余额",
          },
        ],
        c = () => {
          if (!a.value) {
            e.index.showToast({ title: "邀请码加载中", icon: "none" });
            return;
          }
          e.index.setClipboardData({ data: a.value });
        },
        r = () =>
          e.index.showModal({
            title: "保存海报",
            content: "当前版本可先使用“分享好友”发送带邀请码的小程序路径，海报可长按页面截图保存。",
            showCancel: !1,
          }),
        d = async () => {
          try {
            const eData = await t.getDistributionInviteInfo();
            const s = eData.data || eData;
            a.value = s.inviteCode || "";
            o.value = s.inviteQrCode || "";
            n.value = s.sharePath || "/pages/index/index";
          } catch (s) {
            e.index.showToast({ title: "加载邀请信息失败", icon: "none" });
          }
        };
      return (
        e.onMounted(d),
        e.onShow(d),
        e.onShareAppMessage(() => ({
          title: "邀请你体验鼾静健康诊所，扫码下单可享专业睡眠健康服务",
          path: n.value || "/pages/index/index",
          imageUrl: o.value || "",
        })),
        (t, s) => ({
          a: e.t(a.value),
          b: e.o(c, "a0"),
          c: e.o(r, "fd"),
          d: e.f(i, (t, s, a) => ({
            a: e.t(s + 1),
            b: e.t(t.title),
            c: e.t(t.desc),
            d: s,
          })),
          e: o.value,
        })
      );
    },
  }),
  a = e._export_sfc(s, [["__scopeId", "data-v-466378e0"]]);
wx.createPage(a);
