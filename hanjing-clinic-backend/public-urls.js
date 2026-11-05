export const PRODUCTION_ORIGIN = 'https://m.xingkangming.com';
const LEGACY_HOST = 'm.hanjinghealth.com';
const warnings = new Set();
function warn(message) { if (!warnings.has(message)) { warnings.add(message); console.warn('[Public URL]', message); } }

export function getPublicOrigin(req, env = process.env) {
  const primary = String(env.PUBLIC_BASE_URL || '').trim();
  const legacy = String(env.API_PUBLIC_BASE_URL || '').trim();
  const parse = value => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['/', '/api/v1', '/api/v1/'].includes(url.pathname)) throw new Error('公网地址必须为HTTP(S)域名，不得包含凭证、参数或业务路径');
    if (url.hostname === LEGACY_HOST) { warn('检测到旧资源域名，已统一为正式域名；请更新PUBLIC_BASE_URL。'); return PRODUCTION_ORIGIN; }
    return url.origin;
  };
  const first = primary ? parse(primary) : '';
  const second = legacy ? parse(legacy) : '';
  if (first && second && first !== second) throw new Error('PUBLIC_BASE_URL与API_PUBLIC_BASE_URL冲突，请只保留PUBLIC_BASE_URL');
  if (legacy) warn('API_PUBLIC_BASE_URL已废弃，请统一使用PUBLIC_BASE_URL。');
  const configured = first || second;
  if (env.NODE_ENV === 'production') {
    if (configured && configured !== PRODUCTION_ORIGIN) throw new Error('正式环境PUBLIC_BASE_URL必须为https://m.xingkangming.com');
    return PRODUCTION_ORIGIN;
  }
  if (configured) return configured;
  const protocol = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http').split(',')[0].trim();
  const host = req?.get?.('host');
  return host ? parse(`${protocol}://${host}`) : `http://127.0.0.1:${env.PORT || 5005}`;
}

export function normalizeOwnedAsset(value, origin) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    if (![LEGACY_HOST, 'm.xingkangming.com'].includes(url.hostname) || url.username || url.password) return value;
    if (!/^\/(uploads\/|static\/|api\/v1\/community\/brand-logo(?:-v\d+)?\.png)/.test(url.pathname)) return value;
    return origin + url.pathname + url.search + url.hash;
  } catch { return value; }
}

export function toAbsoluteAssetUrl(req, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const origin = getPublicOrigin(req);
  if (/^https?:\/\//i.test(text)) return normalizeOwnedAsset(text, origin);
  return `${origin}${text.startsWith('/') ? text : `/${text}`}`;
}

export function normalizeAssetResponses(req, res, next) {
  const origin = getPublicOrigin(req);
  const walk = value => {
    if (typeof value === 'string') return normalizeOwnedAsset(value, origin);
    if (Array.isArray(value)) return value.map(walk);
    if (value && Object.prototype.toString.call(value) === '[object Object]') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item)]));
    return value;
  };
  const json = res.json.bind(res);
  res.json = body => json(walk(body));
  next();
}
