const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(__dirname+'/../../mp-weixin-rewrite/'+p,'utf8');
const results=[];
function harness(){let p;const calls=[],toasts=[];vm.runInNewContext(read('pages/index/index.js'),{
 Page:o=>p=o,wx:{navigateTo:o=>calls.push(o),showToast:o=>toasts.push(o.title)},
 require:s=>s.includes('session-store')?{isLoggedIn:()=>false}:{}
});p.loadPage=async()=>{};return {p,calls,toasts};}
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
(async()=>{
 await test('HOME-05 guest navigation failure permits another login attempt',()=>{
  const h=harness();h.p.goMedicalRecords();h.calls[0].fail();h.p.goMedicalRecords();
  assert.equal(h.calls.length,2);assert.equal(h.toasts.length,1);assert.equal(h.calls[1].url,'/pages/auth/login?redirect='+encodeURIComponent('/pages/profile/medical-records/index'));
 });
 await test('HOME-05 returning onShow permits guest entry, unloading blocks it',async()=>{
  const h=harness();h.p.goMedicalRecords();await h.p.onShow();h.p.goMedicalRecords();assert.equal(h.calls.length,2);h.p.onUnload();h.p.goMedicalRecords();assert.equal(h.calls.length,2);
 });
 await test('HOME-07 actual template conditions distinguish pending empty failed and populated states',()=>{
  const wxml=read('pages/index/index.wxml');
  const conditions=[...wxml.matchAll(/<text[^>]*wx:if="{{([^}]+)}}"[^>]*>(暂无[^<]+)<\/text>/g)];
  assert.equal(conditions.length,2);
  for(const [label,patch,want] of [
   ['initial',{loading:true,hasLoaded:false},false],
   ['empty success',{},true],
   ['retry pending',{loading:true},false],
   ['both failed',{doctorsLoadFailed:true,storesLoadFailed:true},false],
   ['populated',{recommendedDoctors:[{id:1}],stores:[{id:1}]},false]
  ])for(const condition of conditions){
   const state={loading:false,hasLoaded:true,doctorsLoadFailed:false,storesLoadFailed:false,recommendedDoctors:[],stores:[],...patch};
   assert.equal(Boolean(vm.runInNewContext(condition[1],state)),want,label+' '+condition[2]);
  }
  const partial={loading:false,hasLoaded:true,doctorsLoadFailed:false,storesLoadFailed:true,recommendedDoctors:[],stores:[]};
  assert.equal(Boolean(vm.runInNewContext(conditions[0][1],partial)),true);
  assert.equal(Boolean(vm.runInNewContext(conditions[1][1],partial)),false);
 });
 console.log(JSON.stringify({total:results.length,passed:results.filter(r=>r.status==='PASS').length,results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
