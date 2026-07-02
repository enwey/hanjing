"use strict";
const e = require("../../common/vendor.js"),
  a = require("../../api/index.js");
Math || i();
function parseMarkdownToHtml(markdown) {
  if (!markdown) return '';
  var html = markdown;
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; display: block; margin: 12px auto; border-radius: 8px;" />');
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color: #3B6BF5; text-decoration: underline;">$1</a>');
  html = html.replace(/^### (.*?)$/gm, '<h3 style="font-size: 14px; font-weight: 700; margin: 16px 0 8px 0; color: #1F2937;">$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2 style="font-size: 16px; font-weight: 700; margin: 18px 0 10px 0; color: #1F2937;">$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1 style="font-size: 18px; font-weight: 700; margin: 20px 0 12px 0; color: #111827;">$1</h1>');
  html = html.replace(/^\- (.*?)$/gm, '<li style="margin-left: 18px; list-style-type: disc;">$1</li>');
  
  var lines = html.split('\n');
  var processedLines = lines.map(function(line) {
    var trimmed = line.trim();
    if (!trimmed) return '<br/>';
    if (trimmed.indexOf('<h') === 0 || trimmed.indexOf('<li') === 0 || trimmed.indexOf('<img') === 0 || trimmed.indexOf('<a') === 0 || trimmed.indexOf('<p') === 0) {
      return line;
    }
    return '<p style="margin-bottom: 8px; color: #4b5563; line-height: 1.8;">' + line + '</p>';
  });
  return processedLines.join('\n');
}
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
          contactName: "",
          phone: "",
          detailAddress: ""
        }),
        deliveryMethod = e.ref("online"),
        coupons = e.ref([]),
        selectedCouponId = e.ref(""),
        stores = e.ref([]),
        selectedStoreId = e.ref("");
      const discountAmount = e.computed(() => {
        const coupon = coupons.value.find(item => String(item.id) === String(selectedCouponId.value));
        if (!coupon) return 0;
        return Math.min(Number(coupon.value || 0), t.value ? t.value.price * quantity.value : 0);
      });
      const totalPayAmount = e.computed(() => Math.max(0, (t.value ? t.value.price * quantity.value : 0) - discountAmount.value));
      function formatStoreHours(store) {
        return store.businessHours || "";
      }
      function validateAddress() {
        if (!address.value.contactName.trim()) {
          e.index.showToast({ title: deliveryMethod.value === "online" ? "请填写收货人" : "请填写取货人", icon: "none" });
          return !1;
        }
        if (!/^1\d{10}$/.test(address.value.phone)) {
          e.index.showToast({ title: "请填写正确手机号", icon: "none" });
          return !1;
        }
        if (deliveryMethod.value === "online" && !address.value.detailAddress.trim()) {
          e.index.showToast({ title: "请填写详细地址", icon: "none" });
          return !1;
        }
        if (deliveryMethod.value === "pickup" && !selectedStoreId.value) {
          e.index.showToast({ title: "请选择自提门店", icon: "none" });
          return !1;
        }
        return !0;
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
      function chooseWxAddress() {
        if (!wx.chooseAddress) {
          e.index.showToast({ title: "当前微信版本不支持选择地址", icon: "none" });
          return;
        }
        wx.chooseAddress({
          success: (res) => {
            address.value = {
              contactName: res.userName || "",
              phone: res.telNumber || "",
              detailAddress: `${res.provinceName || ""}${res.cityName || ""}${res.countyName || ""}${res.detailInfo || ""}`
            };
            deliveryMethod.value = "online";
          },
          fail: () => {
            e.index.showToast({ title: "可手动填写收货地址", icon: "none" });
          }
        });
      }
      function openCheckout() {
        const token = e.index.getStorageSync("access_token");
        if (!token) {
          e.index.navigateTo({ url: "/pages/auth/login" });
          return;
        }
        showCheckout.value = !0;
        loadCheckoutOptions();
      }
      function closeCheckout() {
        showCheckout.value = !1;
      }
      async function loadCheckoutOptions() {
        try {
          const [couponRes, storeRes] = await Promise.all([
            a.getUserCoupons({ status: "active", minAmount: t.value ? t.value.price * quantity.value : 0 }),
            a.getStores()
          ]);
          coupons.value = ((couponRes.data && couponRes.data.list) || couponRes.list || []).filter(item => Number(item.minSpend || 0) <= (t.value ? t.value.price * quantity.value : 0));
          stores.value = ((storeRes.data || storeRes) || []).filter(item => item.status === "open" || item.isOpen);
          if (!selectedStoreId.value && stores.value.length) {
            selectedStoreId.value = String(stores.value[0].id);
          }
        } catch (err) {
          console.error("加载结算选项失败", err);
        }
      }
      function increaseQty() {
        quantity.value++;
        selectedCouponId.value = "";
        loadCheckoutOptions();
      }
      function decreaseQty() {
        if (quantity.value > 1) {
          quantity.value--;
          selectedCouponId.value = "";
          loadCheckoutOptions();
        }
      }
      function selectDeliveryOnline() {
        deliveryMethod.value = "online";
      }
      function selectDeliveryPickup() {
        deliveryMethod.value = "pickup";
      }
      function selectCoupon(event) {
        const id = event.currentTarget.dataset.id || "";
        selectedCouponId.value = String(selectedCouponId.value) === String(id) ? "" : id;
      }
      function selectStore(event) {
        selectedStoreId.value = event.currentTarget.dataset.id || "";
      }
      async function submitOrder() {
        if (isSubmitting.value) return;
        if (!validateAddress()) return;
        isSubmitting.value = !0;
        try {
          const res = await a.createOrder({
            items: [{ productId: t.value.id.toString(), quantity: quantity.value }],
            couponId: selectedCouponId.value || undefined,
            shippingAddress: {
              ...address.value,
              deliveryMethod: deliveryMethod.value,
              detailAddress: deliveryMethod.value === "online" ? address.value.detailAddress : (address.value.detailAddress || "到店自提"),
              storeId: deliveryMethod.value === "pickup" ? selectedStoreId.value : undefined
            }
          });
          const orderId = res.data.id;
          const payRes = await a.payOrder(orderId);
          const payParams = payRes.data || payRes;
          await requestWxPay(payParams);
          await a.confirmOrderPayment(orderId);
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
          const rawProd = r.data || r;
          if (rawProd) {
            rawProd.description = parseMarkdownToHtml(rawProd.description || '');
          }
          t.value = rawProd;
          n.value = false;
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
                      n: t.value.description, // Keep description as parsed html string (rich-text)
                      o: e.t(r(t.value.price)),
                      p: e.o(openCheckout, "d5"),
                      showCheckout: showCheckout.value,
                      closeCheckout: e.o(closeCheckout),
                      quantity: quantity.value,
                      increaseQty: e.o(increaseQty),
                      decreaseQty: e.o(decreaseQty),
                      deliveryMethod: deliveryMethod.value,
                      isOnlineDelivery: deliveryMethod.value === "online",
                      selectDeliveryOnline: e.o(selectDeliveryOnline),
                      selectDeliveryPickup: e.o(selectDeliveryPickup),
                      chooseWxAddress: e.o(chooseWxAddress),
                      submitOrder: e.o(submitOrder),
                      isSubmitting: isSubmitting.value,
                      coupons: coupons.value.map(item => ({
                        id: item.id,
                        title: item.title,
                        valueText: r(item.value || 0),
                        minSpendText: Number(item.minSpend || 0) > 0 ? `满${r(item.minSpend)}可用` : "无门槛",
                        selected: String(item.id) === String(selectedCouponId.value),
                        select: e.o(selectCoupon, item.id)
                      })),
                      hasCoupons: coupons.value.length > 0,
                      stores: stores.value.map(item => ({
                        id: item.id,
                        name: item.name,
                        address: item.address,
                        phone: item.phone,
                        hours: formatStoreHours(item),
                        selected: String(item.id) === String(selectedStoreId.value),
                        select: e.o(selectStore, item.id)
                      })),
                      hasStores: stores.value.length > 0,
                      contactName: address.value.contactName,
                      phone: address.value.phone,
                      detailAddress: address.value.detailAddress,
                      inputName: e.o((e) => (address.value.contactName = e.detail.value)),
                      inputPhone: e.o((e) => (address.value.phone = e.detail.value)),
                      inputDetail: e.o((e) => (address.value.detailAddress = e.detail.value)),
                      discountAmountText: e.t(r(discountAmount.value)),
                      hasDiscount: discountAmount.value > 0,
                      totalPayAmountText: e.t(r(totalPayAmount.value)),
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
