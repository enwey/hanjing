const TOKEN_CACHE = {
  value: '',
  expiresAt: 0
};

function createWechatTokenError(message, data = null) {
  const error = new Error(message || '获取微信 access_token 失败');
  error.statusCode = 502;
  error.data = data;
  return error;
}

function readWechatMiniCredentials() {
  const appId = String(process.env.WX_MINI_APP_ID || '').trim();
  const appSecret = String(process.env.WX_MINI_APP_SECRET || '').trim();
  if (!appId || !appSecret) {
    const error = new Error('未配置微信小程序 AppID / AppSecret');
    error.statusCode = 400;
    throw error;
  }
  return { appId, appSecret };
}

export function isWechatAccessTokenInvalid(data) {
  const errcode = Number(data && data.errcode);
  return errcode === 40001 || errcode === 42001;
}

export async function getWechatMiniAccessToken(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const now = Date.now();

  if (!forceRefresh && TOKEN_CACHE.value && TOKEN_CACHE.expiresAt > now + 60_000) {
    return TOKEN_CACHE.value;
  }

  const { appId, appSecret } = readWechatMiniCredentials();
  const response = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'client_credential',
      appid: appId,
      secret: appSecret,
      force_refresh: forceRefresh
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errcode || !data.access_token) {
    throw createWechatTokenError(data.errmsg || '获取微信 access_token 失败', data);
  }

  TOKEN_CACHE.value = String(data.access_token || '');
  TOKEN_CACHE.expiresAt = now + Math.max((Number(data.expires_in) || 7200) - 120, 60) * 1000;
  return TOKEN_CACHE.value;
}
