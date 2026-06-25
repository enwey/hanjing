"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js");
Math || (o + n)();
const o = () => "../../components/base/hj-navbar.js",
  n = () => "../../components/base/hj-button.js",
  l = e.defineComponent({
    __name: "confirm",
    setup(o) {
      var n, l, s, c;
      const r = t.useAppointmentStore(),
        i = e.ref(""),
        d = e.ref(!1),
        a = (null == (n = r.selectedStore) ? void 0 : n.name) || "",
        u = (null == (l = r.selectedDoctor) ? void 0 : l.name) || "",
        p = r.selectedDate,
        m = (null == (s = r.selectedTimeSlot) ? void 0 : s.label) || "",
        f = (null == (c = r.selectedDoctor) ? void 0 : c.consultFee) || 0;
      const patientId = e.ref("pat-001");
      const requireDeposit = e.ref(false);
      const depositAmountYuan = e.ref("0.00");
      e.onMounted(async () => {
        try {
          const api = require("../../api/index.js");
          try {
            const settingsRes = await api.getBookingSettings();
            if (settingsRes && settingsRes.data) {
              requireDeposit.value = settingsRes.data.requireDeposit;
              depositAmountYuan.value = (settingsRes.data.depositAmount / 100).toFixed(2);
            }
          } catch (settingsErr) {
            console.error("加载预约设置失败", settingsErr);
          }
          
          const res = await api.getFamilyMembers();
          if (res && res.data && res.data.list && res.data.list.length > 0) {
            const selfMember = res.data.list.find(item => item.relation === 'self') || res.data.list[0];
            if (selfMember) {
              patientId.value = selfMember.id;
            }
          }
        } catch (err) {
          console.error("加载就诊人失败", err);
        }
      });
      async function v() {
        if (
          r.selectedStore &&
          r.selectedDoctor &&
          r.selectedSchedule &&
          r.selectedTimeSlot
        ) {
          d.value = !0;
          try {
            const t = await r.createAppointment({
              patientId: patientId.value,
              storeId: r.selectedStore.id,
              doctorId: r.selectedDoctor.id,
              scheduleId: r.selectedSchedule.id,
              appointmentDate: r.selectedDate,
              appointmentTime: r.selectedTimeSlot.label,
              type: "first",
              symptomDesc: i.value || void 0,
            });
            if (t.requireDeposit) {
              const totalPayYuan = ((t.depositAmount + f) / 100).toFixed(2);
              e.index.showModal({
                title: "确认支付",
                content: `预约就诊需要支付 ¥${totalPayYuan}（含定金与挂号费），是否确认支付？`,
                confirmText: "确认支付",
                cancelText: "取消",
                success: async function (o) {
                  if (o.confirm) {
                    e.index.showLoading({ title: "发起支付..." });
                    try {
                      const api = require("../../api/index.js");
                      const payRes = await api.payAppointmentDeposit(t.id);
                      e.index.hideLoading();
                      
                      e.index.requestPayment({
                        timeStamp: payRes.data.timeStamp,
                        nonceStr: payRes.data.nonceStr,
                        package: payRes.data.package,
                        signType: payRes.data.signType,
                        paySign: payRes.data.paySign,
                        success: async function (res) {
                          e.index.showLoading({ title: "同步支付状态..." });
                          try {
                            await api.confirmAppointmentPayment(t.id);
                            e.index.hideLoading();
                            e.index.showToast({ title: "支付成功", icon: "success" });
                            setTimeout(() => {
                              e.index.reLaunch({
                                url: `/pages/appointment/success?id=${t.id}`,
                              });
                            }, 1000);
                          } catch (err) {
                            e.index.hideLoading();
                            e.index.showToast({ title: "支付同步失败，请联系客服", icon: "none" });
                          }
                        },
                        fail: function (err) {
                          e.index.showToast({ title: "已取消支付", icon: "none" });
                          setTimeout(() => {
                            e.index.reLaunch({
                              url: "/pages/appointment/index?tab=mine",
                            });
                          }, 1000);
                        }
                      });
                    } catch (err) {
                      e.index.hideLoading();
                      e.index.showToast({ title: "发起支付失败，请稍后重试", icon: "none" });
                    }
                  } else {
                    e.index.showToast({ title: "已取消支付", icon: "none" });
                    setTimeout(() => {
                      e.index.reLaunch({
                        url: "/pages/appointment/index?tab=mine",
                      });
                    }, 1000);
                  }
                }
              });
            } else {
              e.index.reLaunch({
                url: `/pages/appointment/success?id=${t.id}`,
              });
            }
          } catch (t) {
            e.index.showToast({ title: "预约失败，请重试", icon: "error" });
          } finally {
            d.value = !1;
          }
        } else e.index.showToast({ title: "请完善预约信息", icon: "error" });
      }
      const totalAmountYuan = e.computed(() => {
        const consultFeeYuan = f / 100;
        const depYuan = requireDeposit.value ? parseFloat(depositAmountYuan.value) : 0;
        return (consultFeeYuan + depYuan).toFixed(2);
      });
      const buttonText = e.computed(() => {
        if (requireDeposit.value) {
          return `立即支付 · ¥${totalAmountYuan.value}`;
        } else if (f > 0) {
          return `确认预约 · ¥${(f / 100).toFixed(2)}`;
        } else {
          return `确认预约`;
        }
      });
      return (t, o) =>
        e.e(
          {
            a: e.p({ title: "预约确认", "show-back": !0 }),
            b: e.t(e.unref(a)),
            c: e.t(e.unref(u)),
            d: e.t(e.unref(p)),
            e: e.t(e.unref(m)),
            f: e.unref(f) > 0,
            requireDeposit: e.unref(requireDeposit),
            depositAmountYuan: e.unref(depositAmountYuan),
            totalAmountYuan: e.unref(totalAmountYuan),
            buttonText: e.unref(buttonText),
          },
          e.unref(f) > 0 ? { g: e.t((e.unref(f) / 100).toFixed(2)) } : {},
          {
            h: i.value,
            i: e.o((e) => (i.value = e.detail.value), "b2"),
            k: e.o(v, "0a"),
            l: e.p({
              type: "primary",
              size: "lg",
              block: !0,
              loading: d.value,
            }),
          },
        );
    },
  }),
  s = e._export_sfc(l, [["__scopeId", "data-v-03365e87"]]);
wx.createPage(s);
