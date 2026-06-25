"use strict";
const e = require("../../common/vendor.js"),
  a = require("../../api/index.js");
Math || i();
const i = () => "../../components/base/hj-navbar.js",
  t = e.defineComponent({
    __name: "detail",
    setup(i) {
      const t = e.ref(null),
        n = e.ref(!0),
        l = e.ref(0);
      function r(e) {
        return "¥" + (e / 100).toFixed(2);
      }
      const showCheckout = e.ref(!1),
        quantity = e.ref(1),
        isSubmitting = e.ref(!1),
        address = e.ref({
          contactName: "张三",
          phone: "13800000000",
          detailAddress: "广东省深圳市南山区科技园南海大道1001号"
        });
      function openCheckout() {
        const token = e.index.getStorageSync("access_token");
        if (!token) {
          e.index.navigateTo({ url: "/pages/auth/login" });
          return;
        }
        showCheckout.value = !0;
      }
      function closeCheckout() {
        showCheckout.value = !1;
      }
      function increaseQty() {
        quantity.value++;
      }
      function decreaseQty() {
        quantity.value > 1 && quantity.value--;
      }
      async function submitOrder() {
        if (isSubmitting.value) return;
        isSubmitting.value = !0;
        try {
          const res = await a.createOrder({
            items: [{ productId: t.value.id.toString(), quantity: quantity.value }],
            shippingAddress: address.value
          });
          const orderId = res.data.id;
          await a.payOrder(orderId);
          e.index.showToast({ title: "支付成功", icon: "success" });
          showCheckout.value = !1;
          setTimeout(() => {
            e.index.navigateTo({
              url: `/pages/order/detail?id=${orderId}`
            });
          }, 1000);
        } catch (err) {
          console.error(err);
          e.index.showToast({ title: "支付失败", icon: "none" });
        } finally {
          isSubmitting.value = !1;
        }
      }
      return (
        e.onLoad(async (i) => {
          const l = null == i ? void 0 : i.id;
          if (!l) return void e.index.navigateBack();
          const r = await a.getProductDetail(l);
          ((t.value = r.data || r), (n.value = !1));
        }),
        (a, i) =>
          e.e(
            { a: e.p({ title: "商品详情", "show-back": !0 }), b: n.value },
            n.value
              ? {}
              : t.value
                ? e.e(
                    {
                      d: e.f(t.value.galleryUrls || (t.value.imageUrl ? [t.value.imageUrl] : []), (e, a, i) => ({ a: e, b: a })),
                      e: l.value,
                      f: e.o((e) => (l.value = e.detail.current), "05"),
                      g: e.t(r(t.value.price)),
                      h: t.value.originalPrice,
                    },
                    t.value.originalPrice
                      ? { i: e.t(r(t.value.originalPrice)) }
                      : {},
                    { j: t.value.originalPrice },
                    t.value.originalPrice
                      ? {
                          k: e.t(
                            Math.round(
                              100 * (1 - t.value.price / t.value.originalPrice),
                            ),
                          ),
                        }
                      : {},
                    {
                      l: e.t(t.value.name),
                      m: e.t(t.value.sales),
                      n: e.t(t.value.description),
                      o: e.t(r(t.value.price)),
                      p: e.o(openCheckout, "d5"),
                      showCheckout: showCheckout.value,
                      closeCheckout: e.o(closeCheckout),
                      quantity: quantity.value,
                      increaseQty: e.o(increaseQty),
                      decreaseQty: e.o(decreaseQty),
                      submitOrder: e.o(submitOrder),
                      isSubmitting: isSubmitting.value,
                      contactName: address.value.contactName,
                      phone: address.value.phone,
                      detailAddress: address.value.detailAddress,
                      inputName: e.o((e) => (address.value.contactName = e.detail.value)),
                      inputPhone: e.o((e) => (address.value.phone = e.detail.value)),
                      inputDetail: e.o((e) => (address.value.detailAddress = e.detail.value)),
                      totalPayAmountText: e.t(r(t.value.price * quantity.value)),
                      productImageUrl: t.value.imageUrl
                    },
                  )
                : {},
            { c: t.value },
          )
      );
    },
  }),
  n = e._export_sfc(t, [["__scopeId", "data-v-5e948475"]]);
wx.createPage(n);
