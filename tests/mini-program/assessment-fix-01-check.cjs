const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/assessment.cjs','utf8'),box={require,__dirname,module:{exports:{}}};
vm.runInNewContext(source.slice(0,source.indexOf('\n(async()=>{'))+'\nmodule.exports={setup,backend,gate};',box);
const {setup,backend,gate}=box.module.exports,results=[];
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
(async()=>{
 await check('saved ESS retry only retries navigation',async()=>{let n=0;const h=setup('questionnaire/index',{submitESS:async()=>{n++;return {data:{id:'asmt-1'}};}});await h.p.loadPage();h.p.data.answers=Array(8).fill(1);await h.p.submitQuestionnaire();h.calls[0].fail();await h.p.submitQuestionnaire();assert.equal(n,1);assert.equal(h.calls.length,2);});
 await check('unauthorized session invalidation clears existing list',async()=>{const h=setup();await h.p.onShow();h.api.getAssessments=async()=>{h.setLogged(false);throw Object.assign(Error('unauthorized'),{statusCode:401});};await h.p.onShow();assert.equal(h.p.data.records.length,0);assert.equal(h.p.data.memberList.length,0);});
 await check('same logged state with new generation reloads family members',async()=>{const h=setup();await h.p.onShow();h.setLogged(true);h.api.getFamilyMembers=async()=>({data:[{id:'new-owner-member',relation:'self'}]});await h.p.onShow();assert.equal(h.p.data.selectedMemberId,'new-owner-member');});
 await check('cache fallback accepts only matching ESS owner',async()=>{const h=setup('result/index');h.storage.last_ess_assessment_result={id:'asmt-own',userId:'account-B',type:'ess',essScore:5};h.p.onLoad({});await h.p.onShow();assert.equal(h.p.data.resultDetail.id,'asmt-own');});
 await check('ESS all possible totals match list and result classification',async()=>{for(let score=0;score<=24;score++){let rest=score;const answers=Array.from({length:8},()=>{const n=Math.min(3,rest);rest-=n;return n;});const b=backend(),r=await b.call({patientId:1,answers});assert.equal(r.status,200);const list=setup('index',{getAssessments:async()=>({data:[r.payload.data]})}),detail=setup('result/index',{getAssessmentDetail:async()=>({data:r.payload.data})});await list.p.loadPage();detail.p.onLoad({id:r.payload.data.id});await detail.p.loadPage();assert.equal(list.p.data.records[0].levelLabel,detail.p.data.levelInfo.level,'score='+score);}});
 await check('unowned patient and invalid answers never issue INSERT',async()=>{for(const body of [{patientId:999,answers:Array(8).fill(0)},{patientId:1,answers:[]},{patientId:1,answers:Array(8).fill(1.5)}]){const b=backend();const r=await b.call(body);assert.ok([400,404].includes(r.status));assert.equal(b.writes.length,0);}});
 await check('sync flights coalesce and preserve other owners and new records',async()=>{
  const d=gate();let calls=0;const storage={pending_snore_uploads:[{localId:'old',ownerUserId:'A'},{localId:'foreign',ownerUserId:'B'}]};
  const mod={module:{exports:{}},wx:{getStorageSync:k=>storage[k],setStorageSync:(k,v)=>storage[k]=v},require:s=>s.includes('session-store')?{fetchProfile:async()=>({id:'A'}),getLoginGeneration:()=>1,isLoggedIn:()=>true}:{request:()=>{calls++;return d.promise;}}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/../../mp-weixin-rewrite/api/modules/assessment-api.js','utf8'),mod);
  const a=mod.module.exports.syncPendingSnoreRecordings(),b=mod.module.exports.syncPendingSnoreRecordings();await Promise.resolve();storage.pending_snore_uploads=storage.pending_snore_uploads.concat({localId:'new',ownerUserId:'A'});d.resolve({data:{id:'snore-1'}});await Promise.all([a,b]);assert.equal(calls,1);assert.equal(storage.pending_snore_uploads.length,2);assert.ok(storage.pending_snore_uploads.some(r=>r.localId==='new'));
 });
 await check('actual session cache archives ESS result on logout',()=>{
  const s=fs.readFileSync(__dirname+'/login-comprehensive.cjs','utf8'),b={require,__dirname,Buffer,structuredClone,queueMicrotask,setImmediate,module:{exports:{}}};
  vm.runInNewContext(s.slice(0,s.indexOf('const cases=[];'))+'\nmodule.exports={harness,token};',b);
  const h=b.module.exports.harness({storage:{access_token:b.module.exports.token('A'),last_ess_assessment_result:{userId:'A',id:'asmt-1'}}});
  h.store.clearLoginState();assert.equal(h.storage.has('last_ess_assessment_result'),false);assert.equal(h.storage.get('account_cache_archive')[0].values.last_ess_assessment_result.id,'asmt-1');
 });
 console.log(JSON.stringify({scope:'related developer checks only',total:results.length,passed:results.filter(x=>x.status==='PASS').length,results},null,2));process.exitCode=results.some(x=>x.status==='FAIL')?1:0;
})();
