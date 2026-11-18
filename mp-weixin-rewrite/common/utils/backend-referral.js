const CODE_PATTERN = /^BP[a-f0-9]{24}$/i;
const REFERRAL_KEYS = ['ref', 'code', 'inviteCode', 'invite_code', 'referralCode', 'referral_code'];
let scanRevision = 0;

function safeDecode(val, stopAtFields = false) {
  if (typeof val !== 'string' || !val) return '';
  let str = val;
  for (let i = 0; i < 3; i++) {
    if (stopAtFields && str.includes('=')) break;
    try {
      const decoded = decodeURIComponent(str);
      if (decoded === str) break;
      str = decoded;
    } catch (e) {
      return i === 0 ? '' : str;
    }
  }
  return str;
}

function readCode(value) {
  const code = safeDecode(value).trim();
  return CODE_PATTERN.test(code) ? code : '';
}

function decodeScene(scene) {
  return safeDecode(scene, true).trim();
}

function readScene(scene) {
  const decoded = decodeScene(scene);
  if (!decoded.includes('=')) return readCode(decoded);
  for (const entry of decoded.split('&')) {
    const separator = entry.indexOf('=');
    if (separator < 0 || !REFERRAL_KEYS.includes(entry.slice(0, separator))) continue;
    const code = readCode(entry.slice(separator + 1));
    if (code) return code;
  }
  return '';
}

function extractCode(target) {
  if (!target) return '';
  if (typeof target === 'string') return readScene(target);
  if (typeof target !== 'object') return '';

  if (target.query && typeof target.query === 'object') {
    const fromQuery = extractCode(target.query);
    if (fromQuery) return fromQuery;
  }

  for (const key of REFERRAL_KEYS) {
    const code = readCode(target[key]);
    if (code) return code;
  }
  return readScene(target.scene);
}

function capture(options) {
  if (!options) return;
  const code = extractCode(options);
  if (code) {
    try {
      wx.setStorageSync('backend_referral', {
        code,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
        scanRevision: ++scanRevision,
      });
    } catch (e) {}
  }
}

function snapshot() {
  try {
    const value = wx.getStorageSync('backend_referral');
    return value && value.expiresAt > Date.now() && CODE_PATTERN.test(value.code) ? value : undefined;
  } catch (e) {
    return undefined;
  }
}

function current() {
  return snapshot()?.code;
}

function clearSnapshot(submitted) {
  if (!submitted) return;
  try {
    const stored = wx.getStorageSync('backend_referral');
    if (stored && stored.code === submitted.code && stored.expiresAt === submitted.expiresAt &&
        stored.scanRevision === submitted.scanRevision) {
      wx.removeStorageSync('backend_referral');
    }
  } catch (e) {}
}

function clear(code) {
  try {
    const value = wx.getStorageSync('backend_referral');
    if (!code || (value && value.code === code)) {
      wx.removeStorageSync('backend_referral');
    }
  } catch (e) {}
}

module.exports = {
  capture, current, clear, snapshot, clearSnapshot, decodeScene,
  isBackendCode: value => Boolean(readScene(value)),
};

