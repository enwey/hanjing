import { money } from "./ui.js";
export function withdrawalAmounts(input, info) {
  const valid = /^\d+(\.\d{1,2})?$/.test(String(input)),
    amount = valid ? Math.round(Number(input) * 100) : 0,
    rate = info.withdrawFeeRates?.bank;
  if (
    !valid ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    rate == null ||
    !Number.isFinite(Number(rate)) ||
    Number(rate) < 0 ||
    !Number.isSafeInteger(info.minWithdrawAmount)
  )
    return { valid: false, amount, fee: 0, net: 0 };
  const fee = Math.max(Math.round(amount * Number(rate)), 100),
    net = amount - fee;
  return {
    valid:
      amount >= info.minWithdrawAmount &&
      amount <= info.availableCommission &&
      net > 0,
    amount,
    fee,
    net,
  };
}
export function updatePendingForm(target, c) {
  if (target.matches("[data-publish-content]")) {
    const count = target.form.querySelector("[data-publish-count]");
    if (count) count.textContent = target.value.length + "/1000";
  }
  if (target.matches("[data-publish-tag]")) {
    const selected = [
      ...target.form.querySelectorAll("[data-publish-tag]:checked"),
    ];
    if (selected.length > 3) {
      target.checked = false;
      return "最多选择3个标签";
    }
  }
  if (target.matches("[data-withdraw-amount]")) {
    const r = withdrawalAmounts(target.value, c.distribution);
    target.form.querySelector("[data-withdraw-fee]").textContent = money(r.fee);
    target.form.querySelector("[data-withdraw-net]").textContent = money(
      Math.max(0, r.net),
    );
  }
  if (c.page === "checkout" && target.closest('[data-form="order"]')) {
    const f = target.form,
      total = Number(f.elements.quantity.value) * Number(c.product.price),
      coupon = c.coupons.find(
        (a) => String(a.id) === f.elements.couponId.value,
      );
    f.querySelector("[data-checkout-total]").textContent = money(total);
    f.querySelector("[data-checkout-coupon]").textContent = coupon
      ? total >= coupon.minSpend
        ? coupon.title
        : "未达到该优惠券使用门槛"
      : "未使用优惠券";
  }
}
export async function uploadPendingImage(file, c) {
  if (
    !(file instanceof File) ||
    !["image/jpeg", "image/png", "image/gif"].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )
    throw Error("请选择8MB以内的JPG、PNG或GIF图片");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" }[
    file.type
  ];
  const res = await fetch("/api/v1/user/upload?ext=" + ext, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + c.token,
      "Content-Type": "application/octet-stream",
    },
    body: file,
    signal: c.signal,
  });
  const result = await res.json();
  if (!res.ok || ![0, 200].includes(result.code) || !result.data?.url)
    throw Error(result.message || "图片上传失败");
  return result.data.url;
}
