const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const harness=fs.readFileSync(path.join(__dirname,'promoter-binding.cjs'),'utf8').split('(async()=>{')[0];
const checks=`
function admin({rows=[],status='active',failUpdate=false,access=true,failStatement=0}={}) {
  let handler;const promoter={user_id:1,status};const writes=[];
  const src=read('hanjing-clinic-backend/routes/admin.js');
  const start=src.indexOf("app.post('/api/admin/patients/:id/bind-promoter'");
  const end=src.indexOf('// Create billing order',start);assert(start>=0&&end>start);
  const execute=async(sql,args)=>{
    if(sql.startsWith('SELECT')) {
      let value;
      if(sql.includes('FROM patients'))value={user_id:2};
      else if(sql.includes('FROM users'))value={id:args[0]};
      else if(sql.includes('FROM distributors'))value=promoter;
      else if(sql.includes('FROM distribution_relationships')) {
        const row=rows.find(r=>r.child===args[0]&&r.level===1);
        value=row&&{id:row.id,parent_user_id:row.parent};
      } else throw Error('Unexpected SQL '+sql);
      return [value?[value]:[]];
    }
    writes.push(sql);
    if (failStatement && writes.length === failStatement) throw Error('injected statement failure');
    if(sql.startsWith('DELETE FROM distribution_relationships')) {
      for(let i=rows.length-1;i>=0;i--)if(rows[i].child===args[0]&&[1,2].includes(rows[i].level))rows.splice(i,1);
    } else if(sql.startsWith('INSERT INTO distribution_relationships'))rows.push({id:rows.length+1,parent:args[0],child:args[1],level:sql.includes('?, ?, 1')?1:2});
    else if(sql.startsWith('UPDATE distributors')) {if(failUpdate)throw Error('injected storage error');if(promoter.status==='pending')promoter.status='active';}
    else throw Error('Unexpected SQL '+sql);
    return [{affectedRows:1}];
  };
  vm.runInNewContext(src.slice(start,end),{
    app:{post:(p,a,h)=>handler=h},authenticateToken(){},verifyPatientAccess:async()=>access,
    transaction:async fn=>{
      const before=JSON.stringify(rows);const oldStatus=promoter.status;
      try{return await fn({execute});}catch(e){rows.splice(0,rows.length,...JSON.parse(before));promoter.status=oldStatus;throw e;}
    },
    get:async(sql,args)=>{
      if(sql.includes('FROM patients'))return {user_id:2};
      if(sql.includes('FROM distributors'))return promoter;
      if(sql.includes('FROM distribution_relationships'))return rows.find(r=>r.child===args[0]);
      throw Error('Unexpected SQL '+sql);
    },
    run:async(sql,args)=>{
      writes.push(sql);
      if(sql.startsWith('UPDATE distributors')) {if(failUpdate)throw Error('injected storage error');promoter.status='active';}
      else if(sql.startsWith('UPDATE distribution_relationships'))rows.filter(r=>r.child===args[1]).forEach(r=>r.parent=args[0]);
      else if(sql.startsWith('INSERT INTO distribution_relationships'))rows.push({id:rows.length+1,parent:args[0],child:args[1],level:1});
      else throw Error('Unexpected SQL '+sql);
      return {changes:1};
    },logAdminAction:async()=>{},console:{error(){}}
  });
  return {rows,promoter,writes,async call(){const res={http:200,status(n){this.http=n;return this},json(b){this.body=b;return this}};await handler({params:{id:20},body:{promoter_user_id:1},user:{id:9}},res);return res;}};
}
(async()=>{
  await test('admin denies unauthorized patient access',async()=>{const h=admin({access:false});assert.equal((await h.call()).http,403);assert.equal(h.writes.length,0);});
  await test('admin first direct bind',async()=>{const h=admin();assert.equal((await h.call()).http,200);assert.equal(h.rows[0].parent,1);});
  await test('BIND-04 admin must not reactivate inactive promoter',async()=>{const h=admin({status:'inactive'});assert.equal((await h.call()).http,400);assert.equal(h.promoter.status,'inactive');assert.equal(h.rows.length,0);assert.equal(h.writes.length,0);});
  await test('BIND-05 admin must reject descendant binding',async()=>{const h=admin({rows:[{id:1,parent:2,child:1,level:1}]});assert.equal((await h.call()).http,400);assert.equal(h.rows.some(r=>r.parent===1&&r.child===2),false);assert.equal(h.writes.length,0);});
  await test('BIND-06 admin rebind must not assign same parent to both levels',async()=>{
    const h=admin({rows:[{id:1,parent:3,child:2,level:1},{id:2,parent:4,child:2,level:2},{id:3,parent:5,child:1,level:1}]});assert.equal((await h.call()).http,200);
    assert.equal(h.rows.find(r=>r.child===2&&r.level===1).parent,1);
    assert.equal(h.rows.find(r=>r.child===2&&r.level===2).parent,5);
  });
  await test('BIND-07 failed admin bind must not leave committed relationship',async()=>{
    const h=admin({status:'pending',failUpdate:true});const response=await h.call();assert.equal(response.http,500);assert.equal(h.rows.length,0,'HTTP 500 but relationship persists: '+JSON.stringify(h.rows));
  });
  await test('BIND-03 app and login completion must not submit same invite twice',async()=>{
    const h=front(async()=>({data:{status:'bound'}}));h.storage.set('access_token','account');h.storage.set('pending_invite_code','A');
    const apiContext={wx:h.wx,module:{exports:{}},require:()=>({request:async options=>{h.calls.push(options.data.inviteCode);return {data:{status:'bound'}}}})};
    vm.runInNewContext(read('mp-weixin-rewrite/api/modules/distribution-api.js'),apiContext);
    h.api.bindDistribution=apiContext.module.exports.bindDistribution;
    const src=read('mp-weixin-rewrite/stores/session-store.js');const ctx=vm.createContext({wx:h.wx,api:h.api});
    vm.runInContext(src.slice(src.indexOf('async function bindPendingInviteCode()'),src.indexOf('const ACCOUNT_CACHE_KEYS')),ctx);
    const loginBind=vm.runInContext('bindPendingInviteCode()',ctx);
    h.app.onShow({query:{inviteCode:'A'}});await loginBind;await tick();assert.equal(h.calls.length,1);
  });
  await test('BIND-06 rebind to root removes obsolete level two',async()=>{
    const h=admin({rows:[{id:1,parent:3,child:2,level:1},{id:2,parent:4,child:2,level:2}]});assert.equal((await h.call()).http,200);
    assert.equal(h.rows.length,1);assert.equal(h.rows[0].parent,1);assert.equal(h.rows[0].level,1);
  });
  await test('BIND-07 failed rebind restores both old levels',async()=>{
    const rows=[{id:1,parent:3,child:2,level:1},{id:2,parent:4,child:2,level:2}];const before=JSON.stringify(rows);
    const h=admin({rows,status:'pending',failUpdate:true});assert.equal((await h.call()).http,500);assert.equal(JSON.stringify(rows),before);assert.equal(h.promoter.status,'pending');
  });
  await test('BIND-03 rejected shared flight releases for retry',async()=>{
    let calls=0;const ctx={wx:{getStorageSync:()=> 'account'},module:{exports:{}},require:()=>({request:async()=>{calls++;throw Error('network');}})};
    vm.runInNewContext(read('mp-weixin-rewrite/api/modules/distribution-api.js'),ctx);const bind=ctx.module.exports.bindDistribution;
    const first=bind('A');assert.equal(first,bind('A'));await assert.rejects(first);await assert.rejects(bind('A'));assert.equal(calls,2);
  });
  for(const failStatement of [1,2,3,4])await test('BIND-07 rebind rollback at write '+failStatement,async()=>{
    const rows=[{id:1,parent:3,child:2,level:1},{id:2,parent:4,child:2,level:2},{id:3,parent:5,child:1,level:1}];const before=JSON.stringify(rows);
    const h=admin({rows,status:'pending',failStatement});assert.equal((await h.call()).http,500);assert.equal(JSON.stringify(rows),before);assert.equal(h.promoter.status,'pending');
  });
  for(const status of ['disabled','frozen','rejected'])await test('BIND-04 admin rejects '+status,async()=>{const h=admin({status});assert.equal((await h.call()).http,400);assert.equal(h.writes.length,0);assert.equal(h.promoter.status,status);});
  await test('BIND-05 admin rejects three-user cycle',async()=>{
    const rows=[{id:1,parent:3,child:1,level:1},{id:2,parent:2,child:3,level:1}];const h=admin({rows});assert.equal((await h.call()).http,400);assert.equal(h.writes.length,0);
  });
  await test('BIND-03 distinct account does not reuse old flight',async()=>{
    let token='account-A',calls=0;const releases=[];const ctx={wx:{getStorageSync:()=>token},module:{exports:{}},require:()=>({request:()=>{calls++;return new Promise(r=>releases.push(r));}})};
    vm.runInNewContext(read('mp-weixin-rewrite/api/modules/distribution-api.js'),ctx);const bind=ctx.module.exports.bindDistribution;
    const first=bind('A');await tick();token='account-B';const second=bind('A');await tick();assert.notEqual(first,second);assert.equal(calls,2);releases.forEach(r=>r({data:{status:'bound'}}));await Promise.all([first,second]);
  });
  console.log(JSON.stringify({scope:'Actual admin route and mini-program functions, mocked SQL/wx/API; no real writes',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));
  process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
`;
vm.runInNewContext(harness+checks,{require,__dirname,console,process,setImmediate,Buffer},{filename:__filename});
