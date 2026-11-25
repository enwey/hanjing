const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../../mp-weixin-rewrite');
function harness(behavior = {}) {
  let stack = ['/old/a', '/old/b'], errors = [], call;
  const wx = {
    switchTab: options => { call = options; if (behavior.switchFailure) return options.fail({errMsg:'switch failed'}); stack = [options.url]; options.success(); },
    navigateTo: options => { if (behavior.navigateFailure) return options.fail({errMsg:'navigate failed'}); stack.push(options.url); },
    showToast: options => errors.push(options.title),
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root,'common/utils/stack-navigation.js'),'utf8'), { module, wx });
  return { helper: module.exports, get stack(){return stack;}, errors, get call(){return call;} };
}
for (const target of ['/pages/appointment/success?id=123','/pages/appointment/booking/index?tab=mine','/pages/auth/privacy/index?a=1']) {
 test('safe back stack for '+target, () => { const h=harness(); h.helper.openFromHome(target); assert.deepEqual(h.stack,['/pages/index/index',target]); h.stack.pop(); assert.deepEqual(h.stack,['/pages/index/index']); });
}
test('navigation failures notify once and preserve a safe root when possible', () => {
  for (const mode of ['switchFailure','navigateFailure']) { const h=harness({[mode]:true}); h.helper.openFromHome('/pages/appointment/success?id=1'); assert.equal(h.errors.length,1); if(mode==='navigateFailure')assert.deepEqual(h.stack,['/pages/index/index']); }
});
test('both appointment success paths and record fallbacks use stack navigation', () => {
 const text=fs.readFileSync(path.join(root,'pages/appointment/confirm.js'),'utf8'); assert.equal((text.match(/openFromHome\('\/pages\/appointment\/success\?id='/g)||[]).length,2); assert.equal((text.match(/openFromHome\('\/pages\/appointment\/booking\/index\?tab=mine'/g)||[]).length,5); assert.doesNotMatch(text,/wx\.reLaunch\(/);
});
