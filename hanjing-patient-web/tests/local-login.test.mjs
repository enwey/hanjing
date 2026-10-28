import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalMockLoginAvailable, localMockLogin } from '../src/local-login.js';
import { page } from '../src/pages.js';
import { session } from '../src/api.js';

test('mock login requires dev build and exact loopback host', () => {
  for (const host of ['localhost','127.0.0.1','[::1]']) assert.equal(isLocalMockLoginAvailable(true,host),true);
  for (const host of ['example.com','127.0.0.1.example.com','192.168.1.3','']) assert.equal(isLocalMockLoginAvailable(true,host),false);
  assert.equal(isLocalMockLoginAvailable(false,'localhost'),false);
});
test('disabled mock login cannot issue requests', async () => {
  let called=false;
  await assert.rejects(localMockLogin({enabled:false,post:()=>{called=true}}));
  assert.equal(called,false);
});
test('mock login saves real backend token with local mode', async () => {
  let saved;
  const ok=await localMockLogin({enabled:true,post:async(path)=>{assert.equal(path,'/auth/local-login');return {access_token:'backend-token'}},session:{save:(...v)=>saved=v}});
  assert.equal(ok,true);assert.deepEqual(saved,['backend-token',{local:true}]);
});
test('abandoned login response cannot restore session', async () => {
  let saved=false;
  assert.equal(await localMockLogin({enabled:true,isActive:()=>false,post:async()=>({access_token:'late'}),session:{save:()=>saved=true}}),false);
  assert.equal(saved,false);
});
test('failed or malformed response cannot set a session', async () => {
  let saved=false;
  for (const post of [async()=>({}),async()=>{throw new Error('network')}]) await assert.rejects(localMockLogin({enabled:true,post,session:{save:()=>saved=true}}));
  assert.equal(saved,false);
});
test('non-dev login page keeps password and WeChat, hides local entry', async () => {
  const html=await page({page:'login',params:new URLSearchParams()});
  assert.ok(html.includes('密码登录'));assert.ok(html.includes('微信扫码登录'));assert.ok(!html.includes('data-action="local-login"'));
});
test('local token is discarded outside local dev without changing normal tokens', () => {
  const map=new Map();globalThis.sessionStorage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  session.save('local',{local:true});assert.equal(session.token(),'');
  session.save('normal');assert.equal(session.token(),'normal');session.clear();assert.equal(session.token(),'');
});
