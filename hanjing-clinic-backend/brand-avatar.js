export const BRAND_AVATAR = '/api/v1/community/brand-logo-v20261105.png';
const DEFAULT_AVATAR_PATHS = new Set([
  BRAND_AVATAR,
  '/api/v1/community/brand-logo.png',
  '/static/images/brand-logo.png',
  '/static/images/brand-logo-v20261105.png',
  '/static/images/brand-koala.png',
  '/static/icons/koala-outline.svg',
  '/static/demo/avatar.jpg',
]);

// Normalize only known bundled defaults, never arbitrary uploaded portraits.
export function publicAvatar(value) {
  if (!value) return '';
  const raw = String(value);
  const path = raw.trim().replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  return DEFAULT_AVATAR_PATHS.has(path) ? BRAND_AVATAR : raw;
}
