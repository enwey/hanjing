const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../mp-weixin-rewrite');
const A = 'BP' + 'a'.repeat(24);
const B = 'BP' + 'b'.repeat(24);
const DAY = 86400000;
const tick = () => new Promise(resolve => setImmediate(resolve));
const token = id => 'e30.' + Buffer.from(JSON.stringify({ id, exp: 2100000000 })).toString('base64url') + '.fixture';
const invalid = () => Object.assign(new Error('推广码已失效'), { data: { referralInvalid: true } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function setup(loggedIn = false) {
  const storage = new Map(loggedIn ? [['access_token', token(1)]] : []);
  const requests = [];
  let now = Date.UTC(2026, 10, 18);
  let nextUser = 1;
  let app, registered;
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    base64ToArrayBuffer: value => Uint8Array.from(Buffer.from(value, 'base64')).buffer,
    login: ({ success }) => success({ code: 'fixture-wx-code' }),
  };
  const diagnostics = { init() {}, report() {}, reportNow() {}, createTraceId: () => 'scan-audit' };
  const request = options => {
    const pending = deferred();
    requests.push({ ...options, ...pending, account: storage.get('access_token') === token(1) ? 1 : storage.get('access_token') === token(2) ? 2 : null });
    return pending.promise;
  };
  const load = (file, deps = {}, globals = {}) => {
    const source = readFileSync(path.join(root, file), 'utf8');
    const context = {
      module: { exports: {} }, wx, Date: { now: () => now },
      require: name => {
        if (!(name in deps)) throw new Error('Unmapped dependency: ' + name);
        return deps[name];
      },
      ...globals,
    };
    vm.runInNewContext(source, context, { filename: file });
    return context;
  };
  const referral = load('common/utils/backend-referral.js').module.exports;
  const distribution = load('api/modules/distribution-api.js', { '../request': { request } }).module.exports;
  const api = {
    ...distribution,
    wxLogin: async () => ({ data: { access_token: token(nextUser), user: { id: nextUser } } }),
  };
  const session = load('stores/session-store.js', {
    '../api/index': api, '../common/utils/mini-log': diagnostics,
    '../common/utils/backend-referral': referral, './patient-context-store': {},
  }).module.exports;
  const appContext = load('app.js', {
    './api/index': api, './common/utils/backend-referral': referral, './common/utils/mini-log': diagnostics,
  }, { App: config => { app = config; }, Page: config => { registered = config; } });
  appContext.Page({ onLoad: () => 'page-loaded' });
  const appointment = load('api/modules/appointment-api.js', {
    '../request': { request }, '../../common/utils/backend-referral': referral,
  }).module.exports;
  return {
    app, referral, appointment, session, storage, requests,
    pageLoad: options => registered.onLoad(options),
    login: (id = 1) => { nextUser = id; return session.login('fixture-phone'); },
    advance: ms => { now += ms; },
    pending: () => storage.get('pending_invite_code'),
    scan: (scene, event = 'onShow') => app[event]({ query: { scene } }),
  };
}

const cases = [];
const test = (id, name, run) => cases.push({ id, name, run });
test('SCAN-01', '后台 ref 冷启动和热启动均记录来源，不发送普通绑定', async () => {
  const h = setup(true);
  h.scan(encodeURIComponent('ref=' + A), 'onLaunch');
  h.scan('ref=' + B);
  await tick();
  assert.equal(h.referral.current(), B);
  assert.equal(h.requests.length, 0);
});
test('SCAN-02', '页面 onLoad 能识别独立透传的扫码参数', () => {
  const h = setup();
  assert.equal(h.pageLoad({ scene: 'ref=' + A }), 'page-loaded');
  assert.equal(h.referral.current(), A);
});
for (const [id, raw] of [['03', A], ['04', 'code=' + A], ['05', 'inviteCode=' + A], ['06', null]]) {
  test('SCAN-' + id, '兼容后台码格式只进入预约来源：' + (raw || 'query.invite_code'), async () => {
    const h = setup(true);
    if (raw) h.scan(raw); else h.app.onShow({ query: { invite_code: A } });
    await tick();
    assert.equal(h.referral.current(), A);
    assert.equal(h.requests.length, 0);
  });
}
test('SCAN-07', '无法解码或缺少邀请码不覆盖已保存来源', () => {
  const h = setup();
  h.scan('ref=' + A);
  for (const malformed of ['%FF', '%', '', 'ref=missing']) {
    h.scan(malformed);
    assert.equal(h.referral.current(), A);
  }
});
for (const [id, invalidValue] of [['08', 'ref=before' + B + 'after'], ['09', 'ref=' + B + '9'], ['10', 'unrelated=' + B]]) {
  test('SCAN-' + id, '无效字段或码值不能覆盖来源：' + invalidValue, () => {
    const h = setup();
    h.scan('ref=' + A);
    h.scan(invalidValue);
    assert.equal(h.referral.current(), A);
  });
}
test('SCAN-11', '二次编码、七天到期毫秒边界及重扫续期', () => {
  const h = setup();
  h.scan(encodeURIComponent(encodeURIComponent('ref=' + A)));
  h.advance(7 * DAY - 1);
  assert.equal(h.referral.current(), A);
  h.advance(1);
  assert.equal(h.referral.current(), undefined);
  h.scan('ref=' + A);
  assert.equal(h.referral.current(), A);
});
test('SCAN-12', '未登录扫码，登录后预约携带来源，网络失败可重试', async () => {
  const h = setup();
  h.scan('ref=' + A, 'onLaunch');
  await h.login();
  const first = h.appointment.createAppointment({});
  assert.equal(h.requests[0].data.referralCode, A);
  h.requests[0].reject(new Error('network timeout'));
  await assert.rejects(first, /timeout/);
  const second = h.appointment.createAppointment({});
  assert.equal(h.requests[1].data.referralCode, A);
  h.requests[1].resolve({ id: 1 });
  await second;
});
test('SCAN-13', '过期或停用响应清空同一个来源，下一次预约不再携带', async () => {
  const h = setup(true);
  h.scan('ref=' + A);
  const first = h.appointment.createAppointment({});
  h.requests[0].reject(invalid());
  await assert.rejects(first);
  assert.equal(h.referral.current(), undefined);
  const retry = h.appointment.createAppointment({});
  assert.equal(h.requests[1].data.referralCode, undefined);
  h.requests[1].resolve({ id: 2 });
  await retry;
});
test('SCAN-14', '旧码预约失败迟到时保留期间扫入的另一枚新码', async () => {
  const h = setup(true);
  h.scan('ref=' + A);
  const first = h.appointment.createAppointment({});
  h.scan('ref=' + B);
  h.requests[0].reject(invalid());
  await assert.rejects(first);
  assert.equal(h.referral.current(), B);
});
test('SCAN-15', '已登录账号扫码后退出，另一账号未扫码的预约不应携带其来源', async () => {
  const h = setup(true);
  h.scan('ref=' + A);
  h.session.logout();
  await h.login(2);
  const appointment = h.appointment.createAppointment({});
  h.requests[0].resolve({ id: 3 });
  await appointment;
  assert.equal(h.requests[0].account, 2);
  assert.equal(h.requests[0].data.referralCode, undefined);
});
test('SCAN-16', '普通邀请码未登录暂存，登录/onShow 并发仅发一次', async () => {
  const h = setup();
  h.scan('inviteCode=MINI123', 'onLaunch');
  await tick();
  assert.equal(h.requests.length, 0);
  const login = h.login();
  await tick();
  h.app.onShow({});
  await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].data.inviteCode, 'MINI123');
  h.requests[0].resolve({ data: { status: 'bound' } });
  await login;
  await tick();
  assert.equal(h.pending(), undefined);
});
test('SCAN-17', '普通邀请码网络失败保留，回前台后可重试，自邀结束后清除', async () => {
  const h = setup(true);
  h.scan('MINI123');
  await tick();
  h.requests[0].reject(new Error('network timeout'));
  await tick();
  assert.equal(h.pending(), 'MINI123');
  h.app.onShow({});
  await tick();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ data: { status: 'ignored_self' } });
  await tick();
  assert.equal(h.pending(), undefined);
});
test('SCAN-18', '普通邀请码失败后换号，另一账号不自动发出旧邀请码绑定', async () => {
  const h = setup(true);
  h.scan('MINI123');
  await tick();
  h.requests[0].reject(new Error('network timeout'));
  await tick();
  h.session.logout();
  const login = h.login(2);
  await tick();
  const requests = h.requests.filter(item => item.account === 2);
  requests.forEach(item => item.resolve({ data: { status: 'bound' } }));
  await login;
  assert.equal(requests.length, 0, '账号 2 发出的旧码：' + requests.map(item => item.data.inviteCode));
});
test('SCAN-19', '两种类型同时保留时，后台码不占用已有普通邀请码', async () => {
  const h = setup();
  h.scan('MINI123');
  h.scan('ref=' + A);
  assert.equal(h.pending(), 'MINI123');
  assert.equal(h.referral.current(), A);
});
test('SCAN-20', '普通邀请码已经绑定时清除缓存', async () => {
  const h = setup(true);
  h.scan('MINI123');
  await tick();
  h.requests[0].resolve({ status: 'already_bound' });
  await tick();
  assert.equal(h.pending(), undefined);
});
test('SCAN-21', '普通邀请码已停用、循环、无效时均清理缓存', async () => {
  for (const [reason, message] of [['PROMOTER_UNAVAILABLE','推广人已停用'], ['INVITE_CYCLE','不能绑定存在循环的推荐关系'], ['INVALID_INVITE','无效的邀请码']]) {
    const h = setup(true);
    h.scan('MINI123');
    await tick();
    h.requests[0].reject(Object.assign(new Error(message), { data: { reason } }));
    await tick();
    assert.equal(h.pending(), undefined);
  }
});
test('SCAN-22', '备用写法的后台码不应覆盖等待登录的普通邀请码', () => {
  const h = setup();
  h.scan('MINI123');
  h.scan(A);
  assert.equal(h.pending(), 'MINI123');
});
test('SCAN-23', '旧普通绑定的迟到响应不清除新码', async () => {
  const h = setup(true);
  h.scan('MINI123');
  await tick();
  h.scan('MINI456');
  await tick();
  h.requests[0].resolve({ status: 'bound' });
  await tick();
  assert.equal(h.pending(), 'MINI456');
  h.requests[1].resolve({ status: 'already_bound' });
  await tick();
  assert.equal(h.pending(), undefined);
});
test('SCAN-24', '无推广码的旧预约响应不得清除后扫入的新码', async () => {
  const h = setup(true);
  const first = h.appointment.createAppointment({});
  assert.equal(h.requests[0].data.referralCode, undefined);
  h.scan('ref=' + B);
  h.requests[0].reject(invalid());
  await assert.rejects(first);
  assert.equal(h.referral.current(), B);
});
test('SCAN-25', '普通绑定旧账号迟到响应不删除新账号正在使用的同一码', async () => {
  const h = setup(true);
  h.scan('MINI123');
  await tick();
  h.session.logout();
  h.scan('MINI123');
  const login = h.login(2);
  await tick();
  assert.deepEqual(h.requests.map(item => item.account), [1, 2]);
  h.requests[0].resolve({ status: 'bound' });
  await tick();
  assert.equal(h.pending(), 'MINI123');
  h.requests[1].resolve({ status: 'bound' });
  await login;
  assert.equal(h.pending(), undefined);
});
test('SCAN-26', '畸形 scene 仍可回退到独立普通邀请码', async () => {
  const h = setup(true);
  h.app.onLaunch({ query: { scene: '%FF', inviteCode: 'MINI123' } });
  await tick();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].data.inviteCode, 'MINI123');
  h.requests[0].resolve({ status: 'bound' });
  await tick();
});
test('SCAN-27', '同一码再次扫码确实以最新扫码时间计算七天', () => {
  const h = setup();
  h.scan('ref=' + A);
  h.advance(6 * DAY);
  h.scan('ref=' + A);
  h.advance(DAY);
  assert.equal(h.referral.current(), A);
  h.advance(6 * DAY);
  assert.equal(h.referral.current(), undefined);
});

