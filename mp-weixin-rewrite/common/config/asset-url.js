// Only migrate owned resource URLs; preserve external/CDN URLs and signed queries.
function normalizeAssetUrl(value, apiBaseUrl) {
  if (typeof value !== 'string') return value;
  const origin = String(apiBaseUrl || '').replace(/\/api\/v1\/?$/, '');
  if (!/^https?:\/\/[^/]+$/i.test(origin)) return value;
  return value.replace(/^https?:\/\/m\.(?:hanjinghealth|xingkangming)\.com(?=\/(?:uploads\/|static\/|api\/v1\/community\/brand-logo(?:-v\d+)?\.png))/i, origin);
}
function normalizeAssets(value, apiBaseUrl) {
  if (typeof value === 'string') return normalizeAssetUrl(value, apiBaseUrl);
  if (Array.isArray(value)) return value.map(item => normalizeAssets(item, apiBaseUrl));
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    const result = {};
    Object.keys(value).forEach(key => { result[key] = normalizeAssets(value[key], apiBaseUrl); });
    return result;
  }
  return value;
}
module.exports = { normalizeAssetUrl, normalizeAssets };
