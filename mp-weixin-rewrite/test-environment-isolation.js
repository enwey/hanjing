const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(version, initialOverride = '', platform = 'devtools') {
  let override = initialOverride;
  const requests = [];
  const wx = { getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }), getSystemInfoSync: () => ({ platform }),
    getStorageSync: () => override, setStorageSync: (key, value) => { override = value; }, removeStorageSync: () => { override = ''; },
    request(options) { requests.push(options.url); options.fail({ errMsg: 'fixture connection failure' }); } };
  const env = { module: { exports: {} }, wx };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'common/config/env.js'), 'utf8'), env);
  const context = { module: { exports: {} }, wx, require(name) {
    if (name.includes('config/env')) return env.module.exports;
    if (name.includes('mini-log')) return { createTraceId: () => 'fixture', report() {}, reportNow() {} };
    throw Error('Unexpected module');
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'api/request.js'), 'utf8') + '\nthis.execute=executeWxRequest;', context);
  return { env: env.module.exports, context, requests };
}
test('development preview defaults to the production API', async () => {
  const x = load('develop');
  await assert.rejects(x.context.execute({ url: '/orders', method: 'POST' }, 'a.b.c'));
  assert.deepEqual(x.requests, ['https://m.xingkangming.com/api/v1/orders']);
});
test('trial and release ignore saved debug overrides', () => {
  for (const version of ['trial', 'release']) {
    const x = load(version, 'local');
    x.env.setApiEnvOverride('local');
    assert.equal(x.env.getApiBaseUrl(), 'https://m.xingkangming.com/api/v1');
    assert.equal(x.env.getApiBaseUrls().length, 1);
  }
});
test('real-device preview ignores a cached local API override', async () => {
  for (const platform of ['ios', 'android']) {
    const x = load('develop', 'local', platform);
    await assert.rejects(x.context.execute({ url: '/stores', method: 'GET' }, ''));
    assert.deepEqual(x.requests, ['https://m.xingkangming.com/api/v1/stores']);
    assert.equal(x.env.canUseLocalApi, false);
  }
});
test('development tools can explicitly switch to the local API', async () => {
  const x = load('develop');
  x.env.setApiEnvOverride('local');
  await assert.rejects(x.context.execute({ url: '/test', method: 'GET' }, ''));
  assert.deepEqual(x.requests, ['http://127.0.0.1:5005/api/v1/test']);
});