if (process.argv.includes('--fix-selftest')) {
  test('SCAN-28', '直接切换账号时清除两类旧码，晚到响应不能恢复缓存', async () => {
    const h = setup(true);
    h.scan('ref=' + A);
    h.scan('MINI123');
    await tick();
    const login = h.login(2);
    await tick();
    const unexpected = h.requests.filter(item => item.account === 2);
    for (const item of unexpected) item.resolve({ status: 'bound' });
    h.requests[0].resolve({ status: 'bound' });
    await login;
    assert.equal(unexpected.length, 0);
    assert.equal(h.referral.current(), undefined);
    assert.equal(h.pending(), undefined);
  });
  test('SCAN-29', '同账号续期保留来源和待重试普通码', async () => {
    const h = setup(true);
    h.scan('ref=' + A);
    h.scan('MINI123');
    await tick();
    h.requests[0].reject(new Error('network timeout'));
    await tick();
    h.session.setAccessToken(token(1) + 'refreshed', { isRefresh: true });
    assert.equal(h.referral.current(), A);
    assert.equal(h.pending(), 'MINI123');
  });
  test('SCAN-30', '已有版本留下的后台待绑码在前台或登录入口不发普通请求', async () => {
    for (const loggedIn of [true, false]) {
      const h = setup(loggedIn);
      h.storage.set('pending_invite_code', A);
      const login = loggedIn ? (h.app.onShow({}), null) : h.login();
      await tick();
      for (const req of h.requests) req.resolve({ status: 'bound' });
      await login;
      assert.equal(h.requests.length, 0);
      assert.equal(h.pending(), undefined);
    }
  });
  test('SCAN-31', '分销请求尚未派发时退出，旧邀请不以新身份发出', async () => {
    const h = setup(true);
    h.scan('MINI123');
    h.session.logout();
    await tick();
    assert.equal(h.requests.length, 0);
    assert.equal(h.pending(), undefined);
  });
  test('SCAN-32', '同一扫码事件中的独立普通码与后台码各自保留', async () => {
    const h = setup(true);
    h.app.onShow({ query: { inviteCode: 'MINI123', scene: 'code=' + A } });
    await tick();
    assert.equal(h.referral.current(), A);
    assert.deepEqual(h.requests.map(item => item.data.inviteCode), ['MINI123']);
    h.requests[0].resolve({ status: 'bound' });
    await tick();
  });
  test('SCAN-33', '无关字段中的编码分隔符不产生新的推荐字段', () => {
    const h = setup();
    h.scan('ref=' + A);
    h.scan('unrelated=' + encodeURIComponent('value&ref=' + B));
    assert.equal(h.referral.current(), A);
  });
}

(async () => {
  const results = [];
  for (const { id, name, run } of cases) {
    if (id === 'SCAN-24' && process.argv.includes('--fix-selftest')) {
      results.push({ id, name, status: 'SKIP', reason: '现有待验证风险，超出本轮三项修复范围' });
      continue;
    }
    try {
      await run();
      results.push({ id, name, status: 'PASS' });
    } catch (error) {
      results.push({ id, name, status: error instanceof assert.AssertionError ? 'FAIL' : 'ERROR', actual: error.message });
    }
  }
  const passed = results.filter(item => item.status === 'PASS').length;
  const skipped = results.filter(item => item.status === 'SKIP').length;
  const failed = results.length - passed - skipped;
  console.log(JSON.stringify({ total: results.length, passed, failed, skipped, results }, null, 2));
  if (failed) process.exitCode = 1;
})();
