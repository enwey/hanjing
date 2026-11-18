const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../mp-weixin-rewrite');
const token = id => 'e30.' + Buffer.from(JSON.stringify({ id, exp: 2100000000 })).toString('base64url') + '.test';
const A = 'BPa1'.padEnd(26, 'a');
const B = 'BPb2'.padEnd(26, 'b');
const mini = 'HJ0001ABCDEF';
const nextMini = 'HJ0002ABCDEF';
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(initialUser, now = Date.now()) {
  const storage = new Map(initialUser ? [['access_token', token(initialUser)], ['auth_mode', 'wechat']] : []);
  const wire = [];
  const diagnostics = { init() {}, report() {}, reportNow() {}, createTraceId: () => 'invite-regression' };
  let session, app, loginAs;
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    base64ToArrayBuffer: value => Uint8Array.from(Buffer.from(value, 'base64')).buffer,
    login: ({ success }) => success({ code: 'fixture-' + loginAs }),
    request(req) {
      const endpoint = new URL(req.url).pathname.replace('/api/v1', '');
      if (endpoint === '/auth/wx-login') {
        req.success({ statusCode: 200, data: { access_token: token(loginAs), user: { id: loginAs } } });
        return;
      }
      const record = {
        endpoint,
        authorization: req.header.Authorization,
        body: req.data,
        reply: (statusCode, data) => req.success({ statusCode, data }),
        timeout: () => req.fail({ errMsg: 'request:fail timeout' }),
      };
      wire.push(record);
    },
  };
  function load(file, deps = {}, hooks = {}) {
    const context = {
      module: { exports: {} }, wx, Date: { now: () => now }, ...hooks,
      require(name) {
        if (!(name in deps)) throw new Error('Missing dependency ' + name + ' in ' + file);
        return deps[name]();
      },
    };
    vm.runInNewContext(readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    return context.module.exports;
  }
  const referral = load('common/utils/backend-referral.js');
  const assets = load('common/config/asset-url.js');
  const origin = 'https://fixture.invalid/api/v1';
  const request = load('api/request.js', {
    '../common/config/asset-url': () => assets,
    '../common/config/env': () => ({ getApiBaseUrl: () => origin, getApiBaseUrls: () => [origin] }),
    '../common/utils/mini-log': () => diagnostics,
    '../stores/session-store': () => session,
  });
  const env = { '../request': () => request };
  const distribution = load('api/modules/distribution-api.js', env);
  const auth = load('api/modules/auth-api.js', env);
  const appointments = load('api/modules/appointment-api.js', { ...env, '../../common/utils/backend-referral': () => referral });
  const api = { ...auth, ...distribution };
  session = load('stores/session-store.js', {
    '../api/index': () => api, '../common/utils/mini-log': () => diagnostics,
    '../common/utils/backend-referral': () => referral, './patient-context-store': () => ({}),
  });
  load('app.js', {
    './api/index': () => api, './common/utils/backend-referral': () => referral,
    './common/utils/mini-log': () => diagnostics,
  }, { App: config => { app = config; }, Page() {} });
  return {
    app, storage, session,
    scan: (scene, cold = false) => app[cold ? 'onLaunch' : 'onShow']({ query: { scene } }),
    login(id) { loginAs = id; return session.login('test-phone-code'); },
    binds: () => wire.filter(req => req.endpoint === '/distribution/bind'),
    lastAppointment: () => wire.filter(req => req.endpoint === '/appointments').at(-1),
    book: () => appointments.createAppointment({ patientId: 301 }),
    async appointmentCode(user) {
      const pending = this.book();
      const req = this.lastAppointment();
      assert.equal(req.authorization, 'Bearer ' + token(user));
      req.reply(200, { code: 0 });
      await pending;
      return req.body.referralCode;
    },
  };
}

const cases = [];
const test = (group, name, run) => cases.push({ group, name, run });
const account = 'INV-1118-03', route = 'INV-1118-01', parse = 'INV-1118-02';

