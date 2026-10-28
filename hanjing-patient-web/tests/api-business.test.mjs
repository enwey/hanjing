import test from 'node:test';
import assert from 'node:assert/strict';
import {date} from '../src/ui.js';
import {request,session} from '../src/api.js';
import {showLocalLogin} from '../src/local-login.js';
import {uploadPendingImage} from '../src/pending-interactions.js';
const data=new Map();
globalThis.sessionStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
globalThis.window=new EventTarget();
test('calendar dates stay stable and UTC timestamps use clinic timezone',()=>{
 assert.equal(date('2026-10-27T16:00:00.000Z'),'2026-10-28');
 assert.equal(date('2026-10-28'),'2026-10-28');
 assert.equal(date('2026-10-28T00:00:00+08:00'),'2026-10-28');
 assert.equal(date(null),'—');
});
test('local diagnostic entry requires explicit opt-in and local dev',()=>{
 assert.equal(showLocalLogin(true,''),false);assert.equal(showLocalLogin(true,'?localLogin=1'),true);assert.equal(showLocalLogin(false,'?localLogin=1'),false);
});
test('HTTP 200 business rejection preserves its failure status',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({code:400,message:'库存不足'}));
 await assert.rejects(request('/orders',{token:'old'}),e=>e.status===400&&e.message==='库存不足');
});
test('business 401 expires current session, stale 401 cannot clear new session',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({code:401,message:'请重新登录'}));
 session.save('new');await assert.rejects(request('/user/profile',{token:'old'}));assert.equal(session.token(),'new');
 await assert.rejects(request('/user/profile',{token:'new'}));assert.equal(session.token(),'');
});
test('upload uses raw image body and normal expiry handling',async()=>{
 const file=new File(['image'],'avatar.png',{type:'image/png'});session.save('upload-token');
 globalThis.fetch=async(path,opts)=>{assert.equal(path,'/api/v1/user/upload?ext=png');assert.equal(opts.body,file);assert.equal(opts.headers['Content-Type'],'application/octet-stream');return new Response(JSON.stringify({code:401,message:'登录已过期'}),{status:401})};
 await assert.rejects(uploadPendingImage(file,{token:'upload-token'}),e=>e.status===401);assert.equal(session.token(),'');
});
test('invalid upload response gives readable error',async()=>{
 globalThis.fetch=async()=>new Response('<html>Bad Gateway</html>',{status:502});
 await assert.rejects(uploadPendingImage(new File(['x'],'a.png',{type:'image/png'}),{token:''}),e=>e.message==='服务暂不可用，请稍后重试');
});
