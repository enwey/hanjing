const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const helperFile = path.join(__dirname, 'login-session-regression-2026-11-18.cjs');
const fixture = { exports: {} };
// Reuse the real module loaders, without running or overwriting regression results.
vm.runInNewContext(fs.readFileSync(helperFile, 'utf8').split('(async () => {')[0]
  .replace('artifacts/login-session-regression-2026-11-18', 'artifacts/login-badges-fix-selftest-2026-11-18')
  + '\nmodule.exports={harness,token,gate,tick,pageFor,defaultApi,replaceAccount};', {
  module: fixture, require: createRequire(helperFile), __dirname, Buffer, console,
  structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { harness, token, gate, tick, pageFor, defaultApi, replaceAccount } = fixture.exports;
const out = path.join(__dirname, 'artifacts/login-badges-fix-selftest-2026-11-18');
const results = [], previews = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, result: 'passed' }); }
  catch (e) { results.push({ name, result: 'failed', error: e.message }); }
}
function scenario() {
  const state = { account: 'a', offline: false, blocked: false, gate: gate() };
  const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: async () => {
    const account = state.account;
    if (state.blocked) await state.gate.promise;
    return state.offline ? { network: true } : { statusCode: 200, data: { data: { id: account, nickname: '账号' + account.toUpperCase() } } };
  } });
  const api = defaultApi();
  api.getNotifications = async () => ({ data: { unread: state.account === 'a' ? 9 : 2 } });
  api.getImUnreadCount = async () => ({ data: { unread: state.account === 'a' ? 7 : 1 } });
  api.getMemberInfo = async () => ({ data: { currentLevel: state.account === 'a' ? 'gold' : 'normal' } });
  const page = pageFor(h, api);
  const switchToB = () => { replaceAccount(h, 'b'); state.account = 'b'; };
  return { state, h, page, switchToB };
}
const serviceLabel = page => page.data.menuGroups.flatMap(g => g.items).find(i => i.key === 'service').label;
const noOldData = page => {
  assert.equal(page.data.notificationsUnreadCount, 0); assert.equal(page.data.serviceUnreadCount, 0);
  assert.equal(page.data.showProfileSetupCard, false); assert.equal(serviceLabel(page), '在线客服');
};
(async () => {
  await check('BADGE-01 switch immediately clears both badges, completion card and premium menu', async () => {
    const s = scenario(); await s.page.onShow(); assert.equal(s.page.data.notificationsUnreadCount, 9);
    assert.equal(s.page.data.serviceUnreadCount, 7); assert.equal(serviceLabel(s.page), '专属客服');
    s.switchToB(); s.state.blocked = true; const pending = s.page.onShow();
    try { noOldData(s.page); assert.equal(s.page.data.hasLoaded, false);
      previews.push({ title: '切换账号后等待资料', data: structuredClone(s.page.data) });
    } finally { s.state.gate.resolve(); await pending; }
  });
  await check('BADGE-02 replacement profile network failure clears old data and loading label', async () => {
    const s = scenario(); await s.page.onShow(); s.switchToB(); s.state.offline = true; await s.page.onShow();
    noOldData(s.page); assert.equal(s.page.data.nickname, '微信用户');
    assert.equal(s.page.data.memberLevelLabel, '会员信息加载失败');
    previews.push({ title: '新账号资料加载失败', data: structuredClone(s.page.data) });
  });
  await check('BADGE-03 retry after failure loads only new account counts', async () => {
    const s = scenario(); await s.page.onShow(); s.switchToB(); s.state.offline = true; await s.page.onShow();
    s.state.offline = false; await s.page.onShow();
    assert.equal(s.page.data.nickname, '账号B'); assert.equal(s.page.data.notificationsUnreadCount, 2);
    assert.equal(s.page.data.serviceUnreadCount, 1); assert.equal(serviceLabel(s.page), '在线客服');
    previews.push({ title: '恢复网络后显示新账号数据', data: structuredClone(s.page.data) });
  });
  await check('BADGE-04 same-account silent refresh failure preserves its own last good data', async () => {
    const s = scenario(); await s.page.onShow(); s.state.offline = true; await s.page.onShow();
    assert.equal(s.page.data.nickname, '账号A'); assert.equal(s.page.data.notificationsUnreadCount, 9);
    assert.equal(s.page.data.serviceUnreadCount, 7); assert.equal(serviceLabel(s.page), '专属客服');
  });
  await check('BADGE-05 logout clears badges and premium menu', async () => {
    const s = scenario(); await s.page.onShow(); s.h.store.logout(); await s.page.onShow();
    noOldData(s.page); assert.equal(s.page.data.isLoggedIn, false); assert.equal(s.page.data.nickname, '点击登录');
  });
  await check('BADGE-06 hidden old request cannot restore cleared badges', async () => {
    const s = scenario(); await s.page.onShow(); s.state.blocked = true;
    const old = s.page.onShow(); await tick(); s.page.onHide(); s.switchToB(); s.state.blocked = false;
    await s.page.onShow(); s.state.gate.resolve(); await old;
    assert.equal(s.page.data.nickname, '账号B'); assert.equal(s.page.data.notificationsUnreadCount, 2);
    assert.equal(s.page.data.serviceUnreadCount, 1);
  });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ phase: 'development self-test; not independent regression', method: 'actual page/session/request modules; mocked WeChat/HTTP', results, previews }, null, 2));
  const miniRoot = path.join(__dirname, '../../mp-weixin-rewrite');
  const css = fs.readFileSync(path.join(miniRoot, 'pages/profile/index.wxss'), 'utf8').replace(/([\d.]+)rpx/g, (_, n) => Number(n) / 2 + 'px');
  const escape = v => String(v || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const icon = src => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(miniRoot, src)).toString('base64');
  const markup = previews.map(({ title, data }) => {
    const items = data.menuGroups.flatMap(g => g.items).filter(i => ['service', 'notifications'].includes(i.key));
    return `<section><h2>${escape(title)}</h2><div class="user-card"><div class="user-info"><span class="user-name">${escape(data.nickname)}</span><span class="user-level-tag">${escape(data.memberLevelLabel)}</span></div></div><div class="menu-list">${items.map(i => {
      const count = i.key === 'service' ? data.serviceUnreadCount : data.notificationsUnreadCount;
      return `<div class="menu-item"><img class="menu-icon" src="${icon(i.icon)}"><span class="menu-label">${escape(i.label)}</span>${count > 0 ? `<span class="menu-badge">${count}</span>` : ''}<span class="menu-arrow">›</span></div>`;
    }).join('')}</div></section>`;
  }).join('');
  fs.writeFileSync(path.join(out, 'preview.html'), `<!doctype html><meta charset="utf-8"><style>${css}*{box-sizing:border-box}body{margin:0;padding:16px;background:#f9fafb;font-family:Arial,"Microsoft Yahei",sans-serif}section{width:390px;margin-bottom:24px}h2{font-size:15px;font-weight:500}.user-card{margin-bottom:8px}</style>${markup}`);
  for (const r of results) console.log(`${r.result.toUpperCase()} ${r.name}${r.error ? ': ' + r.error : ''}`);
  process.exitCode = results.some(r => r.result === 'failed') ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
