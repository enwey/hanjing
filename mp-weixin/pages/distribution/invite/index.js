"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js"),
  s = e.defineComponent({
    __name: "index",
    setup(s) {
      const inviteCode = e.ref(""),
        inviteQrCode = e.ref(""),
        sharePath = e.ref("/pages/index/index"),
        stepList = [
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
        copyInviteCode = () => {
          if (!inviteCode.value) {
            e.index.showToast({ title: "邀请码加载中", icon: "none" });
            return;
          }
          e.index.setClipboardData({ data: inviteCode.value });
        },
        savePoster = () =>
          e.index.showModal({
            title: "保存海报",
            content: "当前版本可先使用“分享好友”发送带邀请码的小程序路径，海报可长按页面截图保存。",
            showCancel: !1,
          }),
        loadData = async () => {
          try {
            const eData = await t.getDistributionInviteInfo();
            const s = eData.data || eData;
            inviteCode.value = s.inviteCode || "";
            inviteQrCode.value = s.inviteQrCode || "";
            sharePath.value = s.sharePath || "/pages/index/index";
          } catch (err) {
            e.index.showToast({ title: "加载邀请信息失败", icon: "none" });
          }
        };
      return (
        e.onMounted(loadData),
        e.onShow(loadData),
        e.onShareAppMessage(() => ({
          title: "邀请你体验鼾静健康诊所，扫码下单可享专业睡眠健康服务",
          path: sharePath.value || "/pages/index/index",
          imageUrl: inviteQrCode.value || "",
        })),
        (t, s) => ({
          a: e.t(inviteCode.value),
          b: e.o(copyInviteCode, "a0"),
          c: e.o(savePoster, "fd"),
          d: e.f(stepList, (t, s, a) => ({
            a: e.t(s + 1),
            b: e.t(t.title),
            c: e.t(t.desc),
            d: s,
          })),
          e: inviteQrCode.value,
        })
      );
    },
  }),
  a = e._export_sfc(s, [["__scopeId", "data-v-466378e0"]]);
wx.createPage(a);