test(account, '退出后新账号预约不携带旧后台码', async () => {
  const f = fixture(1);
  f.scan('ref=' + A);
  assert.equal(await f.appointmentCode(1), A);
  f.session.logout();
  await f.login(2);
  assert.equal(await f.appointmentCode(2), undefined);
});
test(account, '普通邀请绑定超时后退出，后续登录不会用新账号重试', async () => {
  const f = fixture(1);
  f.scan(mini);
  await tick();
  assert.equal(f.binds()[0].authorization, 'Bearer ' + token(1));
  f.binds()[0].timeout();
  await tick();
  f.session.logout();
  const login = f.login(2);
  await tick();
  for (const req of f.binds().slice(1)) req.reply(200, { status: 'bound' });
  await login;
  assert.equal(f.binds().length, 1);
});
test(account, '不经退出直接切换账号，两个旧码均不可见', async () => {
  const f = fixture(1);
  f.scan('ref=' + A);
  f.scan(mini);
  await tick();
  const login = f.login(2);
  await tick();
  for (const req of f.binds()) req.reply(200, { status: 'bound' });
  await login;
  assert.equal(f.binds().length, 1);
  assert.equal(await f.appointmentCode(2), undefined);
});
test(account, '退出后重新登录同一账号也不继承已清除的旧后台码', async () => {
  const f = fixture(1);
  f.scan('ref=' + A);
  f.session.logout();
  await f.login(1);
  assert.equal(await f.appointmentCode(1), undefined);
});
test(account, '旧普通绑定迟到成功不清除新账号重新扫入的同一码', async () => {
  const f = fixture(1);
  f.scan(mini);
  await tick();
  f.session.logout();
  f.scan(mini);
  const login = f.login(2);
  await tick();
  const [old, current] = f.binds();
  assert.equal(current.authorization, 'Bearer ' + token(2));
  old.reply(200, { status: 'bound' });
  await tick();
  assert.equal(f.storage.get('pending_invite_code'), mini);
  current.reply(200, { status: 'bound' });
  await login;
  assert.equal(f.storage.get('pending_invite_code'), undefined);
});
for (const [description, rescanned] of [['不同码', B], ['同一码', A]]) {
  test(account, '旧预约的真实格式无效码响应不清除新账号重扫的' + description, async () => {
    const f = fixture(1);
    f.scan('ref=' + A);
    const original = f.book();
    const old = f.lastAppointment();
    assert.equal(old.authorization, 'Bearer ' + token(1));
    assert.equal(old.body.referralCode, A);
    f.session.logout();
    await f.login(2);
    f.scan('ref=' + rescanned);
    old.reply(400, { code: 400, message: '推广码已失效，请重新提交预约或重新扫码', referralInvalid: true });
    await assert.rejects(original, { statusCode: 400 });
    assert.equal(await f.appointmentCode(2), rescanned);
  });
}
test(account, '首次登录消费游客普通码，同时保留游客扫入的后台码', async () => {
  const f = fixture();
  f.scan(mini, true);
  f.scan('ref=' + A);
  const login = f.login(1);
  await tick();
  assert.equal(f.binds().length, 1);
  assert.equal(f.binds()[0].body.inviteCode, mini);
  f.binds()[0].reply(200, { status: 'bound' });
  await login;
  assert.equal(await f.appointmentCode(1), A);
});
test(account, '退出前排队但尚未派发的普通绑定不会发送', async () => {
  const f = fixture(1);
  f.scan(mini);
  f.session.logout();
  await f.login(2);
  assert.equal(f.binds().length, 0);
});

