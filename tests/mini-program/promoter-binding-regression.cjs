// Additional independent boundary checks using the production-code isolation harness.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const harness = fs.readFileSync(path.join(__dirname, 'promoter-binding.cjs'), 'utf8').split('(async()=>{')[0];
const checks = `
function sessionBind(h) {
  const src=read('mp-weixin-rewrite/stores/session-store.js');
  const ctx=vm.createContext({wx:h.wx,api:h.api});
  vm.runInContext(src.slice(src.indexOf('async function bindPendingInviteCode()'),src.indexOf('const ACCOUNT_CACHE_KEYS')),ctx);
  return ()=>vm.runInContext('bindPendingInviteCode()',ctx);
}
(async()=>{
  for (const scene of ['%', '%E0%A4%A', '%FF']) await test('BIND-01 malformed '+scene,()=>{
    const h=front();let registered=false;h.wx.onNeedPrivacyAuthorization=()=>registered=true;
    h.app.onLaunch({query:{scene,inviteCode:'VALID'}});
    assert.equal(h.storage.get('pending_invite_code'),'VALID');assert(registered);
  });
  for (const source of ['app','session']) {
    for (const outcome of ['bound','already_bound','ignored_self','invalid','unavailable','cycle']) {
      await test('BIND-02 '+source+' stale '+outcome,async()=>{
        let resolve,reject;const h=front(()=>new Promise((r,j)=>{resolve=r;reject=j}));
        h.storage.set('access_token','account-A');h.storage.set('pending_invite_code','OLD');
        const pending=source==='app'?vm.runInContext('tryBindPendingInvite()',h.ctx):sessionBind(h)();
        h.storage.set('pending_invite_code','NEW');
        if(outcome==='invalid') reject(Error('无效的邀请码'));
        else if(outcome==='unavailable'||outcome==='cycle') reject(Object.assign(Error('rejected'),{data:{reason:outcome==='cycle'?'INVITE_CYCLE':'PROMOTER_UNAVAILABLE'}}));
        else resolve({data:{status:outcome}});
        await pending;assert.equal(h.storage.get('pending_invite_code'),'NEW');
      });
    }
    await test('BIND-02 '+source+' changed account same code',async()=>{
      let resolve;const h=front(()=>new Promise(r=>resolve=r));h.storage.set('access_token','account-A');h.storage.set('pending_invite_code','SAME');
      const pending=source==='app'?vm.runInContext('tryBindPendingInvite()',h.ctx):sessionBind(h)();
      h.storage.set('access_token','account-B');resolve({data:{status:'bound'}});await pending;
      assert.equal(h.storage.get('pending_invite_code'),'SAME');
    });
    for(const response of [undefined,null,{}, {code:0,data:{}},{data:{status:'unexpected'}}]) await test('BIND-02 '+source+' ambiguous response '+JSON.stringify(response),async()=>{
      const h=front(async()=>response);h.storage.set('access_token','account');h.storage.set('pending_invite_code','A');
      await (source==='app'?vm.runInContext('tryBindPendingInvite()',h.ctx):sessionBind(h)());
      assert.equal(h.storage.get('pending_invite_code'),'A');
    });
    for(const reason of ['PROMOTER_UNAVAILABLE','INVITE_CYCLE']) await test(source+' current terminal '+reason,async()=>{
      const h=front(async()=>{throw Object.assign(Error('rejected'),{data:{reason}})});h.storage.set('access_token','account');h.storage.set('pending_invite_code','A');
      await (source==='app'?vm.runInContext('tryBindPendingInvite()',h.ctx):sessionBind(h)());assert.equal(h.storage.has('pending_invite_code'),false);
    });
  }
  await test('BIND-03 twenty onShow deduplicated then retry after network failure',async()=>{
    let reject;const h=front(()=>new Promise((r,j)=>reject=j));h.storage.set('access_token','account');
    for(let i=0;i<20;i++)h.app.onShow({query:{inviteCode:'A'}});
    assert.equal(h.calls.length,1);reject(Error('network'));await tick();
    h.app.onShow({query:{}});assert.equal(h.calls.length,2);reject(Error('network'));await tick();
  });
  for(const status of ['inactive','disabled','frozen','rejected'])await test('BIND-04 rejects '+status,async()=>{
    const h=backend({promoters:[{user_id:1,code:'A',status}]});const r=await h.call('A');
    assert.equal(r.http,400);assert.equal(r.body.reason,'PROMOTER_UNAVAILABLE');assert.equal(h.writes.length,0);assert.equal(h.promoters[0].status,status);
  });
  await test('BIND-05 mixed id type self invite',async()=>{const h=backend();assert.equal((await h.call('A','1')).body.data.status,'ignored_self');assert.equal(h.writes.length,0);});
  for(const rows of [
    [{id:1,parent:3,child:1,level:1},{id:2,parent:2,child:3,level:1}],
    [{id:1,parent:3,child:1,level:1},{id:2,parent:1,child:3,level:1}],
    [{id:1,parent:1,child:1,level:1}]
  ])await test('BIND-05 rejects longer or pre-existing cycle '+JSON.stringify(rows),async()=>{
    const h=backend({rows});const count=rows.length;const r=await h.call('A',2);assert.equal(r.http,400);assert.equal(r.body.reason,'INVITE_CYCLE');assert.equal(h.rows.length,count);assert.equal(h.writes.length,0);
  });
  for(const code of [null,{},[],123,'   '])await test('backend invalid type '+JSON.stringify(code),async()=>{const h=backend();assert.equal((await h.call(code)).http,400);assert.equal(h.writes.length,0);});
  // Exercise the modified summary activation block, without invoking QR generation.
  for(const status of ['inactive','disabled','pending','active'])await test('BIND-04 summary activation '+status,async()=>{
    const src=read('hanjing-clinic-backend/routes/client.js').replace(/\\r\\n/g,'\\n');const a=src.indexOf("  if (directTeamCount > 0 && distributor.status");const b=src.indexOf('\\n\\n  return {',a);
    assert(a>=0&&b>a);const distributor={id:1,status};let writes=0;
    await vm.runInNewContext('(async()=>{'+src.slice(a,b)+'})()', {directTeamCount:1,distributor,run:async()=>{writes++;return {changes:1}}});
    assert.equal(writes,status==='pending'?1:0);assert.equal(distributor.status,status==='pending'?'active':status);
  });
  console.log(JSON.stringify({scope:'Boundary regression; mocked wx/API/DB, no real device or database locks',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));
  process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
`;
vm.runInNewContext(harness + checks, {require,__dirname,console,process,setImmediate,Buffer}, {filename:__filename});
