import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('mini referral captures cold/hot launch, latest valid code and expiry',()=>{
  const storage=new Map();let now=1000;
  const context={module:{exports:{}},Date:{now:()=>now},wx:{setStorageSync:(k,v)=>storage.set(k,v),getStorageSync:k=>storage.get(k),removeStorageSync:k=>storage.delete(k)}};
  vm.runInNewContext(readFileSync(new URL('../../mp-weixin-rewrite/common/utils/backend-referral.js',import.meta.url),'utf8'),context);
  const {capture,current,clear}=context.module.exports;
  const a='BP000000000000000000000001',b='BP000000000000000000000002';
  capture({query:{scene:encodeURIComponent('ref='+a)}});assert.equal(current(),a);
  capture({query:{scene:'bad-code'}});assert.equal(current(),a);
  capture({query:{ref:b}});assert.equal(current(),b);
  clear(a);assert.equal(current(),b);
  clear(b);assert.equal(current(),undefined);
  capture({query:{ref:b}});
  now+=7*24*60*60*1000;assert.equal(current(),undefined);

  // Comprehensive formats:
  const c='BP0f518191eccef4b8c94d82ae';
  // 1. Raw scene direct code
  capture({query:{scene:c}});assert.equal(current(),c);
  // 2. Query code
  clear();capture({query:{code:c}});assert.equal(current(),c);
  // 3. Query inviteCode
  clear();capture({query:{inviteCode:c}});assert.equal(current(),c);
  // 4. Page onLoad options (no .query)
  clear();capture({scene:'ref='+c});assert.equal(current(),c);
  clear();capture({scene:c});assert.equal(current(),c);
  clear();capture({ref:c});assert.equal(current(),c);
  clear();capture({code:c});assert.equal(current(),c);
  clear();capture({inviteCode:c});assert.equal(current(),c);
  // 5. Double URL encoded
  clear();capture({query:{scene:encodeURIComponent(encodeURIComponent('ref='+c))}});assert.equal(current(),c);
  // 6. Case insensitive
  clear();capture({ref:c.toUpperCase()});assert.equal(current(),c.toUpperCase());
});
