const CODE_PATTERN = /BP[a-f0-9]{24}/i;
const STRICT_CODE_PATTERN = /^BP[a-f0-9]{24}$/i;

function safeDecode(val) {
  if (typeof val !== 'string' || !val) return '';
  let str = val;
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(str);
      if (decoded === str) break;
      str = decoded;
    } catch (e) {
      break;
    }
  }
  return str;
}

function extractCode(target) {
  if (!target) return '';
  if (typeof target === 'string') {
    const decoded = safeDecode(target);
    const m = decoded.match(CODE_PATTERN);
    return m ? m[0] : '';
  }
  if (typeof target !== 'object') return '';

  if (target.query && typeof target.query === 'object') {
    const fromQuery = extractCode(target.query);
    if (fromQuery) return fromQuery;
  }

  const keys = ['ref', 'code', 'inviteCode', 'invite_code', 'referralCode', 'referral_code'];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (typeof target[k] === 'string') {
      const decoded = safeDecode(target[k].trim());
      const m = decoded.match(CODE_PATTERN);
      if (m) return m[0];
    }
  }

  if (typeof target.scene === 'string') {
    const scene = safeDecode(target.scene.trim());
    const m = scene.match(CODE_PATTERN);
    if (m) return m[0];
  }

  return '';
}

function capture(options) {
  if (!options) return;
  const code = extractCode(options);
  if (STRICT_CODE_PATTERN.test(code)) {
    try {
      wx.setStorageSync('backend_referral', {
        code,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
      });
    } catch (e) {}
  }
}

function current() {
  try {
    const value = wx.getStorageSync('backend_referral');
    return value && value.expiresAt > Date.now() && STRICT_CODE_PATTERN.test(value.code) ? value.code : undefined;
  } catch (e) {
    return undefined;
  }
}

function clear(code) {
  try {
    const value = wx.getStorageSync('backend_referral');
    if (!code || (value && value.code === code)) {
      wx.removeStorageSync('backend_referral');
    }
  } catch (e) {}
}

module.exports = { capture, current, clear };

