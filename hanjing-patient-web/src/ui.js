export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, 'https://patient.invalid');
    return ['http:', 'https:'].includes(url.protocol) ? value : '';
  } catch {
    return '';
  }
}
export const href = (page, params = {}) =>
  '#/' +
  page +
  (Object.keys(params).length ? '?' + new URLSearchParams(params) : '');
export const link = (label, page, params = {}, cls = 'text-button') =>
  `<a class="${esc(cls)}" href="${esc(href(page, params))}">${esc(label)}</a>`;
export const btn = (label, page, params = {}) =>
  link(label, page, params, 'btn');
export const action = (label, name, attrs = '', secondary = true) =>
  `<button type="button" class="btn${secondary ? ' secondary' : ''}" data-action="${esc(name)}" ${attrs}>${esc(label)}</button>`;
export const image = (src, alt, cls = '') =>
  safeUrl(src)
    ? `<img class="${esc(cls)}" src="${esc(safeUrl(src))}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="image-fallback ${esc(cls)}" role="img" aria-label="暂无图片">${esc(alt?.slice(0, 1) || '兴')}</div>`;
export const money = (value) =>
  Number.isFinite(Number(value)) ? '¥' + (Number(value) / 100).toFixed(2) : '—';
export const date = (value) => (value ? String(value).slice(0, 10) : '—');
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const statuses = {
  pending_payment: '待支付',
  pending: '待确认',
  confirmed: '已确认',
  checked_in: '已签到',
  arrived: '已到店',
  completed: '已完成',
  cancelled: '已取消',
  expired: '已过期',
  paid: '已支付',
  shipped: '已发货',
  delivered: '已送达',
  refunded: '已退款',
  refunding: '退款中',
  closed: '已关闭',
  active: '进行中',
  inactive: '未启用',
  approved: '已通过',
  rejected: '未通过',
  normal: '正常',
  mild: '轻度',
  moderate: '中度',
  severe: '重度',
  low: '较低',
  high: '较高',
  available: '可预约',
  live: '直播中',
  ended: '已结束',
  upcoming: '即将开始',
};
export const badge = (status) =>
  `<span class="badge">${esc(statuses[status] || status || '—')}</span>`;
export const empty = (text = '暂无记录', extra = '') =>
  `<div class="empty-state"><h3>${esc(text)}</h3>${extra}</div>`;
export const panel = (title, body, cls = '') =>
  `<section class="pc-panel ${cls}">${title ? `<h2>${esc(title)}</h2>` : ''}${body}</section>`;
export const field = (label, name, value = '', type = 'text', attrs = '') =>
  `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${attrs}></label>`;
export const area = (label, name, value = '', attrs = '') =>
  `<label class="field"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="4" ${attrs}>${esc(value)}</textarea></label>`;
export const select = (label, name, options, value = '', attrs = '') =>
  `<label class="field"><span>${esc(label)}</span><select name="${esc(name)}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
export const submit = (label = '保存') =>
  `<div class="form-message" role="alert"></div><button class="btn" type="submit">${esc(label)}</button>`;
export const form = (name, body, attrs = '') =>
  `<form data-form="${esc(name)}" ${attrs}>${body}</form>`;
export const kv = (pairs) =>
  `<dl class="detail-grid">${pairs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v ?? '—')}</dd></div>`).join('')}</dl>`;
export const records = (rows, render, msg) =>
  rows.length ? rows.map(render).join('') : empty(msg);
export const patientSelect = (members, id = '') => {
 const selected=String(id || members.find(p=>p.relation==='self')?.id || members[0]?.id || '');
 return `<div class="patient-options-bar"><div class="patient-options-main"><span class="patient-options-label">就诊人</span><select name="patientId" data-patient-select hidden aria-hidden="true" tabindex="-1">${members.map(p=>`<option value="${esc(p.id)}" ${String(p.id)===selected?'selected':''}>${esc(p.name)}</option>`).join('')}</select><div class="patient-options" role="group" aria-label="选择就诊人">${members.map(p=>`<button type="button" data-patient-option="${esc(p.id)}" aria-pressed="${String(p.id)===selected}">${esc(p.name)}</button>`).join('')}</div></div>${link('管理就诊人','family')}</div>`;
};
export const pageHead = (title, desc = '', actions = '') =>
  `<div class="pc-page-head"><div><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ''}</div><div class="pc-actions">${actions}</div></div>`;
export const errors = (text) =>
  `<div class="error-state" role="alert"><h3>暂时无法加载</h3><p>${esc(text)}</p>${action('重新加载', 'retry')}</div>`;
