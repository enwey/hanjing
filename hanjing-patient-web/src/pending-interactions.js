import { request } from './api.js';
import { money } from "./ui.js";
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
  if (["checkout", "product"].includes(c.page) && target.closest('[data-form="order"]')) {
    const f = target.form,
      total = Number(f.elements.quantity.value) * Number(c.product.price);
    f.querySelector("[data-checkout-total]").textContent = money(total);
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
  const result = await request('/user/upload?ext=' + ext, {
    method: 'POST', rawBody: file, token: c.token, signal: c.signal,
  });
  if (!result?.url) throw Error('图片上传失败，请重试');
  return result.url;
}
