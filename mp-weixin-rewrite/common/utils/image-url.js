const requestModule = require('../../api/request');

function getApiOrigin() {
  return String(requestModule.apiBaseUrl || '').replace(/\/api\/v1\/?$/, '');
}

function normalizeImageUrl(value) {
  const url = value === null || value === undefined ? '' : String(value).trim();
  if (!url) return '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) {
    return url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, getApiOrigin());
  }
  if (/^(https?:|wxfile:|cloud:|data:)/i.test(url)) return url;
  if (url.indexOf('/uploads/') === 0 || url.indexOf('/static/') === 0) {
    return getApiOrigin() + url;
  }
  return url;
}

function getFirstImageUrl(value) {
  if (Array.isArray(value)) {
    return normalizeImageUrl(value[0]);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return normalizeImageUrl(parsed[0]);
      }
    } catch (error) {}
  }
  return '';
}

function getStoreCoverUrl(store) {
  const record = store || {};
  return normalizeImageUrl(
    record.coverUrl ||
      record.cover_url ||
      record.storeCoverUrl ||
      record.store_cover_url ||
      record.imageUrl ||
      record.image_url ||
      record.avatarUrl ||
      record.avatar_url
  ) || getFirstImageUrl(record.imageUrls || record.image_urls);
}

module.exports = {
  normalizeImageUrl,
  getFirstImageUrl,
  getStoreCoverUrl,
};
