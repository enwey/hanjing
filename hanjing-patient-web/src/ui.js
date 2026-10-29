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
export const link = (label, page, params = {}, cls = 'btn secondary entry-button') =>
  `<a class="${esc(cls)}" href="${esc(href(page, params))}">${esc(label)}</a>`;
export const btn = (label, page, params = {}) =>
  link(label, page, params, 'btn');
export const action = (label, name, attrs = '', secondary = true) =>
  `<button type="button" class="btn${secondary ? ' secondary' : ''}" data-action="${esc(name)}" ${attrs}>${esc(label)}</button>`;
export const image = (src, alt, cls = '') =>
  safeUrl(src)
    ? `<img class="${esc(cls)}" ${cls.split(/\s+/).some(c=>/(^|-)avatar$/.test(c))?'data-avatar':''} src="${esc(safeUrl(src))}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="image-fallback ${esc(cls)}" role="img" aria-label="暂无图片">${esc(Array.from(alt||'兴')[0])}</div>`;
export const money = (value) =>
  Number.isFinite(Number(value)) ? '¥' + (Number(value) / 100).toFixed(2) : '—';
export const date = (value) => {
  if (!value) return '—';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (value instanceof Date || /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
  }
  return text.slice(0, 10);
};
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
const inputHint = (label, name, attrs = '') => {
  const hints = {
    phone: '请输入11位手机号', password: '请输入登录密码',
    oldPassword: '请输入原密码，未设置可留空', newPassword: '请输入6–20位新密码', confirmPassword: '请再次输入新密码',
    title: '请输入标题，最多40字', nickname: '请输入昵称', name: '请输入就诊人真实姓名',
    contactName: '请输入收货或自提联系人姓名', idCard: '请输入18位身份证号，已有号码可留空保留',
    cardNo: '请输入病历号（选填）', region: '例如：广东省深圳市南山区',
    address: '请输入街道、小区及门牌号（选填）', detailAddress: '请输入省市区、街道及门牌号',
    bankName: '例如：中国工商银行', accountName: '请输入与银行卡一致的开户姓名', accountNo: '请输入8–34位银行卡号，不含空格',
    amount: '请输入提现金额（元），最多两位小数', quantity: '请输入购买数量',
    wearDuration: '请输入0–24小时，可保留一位小数', painScore: '请输入0–10的整数，0表示无痛',
    symptomDesc: '例如：打鼾多久、白天是否嗜睡、夜间呼吸情况（选填）',
    note: '可填写佩戴感受、不适情况或其他补充说明', text: '请输入需要咨询的问题',
  };
  let hint = hints[name];
  if (name === 'content') hint = label.includes('评论') ? '请写下你的评论，最多1000字' : label.includes('评价') ? '可描述本次就诊体验，最多500字' : label.includes('反馈') ? '请描述设备问题、发生时间和使用情况，最多1000字' : '请输入具体内容';
  if (name === 'quantity') {
    const max = attrs.match(/\bmax="([^"]+)"/)?.[1];
    hint = max ? `请输入1–${max}之间的整数` : hint;
  }
  return hint || `请输入${label.replace(/（.*?）/g, '')}`;
};
const placeholder = (label, name, attrs) => /\bplaceholder\s*=/.test(attrs) ? '' : `placeholder="${esc(inputHint(label, name, attrs))}"`;
export const field = (label, name, value = '', type = 'text', attrs = '') => {
  const nativeHint = type === 'date' ? (name === 'birthday' ? '请选择出生日期，不晚于今天' : '请选择日期，不晚于今天') : type === 'file' ? '请选择 JPG、PNG 或 GIF 图片，单张不超过8MB' : '';
  const textLike = ['text','tel','email','url','search','password','number'].includes(type);
  return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${attrs} ${textLike ? placeholder(label,name,attrs) : ''} ${nativeHint ? `aria-description="${esc(nativeHint)}"` : ''}>${nativeHint ? `<small class="input-hint">${nativeHint}</small>` : ''}</label>`;
};
export const area = (label, name, value = '', attrs = '') =>
  `<label class="field"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="4" ${attrs} ${placeholder(label,name,attrs)}>${esc(value)}</textarea></label>`;
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
