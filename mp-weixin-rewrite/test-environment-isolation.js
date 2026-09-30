const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(version, initialOverride = '') {
  let override = initialOverride;
  const requests = [];
  const wx = { getAccountInfoSync: () => ({ miniProgram: { envVersion: version } }),
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
test('failed development POST is never sent to production', async () => {
  const x = load('develop');
  await assert.rejects(x.context.execute({ url: '/orders', method: 'POST' }, 'a.b.c'));
  assert.deepEqual(x.requests, ['http://127.0.0.1:5005/api/v1/orders']);
});
test('trial and release ignore saved debug overrides', () => {
  for (const version of ['trial', 'release']) {
    const x = load(version, 'local');
    x.env.setApiEnvOverride('local');
    assert.equal(x.env.getApiBaseUrl(), 'https://m.hanjinghealth.com/api/v1');
    assert.equal(x.env.getApiBaseUrls().length, 1);
  }
});
test('explicit development switch cannot reuse a cached previous origin', async () => {
  const x = load('develop');
  x.env.setApiEnvOverride('production');
  await assert.rejects(x.context.execute({ url: '/test', method: 'GET' }, ''));
  assert.deepEqual(x.requests, ['https://m.hanjinghealth.com/api/v1/test']);
});