for (const [name, query] of [
  ['正式 ref', { scene: 'ref=' + A }], ['裸码', { scene: A }],
  ['scene code', { scene: 'code=' + A }], ['scene inviteCode', { scene: 'inviteCode=' + A }],
  ['query invite_code', { invite_code: A }], ['双重编码完整场景', { scene: encodeURIComponent(encodeURIComponent('inviteCode=' + A)) }],
]) {
  test(route, name + '兼容入口只进入预约请求', async () => {
    const f = fixture(1);
    f.app.onLaunch({ query });
    f.app.onShow({ query });
    await tick();
    assert.equal(await f.appointmentCode(1), A);
    assert.deepEqual(f.binds().map(req => req.body.inviteCode), [], '实际普通绑定载荷');
  });
}
test(route, '后台裸码不覆盖访客已有普通邀请码', async () => {
  const f = fixture();
  f.scan(nextMini);
  f.scan(A);
  const login = f.login(2);
  await tick();
  const calls = f.binds();
  for (const req of calls) req.reply(200, { status: 'bound' });
  await login;
  assert.deepEqual(calls.map(req => req.body.inviteCode), [nextMini]);
  assert.equal(await f.appointmentCode(2), A);
});
test(route, '双重编码的后台场景不覆盖访客已有普通邀请码', async () => {
  const f = fixture();
  f.scan(nextMini);
  f.scan(encodeURIComponent(encodeURIComponent('inviteCode=' + A)));
  const login = f.login(2);
  await tick();
  const calls = f.binds();
  for (const req of calls) req.reply(200, { status: 'bound' });
  await login;
  assert.equal(await f.appointmentCode(2), A);
  assert.deepEqual(calls.map(req => req.body.inviteCode), [nextMini]);
});
test(route, '旧版本误写的待绑后台码在登录后无普通请求', async () => {
  const f = fixture();
  f.storage.set('pending_invite_code', A);
  const login = f.login(1);
  await tick();
  const calls = f.binds();
  for (const req of calls) req.reply(200, { status: 'bound' });
  await login;
  assert.equal(calls.length, 0);
  assert.equal(f.storage.get('pending_invite_code'), undefined);
});

for (const [name, scene] of [
  ['前后缀', 'ref=prefix' + B + 'suffix'], ['额外十六进制字符', 'ref=' + B + '0'],
  ['内部换行', 'ref=' + B.slice(0, 12) + '\n' + B.slice(12)], ['未知字段', 'other=' + B],
  ['字段值编码分隔符', 'other=' + encodeURIComponent('value&ref=' + B)], ['非法百分号', 'ref=%FF' + B],
  ['编码的附加字段', 'ref=' + B + encodeURIComponent('&extra=1')],
]) {
  test(parse, name + '不会覆盖预约请求中的原推荐码', async () => {
    const f = fixture(1);
    f.scan('ref=' + A);
    f.scan(scene);
    assert.equal(await f.appointmentCode(1), A);
  });
}
test(parse, '合法新码与其他独立参数可以共存并覆盖旧码', async () => {
  const f = fixture(1);
  f.scan('ref=' + A);
  f.scan('other=%FF&ref=' + B);
  assert.equal(await f.appointmentCode(1), B);
});

if (process.argv.includes('--round2-selftest')) {
  test(account, '同一毫秒内同账号重扫同一码，旧预约无效响应只影响原扫描', async () => {
    const f = fixture(1);
    f.scan('ref=' + A);
    const submitted = f.book();
    const old = f.lastAppointment();
    const expiry = f.storage.get('backend_referral').expiresAt;
    f.scan('ref=' + A);
    assert.equal(f.storage.get('backend_referral').expiresAt, expiry);
    old.reply(400, { code: 400, referralInvalid: true });
    await assert.rejects(submitted, { statusCode: 400 });
    assert.equal(await f.appointmentCode(1), A);
  });
  test(account, '旧版缓存没有扫描版本，被原请求提交且未重扫时仍可清除', async () => {
    const f = fixture(1);
    f.storage.set('backend_referral', { code: A, expiresAt: Date.now() + 86400000 });
    const submitted = f.book();
    const old = f.lastAppointment();
    assert.equal(old.body.referralCode, A);
    old.reply(400, { code: 400, referralInvalid: true });
    await assert.rejects(submitted, { statusCode: 400 });
    assert.equal(await f.appointmentCode(1), undefined);
  });
  test(route, '三重编码场景内的独立普通码与后台码分别送往正确入口', async () => {
    const f = fixture(1);
    const scene = 'ref=' + A + '&inviteCode=' + nextMini;
    f.scan(encodeURIComponent(encodeURIComponent(encodeURIComponent(scene))));
    await tick();
    assert.deepEqual(f.binds().map(req => req.body.inviteCode), [nextMini]);
    f.binds()[0].reply(200, { status: 'bound' });
    assert.equal(await f.appointmentCode(1), A);
  });
  test(route, '历史误存的部分解码后台场景在登录时不会发出普通绑定', async () => {
    const f = fixture();
    f.storage.set('pending_invite_code', encodeURIComponent('inviteCode=' + A));
    const login = f.login(1);
    await tick();
    for (const req of f.binds()) req.reply(200, { status: 'bound' });
    await login;
    assert.equal(f.binds().length, 0);
    assert.equal(f.storage.get('pending_invite_code'), undefined);
  });
}

