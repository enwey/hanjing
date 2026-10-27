import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createAsyncRouter } from '../async-router.js';
import { query, transaction } from '../db.js';
import { JWT_SECRET, authenticateWxToken } from '../helpers.js';
import { createRateLimiter } from '../runtime-safety.js';

// This router never writes users.openid: that field belongs to the mini-program.
const router = createAsyncRouter();
const prefix = '/api/v1/pc/auth/wechat';
const stateCookie = 'pc_wechat_state';
const bindCookie = 'pc_wechat_bind';
const ttl = 300;
const cookie = (req, name) =>
  String(req.headers.cookie || '')
    .split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + '='))
    ?.slice(name.length + 1) || '';
export function websiteConfig(env = process.env) {
  const origin = env.PC_WEB_ORIGIN || '';
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw Object.assign(new Error('PC 微信登录尚未配置'), { statusCode: 503 });
  }
  if (
    !env.WECHAT_WEB_APP_ID ||
    !env.WECHAT_WEB_APP_SECRET ||
    !['https:', 'http:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw Object.assign(new Error('PC 微信登录配置不完整'), {
      statusCode: 503,
    });
  return {
    origin: url.origin,
    appid: env.WECHAT_WEB_APP_ID,
    secret: env.WECHAT_WEB_APP_SECRET,
    redirectUri: url.origin + '/?wechat=callback',
    secure: url.protocol === 'https:',
  };
}
function setCookie(res, name, value, config, maxAge = ttl) {
  res.append(
    'Set-Cookie',
    `${name}=${value}; Path=${prefix}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.secure ? '; Secure' : ''}`,
  );
}
function verified(value, scope) {
  try {
    const data = jwt.verify(value, JWT_SECRET, {
      algorithms: ['HS256'],
      audience: 'patient-web',
    });
    if (data.scope === scope) return data;
  } catch {}
  throw Object.assign(new Error('微信登录已过期，请重新扫码'), {
    statusCode: 401,
  });
}
function fail(res, status, message) {
  return res.status(status).json({ code: status, message });
}
async function wxGet(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  if (!response.ok || body.errcode)
    throw Object.assign(new Error('微信授权失败，请重新扫码'), {
      statusCode: 400,
    });
  return body;
}
function issue(user) {
  return {
    access_token: jwt.sign({ id: user.id, openid: user.openid }, JWT_SECRET, {
      expiresIn: '30d',
    }),
    expires_in: 2592000,
  };
}
router.use(prefix, createRateLimiter({ windowMs: 60_000, limit: 20 }));
router.use(prefix, (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return next();
  try {
    const config = websiteConfig();
    if (req.headers.origin !== config.origin)
      return fail(res, 403, '请从 PC 网站发起登录');
    req.pcConfig = config;
    next();
  } catch (error) {
    return fail(res, error.statusCode || 503, error.message);
  }
});
router.post(prefix + '/start', (req, res) => {
  const config = req.pcConfig;
  const state = crypto.randomBytes(32).toString('hex');
  const ticket = jwt.sign(
    { scope: 'pc-wechat-state', nonce: state },
    JWT_SECRET,
    { audience: 'patient-web', expiresIn: ttl },
  );
  setCookie(res, stateCookie, ticket, config);
  setCookie(res, bindCookie, '', config, 0);
  const url = new URL('https://open.weixin.qq.com/connect/qrconnect');
  for (const [k, v] of Object.entries({
    appid: config.appid,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'snsapi_login',
    state,
  }))
    url.searchParams.set(k, v);
  url.hash = 'wechat_redirect';
  res.json({ code: 0, data: { authorizeUrl: url.href } });
});
router.post(prefix + '/exchange', async (req, res) => {
  const { code, state } = req.body || {};
  if (
    typeof code !== 'string' ||
    !code ||
    code.length > 512 ||
    typeof state !== 'string' ||
    !/^\w{64}$/.test(state)
  )
    return fail(res, 400, '微信授权参数无效');
  try {
    const saved = verified(cookie(req, stateCookie), 'pc-wechat-state').nonce;
    if (
      typeof saved !== 'string' ||
      saved.length !== state.length ||
      !crypto.timingSafeEqual(Buffer.from(saved), Buffer.from(state))
    )
      return fail(res, 401, '微信登录校验失败，请重新扫码');
    setCookie(res, stateCookie, '', req.pcConfig, 0);
    const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
    for (const [k, v] of Object.entries({
      appid: req.pcConfig.appid,
      secret: req.pcConfig.secret,
      code,
      grant_type: 'authorization_code',
    }))
      url.searchParams.set(k, v);
    const wx = await wxGet(url);
    if (!wx.openid || !wx.unionid)
      return fail(
        res,
        409,
        '微信未返回统一账号标识，请联系管理员检查开放平台绑定',
      );
    const userInfoUrl = new URL('https://api.weixin.qq.com/sns/userinfo');
    userInfoUrl.searchParams.set('access_token', wx.access_token);
    userInfoUrl.searchParams.set('openid', wx.openid);
    const identity = await wxGet(userInfoUrl);
    if (identity.openid !== wx.openid || identity.unionid !== wx.unionid)
      return fail(res, 401, '微信身份校验失败');
    const users = await query(
      'SELECT id,openid FROM users WHERE unionid=? LIMIT 2',
      [wx.unionid],
    );
    if (users.length > 1)
      return fail(
        res,
        409,
        '微信关联了多个患者账号，请联系管理员核对，不能自动合并',
      );
    const user = users[0];
    if (user?.openid) {
      setCookie(res, bindCookie, '', req.pcConfig, 0);
      return res.json({ code: 0, data: issue(user) });
    }
    const ticket = jwt.sign(
      { scope: 'pc-wechat-bind', unionid: wx.unionid },
      JWT_SECRET,
      { audience: 'patient-web', expiresIn: ttl },
    );
    setCookie(res, bindCookie, ticket, req.pcConfig);
    return res.json({
      code: 0,
      data: {
        bindingRequired: true,
        message: '请登录已有患者账号并确认关联微信；尚未注册请先在小程序注册。',
      },
    });
  } catch (error) {
    return fail(
      res,
      error.statusCode || 502,
      error.statusCode ? error.message : '微信服务暂不可用，请稍后重试',
    );
  }
});
router.post(prefix + '/bind', authenticateWxToken, async (req, res) => {
  if (req.body?.confirm !== true)
    return fail(res, 400, '请确认关联当前患者账号');
  try {
    const identity = verified(cookie(req, bindCookie), 'pc-wechat-bind');
    await transaction(async (conn) => {
      const [matches] = await conn.execute(
        'SELECT id,unionid FROM users WHERE unionid=? OR id=? FOR UPDATE',
        [identity.unionid, req.user.id],
      );
      const current = matches.find((u) => String(u.id) === String(req.user.id));
      if (
        !current ||
        matches.some((u) => String(u.id) !== String(req.user.id)) ||
        (current.unionid && current.unionid !== identity.unionid)
      )
        throw Object.assign(new Error('微信或患者账号已有关联，不能自动合并'), {
          statusCode: 409,
        });
      await conn.execute('UPDATE users SET unionid=? WHERE id=?', [
        identity.unionid,
        req.user.id,
      ]);
    });
    setCookie(res, bindCookie, '', req.pcConfig, 0);
    res.json({ code: 0, data: { linked: true } });
  } catch (error) {
    return fail(
      res,
      error.statusCode || 500,
      error.statusCode ? error.message : '关联失败，请稍后重试',
    );
  }
});
export default router;
