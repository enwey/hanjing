"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../api/index.js");
Math || a();
const a = () => "../../components/base/hj-navbar.js",
  l = e.defineComponent({
    __name: "detail",
    setup(a) {
      const l = e.ref(null),
        n = e.ref(!0),
        d = {
          pending: {
            current: 0,
            steps: [
              { label: "待付款", done: !0 },
              { label: "待取货", done: !1 },
              { label: "已发货", done: !1 },
              { label: "已完成", done: !1 },
            ],
          },
          paid: {
            current: 1,
            steps: [
              { label: "待付款", done: !0 },
              { label: "待取货", done: !0 },
              { label: "已发货", done: !1 },
              { label: "已完成", done: !1 },
            ],
          },
          shipping: {
            current: 1,
            steps: [
              { label: "待付款", done: !0 },
              { label: "待发货", done: !0 },
              { label: "已发货", done: !1 },
              { label: "已完成", done: !1 },
            ],
          },
          shipped: {
            current: 2,
            steps: [
              { label: "待付款", done: !0 },
              { label: "待取货", done: !0 },
              { label: "已发货", done: !0 },
              { label: "已完成", done: !1 },
            ],
          },
          completed: {
            current: 3,
            steps: [
              { label: "待付款", done: !0 },
              { label: "待取货", done: !0 },
              { label: "已发货", done: !0 },
              { label: "已完成", done: !0 },
            ],
          },
          cancelled: { current: 0, steps: [{ label: "已取消", done: !0 }] },
          refunding: { current: 1, steps: [{ label: "退款审核中", done: !0 }] },
          refunded: { current: 1, steps: [{ label: "已退款", done: !0 }] },
        },
        o = {
          pending: "待付款",
          paid: "待取货",
          shipping: "待发货",
          shipped: "已发货",
          completed: "已完成",
          cancelled: "已取消",
          refunding: "退款审核中",
          refunded: "已退款",
          confirmed: "已确认",
        };
      function u(e) {
        return "¥" + (e / 100).toFixed(2);
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
      async function onCancelOrder() {
        e.index.showModal({
          title: "提示",
          content: "确定要取消该订单吗？",
          success: async (res) => {
            if (res.confirm) {
              try {
                await t.cancelOrder(l.value.id);
                e.index.showToast({ title: "订单已取消", icon: "success" });
                const o = await t.getOrderDetail(l.value.id);
                l.value = o.data || o;
              } catch (err) {
                e.index.showToast({ title: err.message || "取消失败", icon: "none" });
              }
            }
          }
        });
      }
      async function onPayOrder() {
        e.index.showLoading({ title: "发起支付..." });
        try {
          const payRes = await t.payOrder(l.value.id);
          const payParams = payRes.data || payRes;
          await requestWxPay(payParams);
          await t.confirmOrderPayment(l.value.id);
          e.index.hideLoading();
          e.index.showToast({ title: "支付成功", icon: "success" });
          const o = await t.getOrderDetail(l.value.id);
          l.value = o.data || o;
        } catch (err) {
          e.index.hideLoading();
          e.index.showToast({ title: err.message || "支付失败", icon: "none" });
        }
      }
      async function onConfirmReceipt() {
        e.index.showModal({
          title: "提示",
          content: "确定已收到商品吗？",
          success: async (res) => {
            if (res.confirm) {
              try {
                await t.confirmReceipt(l.value.id);
                e.index.showToast({ title: "已确认收货", icon: "success" });
                const o = await t.getOrderDetail(l.value.id);
                l.value = o.data || o;
              } catch (err) {
                e.index.showToast({ title: err.message || "确认失败", icon: "none" });
              }
            }
          }
        });
      }
      async function onApplyRefund() {
        const reasons = ["不想要了", "商品信息不符", "地址/自提信息有误", "其他原因"];
        e.index.showActionSheet({
          itemList: reasons,
          success: async (res) => {
            const reason = reasons[res.tapIndex] || "其他原因";
            try {
              await t.applyRefund(l.value.id, { reason });
              e.index.showToast({ title: "退款申请已提交", icon: "success" });
              const o = await t.getOrderDetail(l.value.id);
              l.value = o.data || o;
            } catch (err) {
              e.index.showToast({ title: err.message || "申请失败", icon: "none" });
            }
          }
        });
      }
      return (
        e.onLoad(async (a) => {
          const d = null == a ? void 0 : a.id;
          if (!d) return void e.index.navigateBack();
          try {
            const o = await t.getOrderDetail(d);
            l.value = o.data || o;
            if (["shipped", "completed"].includes(l.value.status)) {
              await fetchLogistics(d);
            }
          } catch (err) {
            e.index.showToast({ title: err.message || "订单详情加载失败", icon: "none" });
          } finally {
            n.value = !1;
          }
        }),
        (t, a) => {
          var s, p;
          return e.e(
            { 
              a: e.p({ title: "订单详情", "show-back": !0 }), 
              b: n.value,
              hasLogistics: logisticsList.value.length > 0,
              logisticsList: e.f(logisticsList.value, (item, index) => ({
                time: item.time,
                status: item.status,
                desc: item.desc,
                isFirst: index === 0
              }))
            },
            n.value
              ? {}
              : l.value
                ? e.e(
                    {
                      d: e.t(o[l.value.status] || l.value.status),
                      e: e.f(
                        (d[l.value.status] || d.pending).steps,
                        (t, a, n) =>
                          e.e(
                            {
                              a: t.done ? 1 : "",
                              b:
                                a <
                                (d[l.value.status] || d.pending).steps.length -
                                  1,
                            },
                            a <
                              (d[l.value.status] || d.pending).steps.length - 1
                              ? {
                                  c: (d[l.value.status] || d.pending).steps[
                                    a + 1
                                  ].done
                                    ? 1
                                    : "",
                                }
                              : {},
                            { d: a },
                          ),
                      ),
                      f: e.f(l.value.items, (t, a, l) =>
                        e.e(
                          { a: t.productImage },
                          t.productImage ? { b: t.productImage } : {},
                          {
                            c: e.t(t.productName),
                            d: e.t(t.quantity),
                            e: e.t(u(t.price)),
                            f: t.productId,
                          },
                        ),
                      ),
                      g: e.t(u(l.value.totalAmount)),
                      h: l.value.discountAmount > 0,
                    },
                    l.value.discountAmount > 0
                      ? { i: e.t(u(l.value.discountAmount)) }
                      : {},
                    {
                      j: e.t(u(l.value.payAmount)),
                      k: e.t(l.value.orderNo),
                      l: e.t(
                        null == (s = l.value.createdAt)
                          ? void 0
                          : s.slice(0, 16).replace("T", " "),
                      ),
                      m: l.value.payAt,
                    },
                    l.value.payAt
                      ? {
                          n: e.t(
                            null == (p = l.value.payAt)
                              ? void 0
                              : p.slice(0, 16).replace("T", " "),
                          ),
                        }
                      : {},
                    { o: l.value.payMethod },
                    (l.value.payMethod, {}),
                    {
                      shipName: l.value.shippingAddress && (l.value.shippingAddress.contactName || l.value.shippingAddress.receiver),
                      shipPhone: l.value.shippingAddress && l.value.shippingAddress.phone,
                      shipAddress: l.value.shippingAddress && (l.value.shippingAddress.detailAddress || [
                        l.value.shippingAddress.province,
                        l.value.shippingAddress.city,
                        l.value.shippingAddress.district,
                        l.value.shippingAddress.detail
                      ].filter(Boolean).join("")),
                      deliveryMethodText: l.value.shippingAddress && (l.value.shippingAddress.deliveryMethod === "pickup" ? "到店自提" : "快递邮寄"),
                      pickupStoreName: l.value.shippingAddress && l.value.shippingAddress.storeName,
                      pickupStorePhone: l.value.shippingAddress && l.value.shippingAddress.storePhone,
                      pickupStoreHours: l.value.shippingAddress && l.value.shippingAddress.storeBusinessHours,
                      expressCompany: l.value.shippingAddress && l.value.shippingAddress.express_company,
                      trackingNumber: l.value.shippingAddress && l.value.shippingAddress.tracking_number,
                      refundReason: l.value.shippingAddress && l.value.shippingAddress.refund_reason,
                      p0: l.value.status === "pending" || l.value.status === "shipping" || l.value.status === "shipped" || l.value.status === "paid",
                      p1: l.value.status === "pending",
                      p2: e.o(onCancelOrder),
                      p3: l.value.status === "pending",
                      p4: e.o(onPayOrder),
                      p5: l.value.status === "shipped",
                      p6: e.o(onConfirmReceipt),
                      p7: l.value.status === "paid" || l.value.status === "shipping",
                      p8: e.o(onApplyRefund)
                    }
                  )
                : {},
            { c: l.value },
          );
        }
      );
    },
  }),
  n = e._export_sfc(l, [["__scopeId", "data-v-e129e068"]]);
wx.createPage(n);