if (process.argv.includes('--round2-regression')) {
  test(account, '新账号先提交同一码，旧账号失败只保留新扫描，新账号自己的失败仍清除', async () => {
    const f = fixture(1);
    f.scan('ref=' + A);
    const oldBooking = f.book();
    const oldRequest = f.lastAppointment();
    f.session.logout();
    await f.login(2);
    f.scan('ref=' + A);
    const newBooking = f.book();
    const newRequest = f.lastAppointment();
    assert.equal(newRequest.authorization, 'Bearer ' + token(2));
    const invalid = { code: 400, message: '推广码已失效', referralInvalid: true };
    oldRequest.reply(400, { ...invalid });
    await assert.rejects(oldBooking, { statusCode: 400 });
    assert.equal(await f.appointmentCode(2), A);
    newRequest.reply(400, { ...invalid });
    await assert.rejects(newBooking, { statusCode: 400 });
    assert.equal(await f.appointmentCode(2), undefined);
  });
  test(account, '旧版无版本缓存的请求迟到时保留同一毫秒重新扫码的记录', async () => {
    const now = Date.now();
    const f = fixture(1, now);
    const expiresAt = now + 7 * 86400000;
    f.storage.set('backend_referral', { code: A, expiresAt });
    const booking = f.book();
    const oldRequest = f.lastAppointment();
    assert.equal(oldRequest.body.referralCode, A);
    f.session.logout();
    await f.login(2);
    f.scan('ref=' + A);
    assert.equal(f.storage.get('backend_referral').expiresAt, expiresAt);
    oldRequest.reply(400, { code: 400, referralInvalid: true });
    await assert.rejects(booking, { statusCode: 400 });
    assert.equal(await f.appointmentCode(2), A);
  });
  test(route, '双重编码场景中独立普通码和后台码各发送到对应接口', async () => {
    const f = fixture(2);
    const scene = encodeURIComponent(encodeURIComponent('code=' + A + '&invite_code=' + nextMini));
    f.scan(scene, true);
    f.scan(scene);
    await tick();
    assert.deepEqual(f.binds().map(req => req.body.inviteCode), [nextMini]);
    assert.equal(f.binds()[0].authorization, 'Bearer ' + token(2));
    f.binds()[0].reply(200, { status: 'bound' });
    assert.equal(await f.appointmentCode(2), A);
  });
  test(route, '只有双重编码的普通码仍可绑定且不会创建后台来源', async () => {
    const f = fixture(2);
    f.scan(encodeURIComponent(encodeURIComponent('inviteCode=' + nextMini)));
    await tick();
    assert.deepEqual(f.binds().map(req => req.body.inviteCode), [nextMini]);
    f.binds()[0].reply(200, { status: 'bound' });
    assert.equal(await f.appointmentCode(2), undefined);
  });
}

(async () => {
  const results = [];
  for (const { group, name, run } of cases) {
    try {
      await run();
      results.push({ group, name, result: 'PASS' });
    } catch (error) {
      results.push({ group, name, result: error instanceof assert.AssertionError ? 'FAIL' : 'ERROR', actual: error.message });
    }
  }
  const passed = results.filter(item => item.result === 'PASS').length;
  console.log(JSON.stringify({ total: cases.length, passed, failed: cases.length - passed, results }, null, 2));
  if (passed !== cases.length) process.exitCode = 1;
})();
