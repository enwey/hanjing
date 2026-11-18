// Additional appointment fault/timing checks, keeping all earlier evidence intact.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const out=path.join(__dirname,'artifacts/appointment-deep-audit-2026-11-18');fs.mkdirSync(out,{recursive:true});
const root=path.join(__dirname,'../../mp-weixin-rewrite');
const files=['pages/appointment/booking/index.js','pages/appointment/detail.js','pages/appointment/reschedule.js','pages/appointment/confirm.js','pages/appointment/confirm.wxml','stores/session-store.js','api/request.js','common/utils/subscribe.js'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
const sourceBefore=hashes(),startedAt=new Date().toISOString();
const runtime=file=>({require:createRequire(file),__dirname,__filename:file,module:{exports:{}},Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout});
const helper=path.join(__dirname,'appointment-audit-2026-11-18.cjs'),fixture={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8').split('(async()=>{')[0].replaceAll('artifacts/appointment-audit-2026-11-18','artifacts/appointment-deep-audit-2026-11-18/helpers')+'\nmodule.exports={create,loadPage,confirmApi,gate,tick,token};',{...runtime(helper),module:fixture});
const {create,loadPage,gate,tick,token}=fixture.exports;
const swap=h=>{h.store.logout();h.store.switchAccount('b');h.store.setAccessToken(token('b'));h.store.setAuthMode('wechat');};
const results=[];
async function check(id,fn){try{await fn();results.push({id,result:'passed'});}catch(e){results.push({id,result:'failed',error:e.message,observations:e.observations});}console.log(`${results.at(-1).result.toUpperCase()} ${id}`);}
function expect(actual,expected,message,observations){try{assert.equal(actual,expected,message);}catch(e){e.observations=observations;throw e;}}
function listApi(){return {getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),getAppointments:async()=>[],payAppointmentDeposit:async()=>({data:{timeStamp:'fixture'}})};}
async function reschedule(){
  const state={empty:false},calls=[],h=create();
  const api={getAppointmentDetail:async()=>({data:{appointment:{doctorId:'1',storeId:'1',appointmentDate:'2099-01-01',appointmentTime:'09:00-09:30'}}}),
    getScheduleDates:async()=>({data:state.empty?[]:['2099-01-01']}),
    getSchedules:async()=>({data:[{id:'schedule',date:'2099-01-01',period:'afternoon',startTime:'14:00',endTime:'15:00',status:'available'}]}),
    getTimeSlots:async()=>({data:[{id:'slot',label:'14:00-14:30',status:'available'}]}),
    rescheduleAppointment:async(id,data)=>{calls.push({id,...data});return {};}};
  const s=loadPage('reschedule.js',h,api);s.page.options={id:'apt'};await s.page.loadPage();s.page.selectTimeSlot({currentTarget:{dataset:{timeSlotId:'slot'}}});
  assert.equal(s.page.data.selectedTimeSlotLabel,'14:00-14:30');return {state,calls,h,api,s};
}
(async()=>{
  // Independent replay of the previously passing 62 checks, saved under this run.
  const baseline=path.join(__dirname,'appointment-regression-02-2026-11-18.cjs'),proc={exitCode:0,env:process.env},logs=[];
  const print=(...args)=>logs.push(args.join(' '));
  await vm.runInNewContext(fs.readFileSync(baseline,'utf8').replaceAll('artifacts/appointment-regression-02-2026-11-18','artifacts/appointment-deep-audit-2026-11-18/baseline'),{...runtime(baseline),process:proc,console:{log:print,error:print,warn:print}});
  fs.writeFileSync(path.join(out,'baseline.log'),logs.join('\n')+'\n');console.log(`${proc.exitCode?'FAIL':'PASS'} previous 62 checks`);
  await check('DEEP-01 list payment lock stays active until native callback returns',async()=>{
    const h=create(),payments=[];const s=loadPage('booking/index.js',h,listApi(),{requestPayment:o=>{payments.push(o);}});
    const pending=s.page.handlePrimaryAction({detail:{id:'apt',status:'pending_payment'}});await tick();
    assert.equal(payments.length,1);
    try{expect(s.page.appointmentPaymentInProgress,true,'callback-mode wx.requestPayment returned before user completed payment',{paymentSheetsRequested:payments.length,lockActive:s.page.appointmentPaymentInProgress});}
    finally{payments.forEach(p=>p.fail({errMsg:'requestPayment:fail cancel'}));await pending;}
  });
  await check('DEEP-02 repeat payment tap while sheet callback pending starts no second request',async()=>{
    let pay=0;const payments=[],api=listApi();api.payAppointmentDeposit=async()=>{pay++;return {data:{timeStamp:'fixture'}};};
    const s=loadPage('booking/index.js',create(),api,{requestPayment:o=>{payments.push(o);}});
    const pending=s.page.handlePrimaryAction({detail:{id:'apt',status:'pending_payment'}});await tick();
    const repeated=s.page.handlePrimaryAction({detail:{id:'apt',status:'pending_payment'}});await tick();
    try{expect(pay,1,'same payment was requested twice before any native payment callback',{payRequests:pay,paymentSheetsRequested:payments.length});}
    finally{payments.forEach(p=>p.fail({errMsg:'requestPayment:fail cancel'}));await Promise.all([pending,repeated]);}
  });
  for(const file of ['booking/index.js','detail.js'])await check(`DEEP-03 late payment params cannot open payment after account switch ${file}`,async()=>{
    const h=create(),g=gate(),payments=[],api=listApi();api.payAppointmentDeposit=()=>g.promise;
    const s=loadPage(file,h,api,{requestPayment:o=>{payments.push(o);}});s.page.data.appointmentId='apt';
    const pending=file==='booking/index.js'?s.page.handlePrimaryAction({detail:{id:'apt',status:'pending_payment'}}):s.page.payDeposit();
    await tick();swap(h);g.resolve({data:{timeStamp:'old-payment'}});await tick();
    // Complete any wrongly opened mock sheet to let the detail-page Promise settle.
    const observed=payments.length;for(const p of payments)p.fail({errMsg:'requestPayment:fail cancel'});await pending;
    expect(observed,0,'old payment parameters opened a payment sheet in the replacement session',{activeAccount:'b',paymentSheetsRequested:observed});
  });
  await check('DEEP-04 old cancellation confirmation cannot issue request as replacement account',async()=>{
    const h=create(),api=listApi();let calls=0;api.cancelAppointment=async()=>{calls++;return {};};const s=loadPage('booking/index.js',h,api);
    await s.page.cancelAppointment({detail:{id:'old',status:'pending',appointmentDate:'2099-01-01',appointmentTime:'09:00-09:30'}});swap(h);await s.modals[0].success({confirm:true});
    expect(calls,0,'old modal submitted cancellation after account changed',{activeAccount:'b',cancellationCalls:calls});
  });
  await check('DEEP-05 removing all available dates clears old reschedule selection',async()=>{
    const x=await reschedule();x.state.empty=true;await x.s.page.loadPage({silent:true});await x.s.page.submitReschedule();
    expect(x.calls.length,0,'stale schedule selection submitted with empty appointmentDate',{scheduleDates:x.s.page.data.scheduleDates,selectedDate:x.s.page.data.selectedDate,selectedSlot:x.s.page.data.selectedTimeSlotLabel,submitted:x.calls});
  });
  await check('DEEP-06 reschedule success stays locked before delayed navigation',async()=>{
    const x=await reschedule();await x.s.page.submitReschedule();await x.s.page.submitReschedule();
    expect(x.calls.length,1,'successful reschedule allowed a second submit before navigating back',{submitCalls:x.calls.length,navigationTimers:x.s.timers.length});
  });
  await check('DEEP-07 old reschedule success timer cannot navigate replacement session',async()=>{
    const x=await reschedule();await x.s.page.submitReschedule();swap(x.h);x.s.timers.forEach(f=>f());
    expect(x.s.nav.length,0,'old navigation timer popped replacement-account pages',{activeAccount:'b',navigation:x.s.nav});
  });
  await check('DEEP-08 failed payment-params request releases lock and never opens sheet',async()=>{
    const payments=[],api=listApi();api.payAppointmentDeposit=async()=>{throw Error('fixture unavailable');};const s=loadPage('booking/index.js',create(),api,{requestPayment:o=>payments.push(o)});
    await s.page.handlePrimaryAction({detail:{id:'apt',status:'pending_payment'}});assert.equal(payments.length,0);assert.equal(s.page.appointmentPaymentInProgress,false);
  });
  await check('DEEP-09 in-flight reschedule ignores duplicate submissions',async()=>{
    const x=await reschedule(),g=gate();let calls=0;x.api.rescheduleAppointment=()=>{calls++;return g.promise;};
    const pending=x.s.page.submitReschedule();await x.s.page.submitReschedule();assert.equal(calls,1);g.resolve({});await pending;
  });
  await check('DEEP-10 valid reschedule submits selected date and slot',async()=>{
    const x=await reschedule();await x.s.page.submitReschedule();assert.equal(x.calls.length,1);assert.equal(x.calls[0].appointmentDate,'2099-01-01');assert.equal(x.calls[0].appointmentTime,'14:00-14:30');
  });
  await check('DEEP-11 first load with no dates cannot submit reschedule',async()=>{
    const x=await reschedule();const h=create(),s=loadPage('reschedule.js',h,{...x.api,getScheduleDates:async()=>({data:[]})});s.page.options={id:'apt'};await s.page.loadPage();await s.page.submitReschedule();assert.equal(x.calls.length,0);
  });
  const baselineResult=JSON.parse(fs.readFileSync(path.join(out,'baseline/results.json'),'utf8')),sourceAfter=hashes();
  const evidence={startedAt,finishedAt:new Date().toISOString(),method:'actual client modules; controlled WeChat callback-mode payment/HTTP/storage/timing; no real payment or business DB writes',sourceBefore,sourceAfter,sourceStable:JSON.stringify(sourceBefore)===JSON.stringify(sourceAfter),baseline:{total:baselineResult.total,passed:baselineResult.passed,failed:baselineResult.failed},results,passed:results.filter(r=>r.result==='passed').length,failed:results.filter(r=>r.result==='failed').length};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({baseline:evidence.baseline,added:results.length,passed:evidence.passed,failed:evidence.failed,sourceStable:evidence.sourceStable}));
  process.exitCode=evidence.failed||proc.exitCode||!evidence.sourceStable?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
