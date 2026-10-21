// Isolated execution of current production functions; no HTTP or real DB writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
const results = [];
async function test(name, fn) {
  try { await fn(); results.push({name, status:'PASS'}); }
  catch (e) { results.push({name, status:'FAIL', actual:e.message}); }
}
function front(bind = async () => ({data:{status:'bound'}})) {
  const storage = new Map(); const calls = []; let app;
  const api = {bindDistribution(code) { calls.push(code); return bind(code); }};
  const wx = {getStorageSync:k=>storage.get(k), setStorageSync:(k,v)=>storage.set(k,v), removeStorageSync:k=>storage.delete(k)};
  const log = {init(){},report(){},reportNow(){}};
  const ctx = vm.createContext({wx, Page(){}, App:a=>app=a, console, require:p=>p.includes('mini-log')?log:api});
  vm.runInContext(read('mp-weixin-rewrite/app.js'), ctx);
  return {storage,calls,app,ctx,api,wx,log};
}
function backend({promoters=[{user_id:1,code:'A',status:'active'}], rows=[], failure=false}={}) {
  let handler; const writes=[];
  const get = async (sql, args) => {
    if (sql.includes('FROM users')) return {id:args[0]};
    if (sql.includes('FROM distributors')) return promoters.find(p=>p.code===args[0]);
    if (sql.includes('SELECT id')) return rows.find(r=>r.child===args[0]);
    if (sql.includes('SELECT parent_user_id')) {
      const r=rows.find(r=>r.child===args[0]&&r.level===1); return r && {parent_user_id:r.parent};
    }
    throw Error('Unexpected SQL '+sql);
  };
  const transaction=async fn=>{
    const before=JSON.stringify(rows); const statuses=promoters.map(p=>p.status);
    try { return await fn({execute:async(sql,args)=>{
      if (sql.startsWith('SELECT')) {
        const row = await get(sql, args);
        return [row ? [row] : []];
      }
      writes.push({sql,args});
      if(failure) throw Error('injected DB failure');
      if(sql.includes('INSERT')) {
        const level=sql.includes('?, ?, 1')?1:2;
        if(rows.some(r=>r.child===args[1]&&r.level===level)) throw Object.assign(Error('duplicate'),{code:'ER_DUP_ENTRY'});
        rows.push({id:rows.length+1,parent:args[0],child:args[1],level});
      } else if(sql.includes('UPDATE')) {
        const promoter=promoters.find(p=>p.user_id===args[0]);
        if (!sql.includes("AND status = 'pending'") || promoter.status === 'pending') promoter.status='active';
      }
      else throw Error('Unexpected write '+sql);
    }}); } catch(e) { rows.splice(0,rows.length,...JSON.parse(before)); promoters.forEach((p,i)=>p.status=statuses[i]); throw e; }
  };
  const src=read('hanjing-clinic-backend/routes/client.js');
  const start=src.indexOf("app.post('/api/v1/distribution/bind'");
  const end=src.indexOf('// 21b.',start);
  assert(start>=0&&end>start);
  vm.runInNewContext(src.slice(start,end), {app:{post:(p,a,h)=>handler=h},authenticateWxToken(){},get,transaction,console:{error(){}}});
  return {rows,promoters,writes,async call(code,id=2){const res={http:200,status(n){this.http=n;return this;},json(body){this.body=body;return this;}};await handler({body:{inviteCode:code},user:{id}},res);return res;}};
}
(async()=>{
  for(const [name,query,expected] of [
    ['direct',{inviteCode:' A '},'A'],['legacy',{invite_code:'A'},'A'],
    ['encoded scene',{scene:'inviteCode%3DA'},'A'],['bare scene',{scene:'A'},'A'],
    ['scene code alias',{scene:'code%3DA'},'A'],['no invite',{},'']]) {
    await test('parse '+name,()=>{const h=front();h.app.onShow({query});assert.equal(h.storage.get('pending_invite_code')||'',expected);assert.equal(h.calls.length,0);});
  }
  await test('malformed scene does not interrupt launch [BIND-01]',()=>{const h=front();assert.doesNotThrow(()=>h.app.onLaunch({query:{scene:'%ZZ'}}));});
  for(const status of ['bound','already_bound','ignored_self']) await test('terminal status '+status,async()=>{const h=front(async()=>({data:{status}}));h.storage.set('access_token','test');h.app.onShow({query:{inviteCode:'A'}});await tick();assert.equal(h.storage.has('pending_invite_code'),false);});
  for(const message of ['无效的邀请码','邀请码不能为空','network down']) await test('error '+message,async()=>{const h=front(async()=>{throw Error(message)});h.storage.set('access_token','test');h.app.onShow({query:{inviteCode:'A'}});await tick();assert.equal(h.storage.has('pending_invite_code'),message==='network down');});
  for(const source of ['app','session']) await test(source+' old invalid response preserves newer invite [BIND-02]',async()=>{
    let reject;const h=front(()=>new Promise((r,j)=>{reject=j}));h.storage.set('access_token','test');h.storage.set('pending_invite_code','OLD');
    let pending;
    if(source==='app') pending=vm.runInContext('tryBindPendingInvite()',h.ctx);
    else {const src=read('mp-weixin-rewrite/stores/session-store.js');const a=src.indexOf('async function bindPendingInviteCode()');const b=src.indexOf('const ACCOUNT_CACHE_KEYS',a);const ctx=vm.createContext({wx:h.wx,api:h.api});vm.runInContext(src.slice(a,b),ctx);pending=vm.runInContext('bindPendingInviteCode()',ctx);}
    h.storage.set('pending_invite_code','NEW');reject(Error('无效的邀请码'));await pending;
    assert.equal(h.storage.get('pending_invite_code'),'NEW');
  });
  await test('cold start single binding attempt [BIND-03]',async()=>{let resolve;const h=front(()=>new Promise(r=>{resolve=r}));h.storage.set('access_token','test');h.app.onLaunch({query:{inviteCode:'A'}});h.app.onShow({query:{inviteCode:'A'}});assert.equal(h.calls.length,1);});
  await test('distribution API forwards exact code',async()=>{let options;const ctx={wx:{getStorageSync:()=>''},module:{exports:{}},require:()=>({request:o=>options=o})};vm.runInNewContext(read('mp-weixin-rewrite/api/modules/distribution-api.js'),ctx);await ctx.module.exports.bindDistribution('A');assert.equal(options.data.inviteCode,'A');assert.equal(options.method,'POST');assert.equal(options.url,'/distribution/bind');});
  for(const [code,http] of [[undefined,400],['',400],['UNKNOWN',400]]) await test('backend invalid '+String(code),async()=>{const h=backend();const r=await h.call(code);assert.equal(r.http,http);assert.equal(h.writes.length,0);});
  await test('backend self ignored',async()=>{const h=backend();assert.equal((await h.call('A',1)).body.data.status,'ignored_self');assert.equal(h.writes.length,0);});
  await test('backend binds once and cannot reparent',async()=>{const h=backend({promoters:[{user_id:1,code:'A',status:'active'},{user_id:3,code:'B',status:'active'}]});assert.equal((await h.call('A')).body.data.status,'bound');assert.equal((await h.call('B')).body.data.status,'already_bound');assert.equal(h.rows.length,1);assert.equal(h.rows[0].parent,1);});
  await test('backend creates two levels',async()=>{const h=backend({rows:[{id:1,parent:3,child:1,level:1}]});await h.call('A');assert(h.rows.some(r=>r.parent===3&&r.child===2&&r.level===2));});
  await test('backend DB failure returns 500',async()=>{const h=backend({failure:true});assert.equal((await h.call('A')).http,500);assert.equal(h.rows.length,0);});
  await test('inactive promoter is not reactivated by invitee [BIND-04]',async()=>{const h=backend({promoters:[{user_id:1,code:'A',status:'inactive'}]});assert.equal((await h.call('A')).http,400);assert.equal(h.rows.length,0);assert.equal(h.promoters[0].status,'inactive');});
  await test('pending promoter activates on first invite [BIND-04]',async()=>{const h=backend({promoters:[{user_id:1,code:'A',status:'pending'}]});assert.equal((await h.call('A')).body.data.status,'bound');assert.equal(h.promoters[0].status,'active');});
  await test('ancestor cannot bind own descendant [BIND-05]',async()=>{const h=backend({rows:[{id:1,parent:2,child:1,level:1}]});const response=await h.call('A',2);assert.equal(response.http,400);assert.equal(response.body.reason,'INVITE_CYCLE');assert.equal(h.rows.length,1);assert.equal(h.rows.some(r=>r.parent===r.child),false,'created self level-2 relationship: '+JSON.stringify(h.rows));});
  await test('late upstream binding maintains level-2 relationship [BIND-RISK-01]',async()=>{const h=backend({promoters:[{user_id:1,code:'A',status:'active'},{user_id:3,code:'C',status:'active'}]});await h.call('A',2);await h.call('C',1);assert(h.rows.some(r=>r.parent===3&&r.child===2&&r.level===2),'C -> A -> B exists but C -> B level 2 missing');});
  console.log(JSON.stringify({scope:'Isolated production functions; mock wx/API/transaction, not real DB or device',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));
  process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
