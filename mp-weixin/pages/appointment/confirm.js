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
      const patientId = e.ref("");
      const patientList = e.ref([]);
      const patientIndex = e.ref(0);
      const patientNames = e.computed(() => patientList.value.map(item => `${item.name} (${item.relation === 'self' ? '本人' : item.relation})`));
      const selectedPatientName = e.computed(() => {
        const p = patientList.value[patientIndex.value];
        return p ? p.name : "本人";
      });
      function onPatientChange(eDetail) {
        const val = parseInt(eDetail.detail.value);
        patientIndex.value = val;
        if (patientList.value[val]) {
          patientId.value = patientList.value[val].id;
        }
      }
      const requireDeposit = e.ref(false);
      const depositAmountYuan = e.ref("0.00");
      const subscribeTemplateIds = e.ref([]);
      e.onMounted(async () => {
        try {
          const api = require("../../api/index.js");
          try {
            const settingsRes = await api.getBookingSettings();
            if (settingsRes && settingsRes.data) {
              requireDeposit.value = settingsRes.data.requireDeposit;
              depositAmountYuan.value = (settingsRes.data.depositAmount / 100).toFixed(2);
              subscribeTemplateIds.value = settingsRes.data.subscribeTemplateIds || [];
            }
          } catch (settingsErr) {
            console.error("加载预约设置失败", settingsErr);
          }
          
          const res = await api.getFamilyMembers();
          if (res && res.data && res.data.list && res.data.list.length > 0) {
            patientList.value = res.data.list;
            const selfIdx = res.data.list.findIndex(item => item.relation === 'self');
            const idx = selfIdx > -1 ? selfIdx : 0;
            patientIndex.value = idx;
            patientId.value = res.data.list[idx].id;
          }
        } catch (err) {
          console.error("加载就诊人失败", err);
        }
      });
      function requestSubscribe(callback) {
        if (wx.requestSubscribeMessage && subscribeTemplateIds.value.length > 0) {
          wx.requestSubscribeMessage({
            tmplIds: subscribeTemplateIds.value,
            success: (res) => {
              console.log("订阅结果", res);
            },
            fail: (err) => {
              console.warn("订阅消息授权失败，可能处于开发环境", err);
            },
            complete: () => {
              callback();
            }
          });
        } else {
          callback();
        }
      }
      function requestWxPay(payParams) {
        return new Promise((resolve, reject) => {
          e.index.requestPayment({
            timeStamp: payParams.timeStamp,
            nonceStr: payParams.nonceStr,
            package: payParams.package,
            signType: payParams.signType,
            paySign: payParams.paySign,
            success: resolve,
            fail: reject
          });
        });
      }
      async function v() {
        if (
          r.selectedStore &&
          r.selectedDoctor &&
          r.selectedSchedule &&
          r.selectedTimeSlot
        ) {
          if (!patientId.value) {
            e.index.showToast({ title: "请先选择就诊人", icon: "none" });
            return;
          }
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
            const appt = t.data || t;
            const apptId = appt.id || t.id;
            const apptStatus = appt.status || t.status;
            const apptRequireDeposit = appt.requireDeposit !== undefined ? appt.requireDeposit : t.requireDeposit;
            const apptDepositAmount = appt.depositAmount !== undefined ? appt.depositAmount : t.depositAmount;

            if (apptStatus === "pending_payment") {
              const depAmt = apptRequireDeposit ? apptDepositAmount : 0;
              let feeDesc = "";
              if (apptRequireDeposit && f > 0) {
                feeDesc = "（含定金与挂号费）";
              } else if (apptRequireDeposit) {
                feeDesc = "（含预约定金）";
              } else if (f > 0) {
                feeDesc = "（含挂号费）";
              }
              const totalPayYuan = ((depAmt + f) / 100).toFixed(2);
              e.index.showModal({
                title: "确认支付",
                content: `预约就诊需要支付 ¥${totalPayYuan}${feeDesc}，是否确认支付？`,
                confirmText: "确认支付",
                cancelText: "取消",
                success: async function (o) {
                  if (o.confirm) {
                    e.index.showLoading({ title: "发起支付..." });
                    try {
                      const api = require("../../api/index.js");
                      const payRes = await api.payAppointmentDeposit(apptId);
                      e.index.hideLoading();
                      
                      const payParams = payRes.data || payRes;
                      await requestWxPay(payParams);
                      e.index.showLoading({ title: "同步支付状态..." });
                      await api.confirmAppointmentPayment(apptId);
                      e.index.hideLoading();
                      e.index.showToast({ title: "支付成功", icon: "success" });
                      setTimeout(() => {
                        requestSubscribe(() => {
                          e.index.reLaunch({
                            url: `/pages/appointment/success?id=${apptId}`,
                          });
                        });
                      }, 1000);
                    } catch (err) {
                      e.index.hideLoading();
                      e.index.showToast({ title: err && err.errMsg ? "已取消支付" : "发起支付失败，请稍后重试", icon: "none" });
                      setTimeout(() => {
                        e.index.reLaunch({
                          url: "/pages/appointment/index?tab=mine",
                        });
                      }, 1000);
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
              requestSubscribe(() => {
                e.index.reLaunch({
                  url: `/pages/appointment/success?id=${apptId}`,
                });
              });
            }
          } catch (err) {
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
            selectedPatientName: e.unref(selectedPatientName),
            patientNames: e.unref(patientNames),
            patientIndex: e.unref(patientIndex),
            onPatientChange: e.o(onPatientChange),
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
