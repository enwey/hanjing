// Independent, read-only regression execution against current working tree.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const out=path.join(__dirname,'artifacts/appointment-regression-2026-11-18');fs.mkdirSync(out,{recursive:true});
const root=path.join(__dirname,'../../mp-weixin-rewrite');
const files=['pages/appointment/booking/index.js','pages/appointment/confirm.js','pages/appointment/detail.js','stores/session-store.js','api/request.js','common/utils/subscribe.js'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
const evidence={startedAt:new Date().toISOString(),phase:'independent limited regression',method:'actual client modules; simulated WeChat/HTTP/storage/timing',sourceBefore:hashes(),suites:[],boundaries:[]};
const runtime=file=>({require:createRequire(path.join(__dirname,file)),__dirname,__filename:path.join(__dirname,file),Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout});
async function run(file,replacements=[]){
  let source=fs.readFileSync(path.join(__dirname,file),'utf8');for(const [a,b]of replacements)source=source.replaceAll(a,b);
  const state={exitCode:0,env:process.env},logs=[],print=(...args)=>logs.push(args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' '));
  await vm.runInNewContext(source,{...runtime(file),module:{exports:{}},process:state,console:{log:print,error:print,warn:print}},{filename:file});
  fs.writeFileSync(path.join(out,file+'.log'),logs.join('\n')+'\n');evidence.suites.push({file,exitCode:state.exitCode});
  console.log(`${state.exitCode?'FAIL':'PASS'} ${file}`);
  return logs.join('\n');
}
async function check(id,fn){try{await fn();evidence.boundaries.push({id,result:'passed'});}catch(e){evidence.boundaries.push({id,result:'failed',error:e.message,observations:e.observations});}console.log(`${evidence.boundaries.at(-1).result.toUpperCase()} ${id}`);}
(async()=>{
  const base=JSON.parse(await run('appointment.cjs'));
  const boundary=JSON.parse(await run('appointment-regression.cjs'));
  await run('appointment-fix-selftest-2026-11-18.cjs',[[
    'artifacts/appointment-fix-selftest-2026-11-18','artifacts/appointment-regression-2026-11-18/replayed',
  ]]);
  const auditFile='appointment-audit-2026-11-18.cjs';
  const prefix=fs.readFileSync(path.join(__dirname,auditFile),'utf8').split('(async()=>{')[0].replaceAll('artifacts/appointment-audit-2026-11-18','artifacts/appointment-regression-2026-11-18/helpers');
  const fixture={exports:{}};vm.runInNewContext(prefix+'\nmodule.exports={create,loadPage,confirmApi,gate,tick,token,members};',{...runtime(auditFile),module:fixture});
  const {create,loadPage,confirmApi,gate,tick,token,members}=fixture.exports;
  const logged=()=>create({response:()=>({statusCode:200,data:{data:members}})});
  const swap=h=>{h.store.logout();h.store.switchAccount('b');h.store.setAccessToken(token('b'));h.store.setAuthMode('wechat');};
  await check('REG-APT-01 stale detail failure cannot replace latest success',async()=>{
    const h=logged(),a=gate(),b=gate();let calls=0;
    const s=loadPage('detail.js',h,{getBookingSettings:async()=>({}),getAppointmentDetail:()=>++calls===1?a.promise:b.promise});s.page.options={id:'apt'};
    const old=s.page.loadPage(),fresh=s.page.loadPage();
    b.resolve({data:{appointment:{patientName:'当前患者',status:'cancelled'},doctor:{},store:{}}});await fresh;
    // Resolve an invalid old payload, exercising old response handling without unhandled rejection.
    a.resolve(null);await old;assert.equal(s.page.data.statusKey,'cancelled');assert.equal(s.page.data.loadError,'');
  });
  await check('REG-APT-02 unloaded detail never renders completed response',async()=>{
    const h=logged(),g=gate();const s=loadPage('detail.js',h,{getBookingSettings:async()=>({}),getAppointmentDetail:()=>g.promise});s.page.options={id:'apt'};
    const pending=s.page.loadPage();await tick();s.page.onUnload();g.resolve({data:{appointment:{patientName:'旧患者'},doctor:{},store:{}}});await pending;
    assert.equal(s.page.data.appointmentLoaded,false);
  });
  await check('REG-APT-03 delayed pay-API response after account switch cannot navigate or clear new draft',async()=>{
    const h=logged(),api=confirmApi(h),g=gate();api.createAppointment=async()=>({data:{id:'old',status:'pending_payment'}});api.payAppointmentDeposit=()=>g.promise;
    const s=loadPage('confirm.js',h,api);await s.page.loadPage();await s.page.submitAppointment();const pending=s.modals[0].success({confirm:true});await tick();swap(h);
    s.draftStore.setDraft({doctorId:'new'});h.storage.set('pending_appointment_assessment',{id:'new-assessment'});g.resolve({data:{timeStamp:'fixture'}});await pending;
    assert.equal(s.nav.length,0);assert.equal(s.draftStore.getDraft().doctorId,'new');assert.equal(h.storage.get('pending_appointment_assessment').id,'new-assessment');
  });
  await check('REG-APT-04 same-token new login cannot receive old booking list',async()=>{
    const h=logged(),g=gate();const s=loadPage('booking/index.js',h,{getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),getAppointments:()=>g.promise});
    const pending=s.page.loadPage();await tick();h.store.setAccessToken(token('a'));g.resolve({data:[{id:'old',status:'pending'}]});await pending;
    assert.equal(s.page.data.upcomingAppointments.length,0);
  });
  await check('REG-APT-05 replacement-account confirmation hides old patient choices before response',async()=>{
    const h=logged(),api=confirmApi(h),g=gate();const s=loadPage('confirm.js',h,api);await s.page.loadPage();
    assert.equal(s.page.data.memberList.length,2);s.page.handleMemberChange({detail:{value:1}});swap(h);
    api.getFamilyMembers=()=>g.promise;const pending=s.page.loadPage({silent:true});
    try{assert.equal(s.page.data.memberList.length,0,'previous account patient choices remain visible during replacement load');}
    catch(e){e.observations={activeAccount:'b',memberCount:s.page.data.memberList.length,selectedMemberName:s.page.data.selectedMemberName,hasLoaded:s.page.data.hasLoaded};throw e;}
    finally{g.resolve({data:[]});await pending;}
  });
  await check('REG-APT-06 replacement-account load failure cannot retain old patient choices',async()=>{
    const h=logged(),api=confirmApi(h);const s=loadPage('confirm.js',h,api);await s.page.loadPage();s.page.handleMemberChange({detail:{value:1}});swap(h);
    api.getFamilyMembers=()=>Promise.reject(Error('fixture network failure'));await s.page.loadPage({silent:true});
    try{assert.equal(s.page.data.memberList.length,0,'previous account patient choices survive replacement-account load failure');}
    catch(e){e.observations={activeAccount:'b',memberCount:s.page.data.memberList.length,selectedMemberName:s.page.data.selectedMemberName,loadError:s.page.data.loadError,hasLoaded:s.page.data.hasLoaded};throw e;}
  });
  const replay=JSON.parse(fs.readFileSync(path.join(out,'replayed/results.json'),'utf8'));
  const audit=JSON.parse(fs.readFileSync(path.join(out,'replayed/original/results.json'),'utf8'));
  const all=[...audit.results,...replay.observations,...evidence.boundaries];
  evidence.total=base.total+boundary.total+all.length;
  evidence.passed=base.passed+boundary.passed+all.filter(x=>x.result==='passed').length;
  evidence.failed=base.failed+boundary.failed+all.filter(x=>x.result==='failed').length;
  evidence.sourceAfter=hashes();evidence.sourceStable=JSON.stringify(evidence.sourceBefore)===JSON.stringify(evidence.sourceAfter);evidence.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({total:evidence.total,passed:evidence.passed,failed:evidence.failed,sourceStable:evidence.sourceStable}));
  process.exitCode=evidence.failed||evidence.suites.some(s=>s.exitCode)||!evidence.sourceStable?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
