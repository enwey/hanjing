// Execute real client modules with isolated WeChat/storage/HTTP responses.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const suite = path.join(__dirname, 'login-comprehensive.cjs');
const fixture = { exports: {} };
vm.runInNewContext(fs.readFileSync(suite, 'utf8').split('const cases=[];')[0] + '\nmodule.exports={harness,token,gate,tick};', {
  module: fixture, require: createRequire(suite), __dirname, Buffer, console,
  structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { harness, token, gate, tick } = fixture.exports;
const results = [];
const previewStates = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, result: 'passed' }); }
  catch (e) { results.push({ name, result: 'failed', error: e.message }); }
}
function profilePage(h, api) {
  let page;
  const file = path.join(__dirname, '../../mp-weixin-rewrite/pages/profile/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    require: p => p.includes('session-store') ? h.store : p.includes('api/index') ? api : p.includes('image-url') ? { normalizeImageUrl: x => x || '' } : {},
    Page: p => { page = p; p.data = structuredClone(p.data); p.setData = d => Object.assign(p.data, d); },
    console, wx: {},
  }, { filename: file });
  return page;
}
(async () => {
  await check('SESSION-01 valid token survives app restart', async () => {
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' } });
    assert.equal(h.store.isLoggedIn(), true);
  });
  await check('SESSION-02 expired WeChat login resumes on profile entry', async () => {
    const expired = `e30.${Buffer.from(JSON.stringify({ id: 'a', exp: 1 })).toString('base64url')}.signature`;
    const h = harness({ storage: { access_token: expired, auth_mode: 'wechat' }, response: o => {
      if (o.url.includes('/auth/')) return { statusCode: 200, data: { data: { access_token: token('a') } } };
      if (o.header.Authorization === 'Bearer ' + expired) return { statusCode: 401, data: {} };
      return { statusCode: 200, data: { data: { id: 'a', nickname: 'Restored A' } } };
    } });
    const page = profilePage(h, { getMemberInfo: async () => ({}), getMemberLevels: async () => ({}),
      getNotifications: async () => ({}), getImUnreadCount: async () => ({}) });
    await page.onShow();
    assert.equal(h.authCalls().length, 1, 'profile must attempt WeChat renewal');
    assert.equal(page.data.nickname, 'Restored A');
    assert.equal(h.store.getAccessToken(), token('a'));
    previewStates.push({ title: '令牌到期后恢复会话', data: structuredClone(page.data) });
  });
  await check('SESSION-03 transient network failure during renewal preserves session', async () => {
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: o =>
      o.url.includes('/auth/') ? { network: true } : { statusCode: 401, data: {} } });
    await h.request.request({ url: '/user/profile' }).catch(() => {});
    assert.equal(h.store.getAuthMode(), 'wechat', 'network failure removed auth_mode');
    assert.ok(h.storage.get('access_token'), 'network failure removed access_token');
  });
  await check('SESSION-04 delayed member response must not render old account profile', async () => {
    const g = gate();
    let account = 'A';
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: o =>
      o.url.endsWith('/user/profile') ? { statusCode: 200, data: { data: { id: account.toLowerCase(), nickname: 'Account ' + account } } } : undefined });
    const page = profilePage(h, {
      getMemberInfo: () => account === 'A' ? g.promise : Promise.resolve({}),
      getMemberLevels: async () => ({}), getNotifications: async () => ({}), getImUnreadCount: async () => ({}),
    });
    const pending = page.onShow();
    await tick();
    assert.equal(h.store.state.profile.id, 'a', 'old profile already arrived before logout');
    h.store.logout();
    h.store.switchAccount('b');
    h.store.setAccessToken(token('b'));
    h.store.setAuthMode('wechat');
    h.store.state.profile = { id: 'b', nickname: 'Account B' };
    account = 'B';
    await page.onShow();
    assert.equal(page.data.nickname, 'Account B');
    g.resolve({});
    await pending;
    assert.equal(page.data.nickname, 'Account B', 'late aggregate response rendered old account nickname');
    previewStates.push({ title: '切换账号后的页面', data: structuredClone(page.data) });
  });
  await check('SESSION-05 successful renewal retries original request', async () => {
    let n = 0;
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: o => {
      if (o.url.includes('/auth/')) return { statusCode: 200, data: { data: { access_token: token('a') } } };
      return ++n === 1 ? { statusCode: 401, data: {} } : { statusCode: 200, data: { code: 0 } };
    } });
    assert.equal((await h.request.request({ url: '/user/profile' })).code, 0);
    assert.equal(h.authCalls().length, 1);
  });
  await check('SESSION-06 explicit renewal rejection clears login', async () => {
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: () => ({ statusCode: 401, data: {} }) });
    await h.request.request({ url: '/user/profile' }).catch(() => {});
    assert.equal(h.store.isLoggedIn(), false);
    assert.equal(h.store.getAuthMode(), '');
  });
  await check('SESSION-07 explicit logout does not silently log back in', async () => {
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: () => ({ statusCode: 401, data: {} }) });
    h.store.logout();
    await h.request.request({ url: '/user/profile' }).catch(() => {});
    assert.equal(h.authCalls().length, 0);
    assert.equal(h.store.isLoggedIn(), false);
  });
  for (const failure of ['network', 503, 'wx-fail']) {
    await check(`SESSION-08 transient ${failure} allows next request to recover`, async () => {
      let offline = true;
      let accepted = false;
      const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' },
        wxLogin: o => queueMicrotask(() => offline && failure === 'wx-fail' ? o.fail({}) : o.success({ code: 'code' })),
        response: o => {
          if (o.url.includes('/auth/')) {
            if (offline) return failure === 503 ? { statusCode: 503, data: {} } : { network: true };
            accepted = true;
            return { statusCode: 200, data: { data: { access_token: token('a') } } };
          }
          return accepted ? { statusCode: 200, data: { code: 0 } } : { statusCode: 401, data: {} };
        } });
      await assert.rejects(h.request.request({ url: '/user/profile' }));
      assert.equal(h.store.getAuthMode(), 'wechat');
      offline = false;
      assert.equal((await h.request.request({ url: '/user/profile' })).code, 0);
    });
  }
  await check('SESSION-09 expired non-WeChat and malformed tokens stay logged out', async () => {
    for (const mode of ['', 'password']) {
      const expired = `e30.${Buffer.from(JSON.stringify({ id: 'a', exp: 1 })).toString('base64url')}.signature`;
      assert.equal(harness({ storage: { access_token: expired, auth_mode: mode } }).store.isLoggedIn(), false);
    }
    for (const exp of [0, -1, '1', null]) {
      const malformed = `e30.${Buffer.from(JSON.stringify({ id: 'a', exp })).toString('base64url')}.signature`;
      assert.equal(harness({ storage: { access_token: malformed, auth_mode: 'wechat' } }).store.isLoggedIn(), false);
    }
  });
  await check('SESSION-10 hidden profile ignores completed pending requests', async () => {
    const g = gate();
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' } });
    const page = profilePage(h, { getMemberInfo: () => g.promise, getMemberLevels: async () => ({}),
      getNotifications: async () => ({}), getImUnreadCount: async () => ({}) });
    const pending = page.onShow();
    await tick();
    page.onHide();
    const before = JSON.stringify(page.data);
    g.resolve({});
    await pending;
    assert.equal(JSON.stringify(page.data), before);
  });
  await check('SESSION-11 renewal rejected on profile entry displays logged out', async () => {
    const expired = `e30.${Buffer.from(JSON.stringify({ id: 'a', exp: 1 })).toString('base64url')}.signature`;
    const h = harness({ storage: { access_token: expired, auth_mode: 'wechat' }, response: () => ({ statusCode: 401, data: {} }) });
    const page = profilePage(h, { getMemberInfo: async () => ({}), getMemberLevels: async () => ({}),
      getNotifications: async () => ({}), getImUnreadCount: async () => ({}) });
    await page.onShow();
    assert.equal(page.data.isLoggedIn, false);
    assert.equal(page.data.nickname, '点击登录');
    previewStates.push({ title: '明确拒绝续期后要求重新登录', data: structuredClone(page.data) });
  });
  const out = path.join(__dirname, 'artifacts/login-session-fix-selftest-2026-11-18');
  fs.mkdirSync(out, { recursive: true });
  const miniRoot = path.join(__dirname, '../../mp-weixin-rewrite');
  const wxml = fs.readFileSync(path.join(miniRoot, 'pages/profile/index.wxml'), 'utf8');
  const card = wxml.slice(wxml.indexOf('<view class="user-card"'), wxml.indexOf('<view wx:if="{{showProfileSetupCard}}"'));
  const css = fs.readFileSync(path.join(miniRoot, 'pages/profile/index.wxss'), 'utf8').replace(/([\d.]+)rpx/g, (_, n) => Number(n) / 2 + 'px');
  const escape = value => String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(miniRoot, 'static/images/brand-logo-v20261105.png')).toString('base64');
  const markup = previewStates.map(({ title, data }) => {
    let rendered = card.replace(/<image wx:if="{{avatarUrl}}"[^>]*\/>/g, data.avatarUrl ? '$&' : '');
    rendered = rendered.replace(/\s(?:bindtap|wx:if)="[^"]*"/g, '').replace(/{{(\w+)}}/g, (_, key) => escape(data[key]));
    rendered = rendered.replace(/<view\b/g, '<div').replace(/<\/view>/g, '</div>').replace(/<text\b/g, '<span').replace(/<\/text>/g, '</span>').replace(/<image\b/g, '<img').replaceAll('/static/images/brand-logo-v20261105.png', logo);
    return `<section><h2>${title}</h2>${rendered}</section>`;
  }).join('');
  fs.writeFileSync(path.join(out, 'profile-preview.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}*{box-sizing:border-box}body{margin:0;padding:16px;background:#f9fafb;font-family:Arial,"Microsoft Yahei",sans-serif}h2{font-size:15px;font-weight:500}img{object-fit:cover}section{max-width:390px}</style>${markup}`);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ method: 'actual client modules; mocked WeChat and HTTP', results }, null, 2));
  for (const r of results) console.log(`${r.result.toUpperCase()} ${r.name}${r.error ? ': ' + r.error : ''}`);
  process.exitCode = results.some(r => r.result === 'failed') ? 1 : 0;
})();
