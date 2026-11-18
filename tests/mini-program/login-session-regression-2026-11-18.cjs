// Independent regression execution. Product files are read-only; WeChat/HTTP are simulated.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const out = path.join(__dirname, 'artifacts/login-session-regression-2026-11-18');
fs.mkdirSync(out, { recursive: true });
const miniRoot = path.join(__dirname, '../../mp-weixin-rewrite');
const files = ['stores/session-store.js', 'api/request.js', 'pages/profile/index.js'];
const hashes = () => Object.fromEntries(files.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(miniRoot, f))).digest('hex')]));
const before = hashes();
const startedAt = new Date().toISOString();
const suite = path.join(__dirname, 'login-comprehensive.cjs');
const fixture = { exports: {} };
vm.runInNewContext(fs.readFileSync(suite, 'utf8').split('const cases=[];')[0] + '\nmodule.exports={harness,token,gate,tick};', {
  module: fixture, require: createRequire(suite), __dirname, Buffer, console,
  structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { harness, token, gate, tick } = fixture.exports;
function pageFor(h, api) {
  let page;
  vm.runInNewContext(fs.readFileSync(path.join(miniRoot, 'pages/profile/index.js'), 'utf8'), {
    require: p => p.includes('session-store') ? h.store : p.includes('api/index') ? api : p.includes('image-url') ? { normalizeImageUrl: x => x || '' } : {},
    Page: p => { page = p; p.data = structuredClone(p.data); p.setData = d => Object.assign(p.data, d); },
    console, wx: {},
  });
  return page;
}
const defaultApi = () => ({ getMemberInfo: async () => ({}), getMemberLevels: async () => ({}), getNotifications: async () => ({}), getImUnreadCount: async () => ({}) });
const results = [];
async function check(id, fn) {
  try { await fn(); results.push({ id, result: 'passed' }); }
  catch (e) { results.push({ id, result: 'failed', error: e.message, observations: e.observations }); }
  console.log(`${results.at(-1).result.toUpperCase()} ${id}`);
}
function replaceAccount(h, id) {
  h.store.logout(); h.store.switchAccount(id); h.store.setAccessToken(token(id)); h.store.setAuthMode('wechat');
}
(async () => {
  // Replay all original reproduction and fix checks, saving separate evidence.
  const selftest = path.join(__dirname, 'login-session-2026-11-18.cjs');
  const state = { exitCode: 0 };
  await vm.runInNewContext(fs.readFileSync(selftest, 'utf8').replace('artifacts/login-session-fix-selftest-2026-11-18', 'artifacts/login-session-regression-2026-11-18/replayed'), {
    require: createRequire(selftest), __dirname, Buffer, console, process: state,
    structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
  });
  const replayed = JSON.parse(fs.readFileSync(path.join(out, 'replayed/results.json'), 'utf8')).results;
  await check('REG-01 original 13 scenarios', () => { assert.equal(replayed.length, 13); assert.equal(state.exitCode, 0); });
  await check('REG-02 30 simultaneous requests share expired-session renewal', async () => {
    const expired = `e30.${Buffer.from(JSON.stringify({ id: 'a', exp: 1 })).toString('base64url')}.signature`;
    const h = harness({ storage: { access_token: expired, auth_mode: 'wechat' }, response: async o => {
      if (o.url.includes('/auth/')) { await tick(); return { statusCode: 200, data: { data: { access_token: token('a') } } }; }
      return o.header.Authorization === 'Bearer ' + expired ? { statusCode: 401, data: {} } : { statusCode: 200, data: { data: { id: 'a' } } };
    } });
    const profiles = await Promise.all(Array.from({ length: 30 }, () => h.store.fetchProfile()));
    assert.ok(profiles.every(p => p.id === 'a')); assert.equal(h.authCalls().length, 1);
  });
  for (const status of [401, 403]) await check(`REG-03 explicit ${status} rejection clears current session`, async () => {
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: o => ({ statusCode: o.url.includes('/auth/') ? status : 401, data: {} }) });
    await assert.rejects(h.request.request({ url: '/user/profile' }));
    assert.equal(h.store.isLoggedIn(), false); assert.equal(h.store.getAuthMode(), '');
  });
  await check('REG-04 late rejected renewal cannot clear replacement account', async () => {
    const g = gate();
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: async o => {
      if (o.url.includes('/auth/')) await g.promise;
      return { statusCode: 401, data: {} };
    } });
    const pending = h.request.request({ url: '/user/profile' }).catch(() => {});
    await tick(); replaceAccount(h, 'b'); g.resolve(); await pending;
    assert.equal(h.store.getAccessToken(), token('b')); assert.equal(h.store.getAuthMode(), 'wechat');
  });
  await check('REG-05 logout while renewal pending prevents session resurrection', async () => {
    const g = gate();
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: async o => {
      if (o.url.includes('/auth/')) { await g.promise; return { statusCode: 200, data: { data: { access_token: token('a') } } }; }
      return { statusCode: 401, data: {} };
    } });
    const pending = h.request.request({ url: '/user/profile' }).catch(() => {});
    await tick(); h.store.logout(); g.resolve(); await pending;
    assert.equal(h.store.isLoggedIn(), false); assert.equal(h.store.getAuthMode(), '');
  });
  await check('REG-06 later page load wins within the same account', async () => {
    const g = gate(); let count = 0, members = 0;
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: () => ({ statusCode: 200, data: { data: { id: 'a', nickname: ++count === 1 ? 'Old name' : 'New name' } } }) });
    const api = defaultApi(); api.getMemberInfo = () => ++members === 1 ? g.promise : Promise.resolve({});
    const page = pageFor(h, api); const old = page.onShow(); await tick(); await page.onShow();
    assert.equal(page.data.nickname, 'New name'); g.resolve({}); await old;
    assert.equal(page.data.nickname, 'New name');
  });
  await check('REG-07 unloaded page ignores pending aggregate results', async () => {
    const g = gate(); const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' } });
    const api = defaultApi(); api.getMemberInfo = () => g.promise;
    const page = pageFor(h, api); const pending = page.onShow(); await tick(); page.onUnload();
    const snapshot = JSON.stringify(page.data); g.resolve({}); await pending;
    assert.equal(JSON.stringify(page.data), snapshot);
  });
  await check('REG-08 account replacement must clear previous unread counts immediately', async () => {
    let account = 'a'; const g = gate();
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: async () => {
      if (account === 'b') await g.promise;
      return { statusCode: 200, data: { data: { id: account, nickname: account } } };
    } });
    const api = defaultApi(); api.getNotifications = async () => ({ data: { unread: account === 'a' ? 9 : 0 } });
    api.getImUnreadCount = async () => ({ data: { unread: account === 'a' ? 7 : 0 } });
    const page = pageFor(h, api); await page.onShow();
    assert.equal(page.data.notificationsUnreadCount, 9); assert.equal(page.data.serviceUnreadCount, 7);
    replaceAccount(h, 'b'); account = 'b'; const pending = page.onShow();
    try { assert.equal(page.data.notificationsUnreadCount, 0, 'A notification unread count remains visible while loading B');
      assert.equal(page.data.serviceUnreadCount, 0, 'A service unread count remains visible while loading B');
    } catch (e) {
      e.observations = { activeAccount: account, nickname: page.data.nickname,
        notificationsUnreadCount: page.data.notificationsUnreadCount, serviceUnreadCount: page.data.serviceUnreadCount };
      throw e;
    } finally { g.resolve(); await pending; }
  });
  await check('REG-09 failed replacement profile must not retain old account badges', async () => {
    let account = 'a';
    const h = harness({ storage: { access_token: token('a'), auth_mode: 'wechat' }, response: () => account === 'b' ? { network: true } : { statusCode: 200, data: { data: { id: 'a', nickname: 'A' } } } });
    const api = defaultApi(); api.getNotifications = async () => ({ data: { unread: account === 'a' ? 9 : 0 } });
    const page = pageFor(h, api); await page.onShow(); replaceAccount(h, 'b'); account = 'b'; await page.onShow();
    try { assert.equal(page.data.notificationsUnreadCount, 0, 'A badge survives B profile failure'); }
    catch (e) { e.observations = { activeAccount: account, nickname: page.data.nickname,
      notificationsUnreadCount: page.data.notificationsUnreadCount, hasLoaded: page.data.hasLoaded }; throw e; }
  });
  const after = hashes(); const stable = JSON.stringify(before) === JSON.stringify(after);
  const evidence = { startedAt, finishedAt: new Date().toISOString(), method: 'actual client modules; mocked WeChat/HTTP and controlled timing', sourceBefore: before, sourceAfter: after, sourceStable: stable,
    replayedPassed: replayed.filter(r => r.result === 'passed').length, results,
    passed: results.filter(r => r.result === 'passed').length, failed: results.filter(r => r.result === 'failed').length };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ replayed: replayed.length, passed: evidence.passed, failed: evidence.failed, sourceStable: stable }));
  process.exitCode = evidence.failed || !stable ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
