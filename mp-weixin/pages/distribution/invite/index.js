"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js"),
  a = "distributionInvitePoster",
  shareImageUrl = "/static/images/distribution-invite-share-cover.png";
const o = (t) =>
    new Promise((a, o) => {
      e.index.getImageInfo({
        src: t,
        success: a,
        fail: o,
      });
    }),
  i = () =>
    new Promise((t, a) => {
      e.index.authorize({
        scope: "scope.writePhotosAlbum",
        success: t,
        fail: a,
      });
    });
const n = e.defineComponent({
    __name: "index",
    setup(n) {
      const r = e.ref(""),
        s = e.ref(""),
        c = e.ref(""),
        d = e.ref(""),
        l = e.computed(() => !s.value),
        m = e.computed(() => (l.value ? "当前环境未生成小程序码，将使用邀请码海报进行分享。" : "")),
        p = () => {
          if (!r.value) {
            e.index.showToast({ title: "邀请码加载中", icon: "none" });
            return;
          }
          e.index.setClipboardData({ data: r.value });
        },
        g = async () => {
          if (!r.value) {
            e.index.showToast({ title: "邀请码加载中", icon: "none" });
            return;
          }
          try {
            e.index.showLoading({ title: "生成海报中..." });
            const n = e.index.createCanvasContext(a),
              u = 600,
              l = 960;
            n.setFillStyle("#1a3580");
            n.fillRect(0, 0, u, l);
            n.setFillStyle("#3b6bf5");
            n.fillRect(0, 0, u, 300);
            n.setFillStyle("#ffffff");
            n.setFontSize(22);
            n.fillText("鼾静健康", 48, 72);
            n.setFontSize(42);
            n.fillText("邀请好友，一起推广", 48, 150);
            n.setFontSize(26);
            n.setFillStyle("rgba(255,255,255,0.85)");
            n.fillText("分享给好友，成交后佣金自动计入您的账户", 48, 198);
            n.setFillStyle("#ffffff");
            n.fillRect(40, 260, 520, 540);
            n.setFillStyle("#1f2937");
            n.setFontSize(30);
            n.fillText("我的邀请码", 74, 336);
            n.setFillStyle("#f59e0b");
            n.setFontSize(46);
            n.fillText(r.value, 74, 408);
            n.setFillStyle("#6b7280");
            n.setFontSize(24);
            n.fillText("微信内分享小程序，或发送邀请码给好友", 74, 458);
            if (s.value) {
              try {
                const eData = await o(s.value);
                n.drawImage(eData.path, 182, 498, 236, 236);
                n.setFillStyle("#6b7280");
                n.setFontSize(22);
                n.fillText("扫码进入小程序", 223, 772);
              } catch (tErr) {
                n.setStrokeStyle("#dbeafe");
                n.setLineWidth(2);
                n.strokeRect(160, 500, 280, 180);
                n.setFillStyle("#1f2937");
                n.setFontSize(28);
                n.fillText("邀请码", 262, 578);
                n.setFillStyle("#f59e0b");
                n.setFontSize(34);
                n.fillText(r.value, 170, 632);
              }
            } else {
              n.setStrokeStyle("#dbeafe");
              n.setLineWidth(2);
              n.strokeRect(160, 500, 280, 180);
              n.setFillStyle("#1f2937");
              n.setFontSize(28);
              n.fillText("邀请码", 262, 578);
              n.setFillStyle("#f59e0b");
              n.setFontSize(34);
              n.fillText(r.value, 170, 632);
            }
            n.setFillStyle("#6b7280");
            n.setFontSize(22);
            n.fillText("打开“鼾静健康诊所”小程序，输入邀请码即可绑定", 74, 842);
            n.draw(!1, () => {
              e.index.canvasToTempFilePath({
                canvasId: a,
                width: u,
                height: l,
                destWidth: u,
                destHeight: l,
                success: async (aData) => {
                  try {
                    try {
                      await i();
                    } catch (eAuth) {}
                    await new Promise((t, a) => {
                      e.index.saveImageToPhotosAlbum({
                        filePath: aData.tempFilePath,
                        success: t,
                        fail: a,
                      });
                    });
                    e.index.hideLoading();
                    e.index.showToast({ title: "海报已保存", icon: "success" });
                  } catch (oErr) {
                    e.index.hideLoading();
                    e.index.showModal({
                      title: "保存失败",
                      content: "请在系统设置中允许保存到相册后重试。",
                      showCancel: !1,
                    });
                  }
                },
                fail: () => {
                  e.index.hideLoading();
                  e.index.showToast({ title: "生成海报失败", icon: "none" });
                },
              });
            });
          } catch (tErr) {
            e.index.hideLoading();
            e.index.showToast({ title: "生成海报失败", icon: "none" });
          }
        },
        f = async () => {
          try {
            const [aData, oData] = await Promise.all([
              t.getDistributionInviteInfo(),
              t.getDistributorInfo(),
            ]);
            const iData = aData.data || aData || {},
              nData = oData.data || oData || {};
            r.value = iData.inviteCode || nData.inviteCode || nData.invite_code || "";
            s.value = iData.inviteQrCode || nData.inviteQrCode || "";
            c.value = iData.sharePath || (r.value ? `/pages/index/index?inviteCode=${r.value}` : "/pages/index/index");
            d.value = iData.shareTitle || "邀请好友体验鼾静健康诊所";
          } catch (aErr) {
            e.index.showToast({ title: "加载邀请信息失败", icon: "none" });
          }
        };
      return (
        e.onMounted(f),
        e.onShow(f),
        e.onShareAppMessage(() => ({
          title: d.value || "邀请好友体验鼾静健康诊所",
          path: c.value || "/pages/index/index",
          imageUrl: shareImageUrl,
        })),
        (t, a) => ({
          a: e.t(r.value),
          b: e.o(p, "29"),
          c: l.value,
          d: e.t(m.value),
          e: l.value,
          f: e.t(r.value),
          g: !l.value,
          h: s.value,
          i: e.o(g, "b5"),
        })
      );
    },
  }),
  s = e._export_sfc(n, [["__scopeId", "data-v-466378e0"]]);
wx.createPage(s);
