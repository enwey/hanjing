"use strict";
const e = require("../../../common/vendor.js"),
  a = require("../../../api/index.js"),
  t = e.defineComponent({
    __name: "index",
    setup(t) {
      const withdrawAmountInput = e.ref(""),
        withdrawMethod = e.ref("wechat"),
        totalCommission = e.ref(0),
        availableCommission = e.ref(0),
        withdrawnAmount = e.ref(0),
        minWithdrawAmount = e.ref(50),
        withdrawFeeRate = e.ref(0.01),
        bankName = e.ref(""),
        bankAccountName = e.ref(""),
        bankAccountNo = e.ref(""),
        parsedWithdrawAmount = e.computed(() => parseFloat(withdrawAmountInput.value) || 0),
        maxWithdrawAmount = e.computed(() => availableCommission.value / 100),
        serviceFee = e.computed(() => {
          if (parsedWithdrawAmount.value <= 0) return 0;
          if ("bank" !== withdrawMethod.value) return 0;
          return Math.max(parsedWithdrawAmount.value * withdrawFeeRate.value, 1);
        }),
        actualAmount = e.computed(() => Math.max(parsedWithdrawAmount.value - serviceFee.value, 0)),
        isSubmitEnabled = e.computed(() => {
          if (parsedWithdrawAmount.value < minWithdrawAmount.value) return !1;
          if (parsedWithdrawAmount.value > maxWithdrawAmount.value) return !1;
          if ("bank" === withdrawMethod.value && (!bankName.value || !bankAccountName.value || !bankAccountNo.value)) return !1;
          return !0;
        }),
        submitWithdraw = async () => {
          if (!isSubmitEnabled.value) return;
          try {
            await a.applyWithdraw(
              Math.round(100 * parsedWithdrawAmount.value),
              withdrawMethod.value,
              "bank" === withdrawMethod.value
                ? {
                    bankName: bankName.value,
                    accountName: bankAccountName.value,
                    accountNo: bankAccountNo.value,
                  }
                : null,
            );
            e.index.showToast({ title: "提现申请已提交", icon: "success" });
            withdrawAmountInput.value = "";
            const t = await a.getDistributorInfo(),
              iData = t.data || t;
            availableCommission.value = iData.availableCommission || 0;
            withdrawnAmount.value = iData.withdrawnAmount || 0;
          } catch (err) {
            e.index.showToast({
              title: err && err.message ? err.message : "提现失败",
              icon: "none",
            });
          }
        },
        loadData = async () => {
          try {
            const eData = await a.getDistributorInfo(),
              tData = eData.data || eData;
            totalCommission.value = tData.totalCommission || 0;
            availableCommission.value = tData.availableCommission || 0;
            withdrawnAmount.value = tData.withdrawnAmount || 0;
            minWithdrawAmount.value = Number(tData.minWithdrawAmount || 5000) / 100;
            withdrawFeeRate.value = Number((tData.withdrawFeeRates && tData.withdrawFeeRates.bank) || 0.01);
          } catch (err) {}
        };
      return (
        e.onMounted(loadData),
        e.onShow(loadData),
        (a, t) => ({
          a: e.t((availableCommission.value / 100).toFixed(2)),
          b: e.t((totalCommission.value / 100).toFixed(2)),
          c: e.t((withdrawnAmount.value / 100).toFixed(2)),
          d: withdrawAmountInput.value,
          e: e.o((e) => (withdrawAmountInput.value = e.detail.value), "f1"),
          f: "wechat" === withdrawMethod.value ? 1 : "",
          g: e.o((e) => (withdrawMethod.value = "wechat"), "c3"),
          h: "bank" === withdrawMethod.value ? 1 : "",
          i: e.o((e) => (withdrawMethod.value = "bank"), "ff"),
          j: "bank" === withdrawMethod.value,
          k: bankName.value,
          l: e.o((e) => (bankName.value = e.detail.value), "bank-name"),
          m: bankAccountName.value,
          n: e.o((e) => (bankAccountName.value = e.detail.value), "bank-account-name"),
          o: bankAccountNo.value,
          p: e.o((e) => (bankAccountNo.value = e.detail.value), "bank-account-no"),
          q: e.t(minWithdrawAmount.value.toFixed(0)),
          r: e.t((100 * withdrawFeeRate.value).toFixed(0)),
          s: e.t(serviceFee.value.toFixed(2)),
          t: e.t(actualAmount.value.toFixed(2)),
          u: isSubmitEnabled.value ? "" : 1,
          v: e.o(submitWithdraw, "06"),
          w: e.o((a) => {
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
