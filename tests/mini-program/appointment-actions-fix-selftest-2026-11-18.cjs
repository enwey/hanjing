// Development checks for APT-1118-07..12; do not overwrite audit evidence.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const helper=path.join(__dirname,'appointment-deep-audit-2026-11-18.cjs');
const source=fs.readFileSync(helper,'utf8').replaceAll('artifacts/appointment-deep-audit-2026-11-18','artifacts/appointment-actions-fix-selftest-2026-11-18/original');
const out=path.join(__dirname,'artifacts/appointment-actions-fix-selftest-2026-11-18');
const context=()=>({require:createRequire(helper),__dirname,__filename:helper,Buffer,console,module:{exports:{}},structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout});
const results=[],previews=[];
async function check(id,fn){try{await fn();results.push({id,result:'passed'});}catch(e){results.push({id,result:'failed',error:e.message});}console.log(`${results.at(-1).result.toUpperCase()} ${id}`);}
(async()=>{
  const state={exitCode:0,env:process.env};await vm.runInNewContext(source,{...context(),process:state});
  const fixture={exports:{}};vm.runInNewContext(source.slice(0,source.indexOf('\n(async()=>{'))+'\nmodule.exports={create,loadPage,gate,tick,swap,listApi,reschedule};',{...context(),module:fixture});
  const {create,loadPage,gate,tick,swap,listApi,reschedule}=fixture.exports;
  await check('ACTION-01 list lock covers native sheet and pending confirmation',async()=>{
    const h=create(),payments=[],g=gate(),api=listApi();let confirms=0;
    api.confirmAppointmentPayment=()=>{confirms++;return g.promise;};
    const s=loadPage('booking/index.js',h,api,{requestPayment:o=>payments.push(o)});
    const pending=s.page.handlePrimaryAction({detail:{id:'apt',status:'pending_payment'}});await tick();assert.equal(payments.length,1);assert.equal(s.page.appointmentPaymentInProgress,true);
    payments[0].success({});await tick();assert.equal(confirms,1);assert.equal(s.page.appointmentPaymentInProgress,true);
    await s.page.handlePrimaryAction({detail:{id:'apt',status:'pending_payment'}});assert.equal(payments.length,1);
    g.resolve({});await pending;assert.equal(s.page.appointmentPaymentInProgress,false);
  });
  for(const file of ['booking/index.js','detail.js'])await check(`ACTION-02 old native success cannot confirm after account switch ${file}`,async()=>{
    const h=create(),payments=[],api=listApi();let confirms=0;api.confirmAppointmentPayment=async()=>{confirms++;};
    const s=loadPage(file,h,api,{requestPayment:o=>payments.push(o)});s.page.data.appointmentId='apt';
    const pending=file==='booking/index.js'?s.page.handlePrimaryAction({detail:{id:'apt',status:'pending_payment'}}):s.page.payDeposit();
    await tick();assert.equal(payments.length,1);swap(h);payments[0].success({});await pending;
    assert.equal(confirms,0);assert.equal(s.toasts.length,0);
  });
  await check('ACTION-03 old cancel response does not show success or reload replacement page',async()=>{
    const h=create(),g=gate(),api=listApi();api.cancelAppointment=()=>g.promise;
    const s=loadPage('booking/index.js',h,api);await s.page.cancelAppointment({detail:{id:'apt',status:'pending_payment'}});
    const pending=s.modals[0].success({confirm:true});await tick();swap(h);let loads=0;s.page.loadPage=async()=>{loads++;};g.resolve({});await pending;
    assert.equal(loads,0);assert.equal(s.toasts.length,0);
  });
  await check('ACTION-04 rejected reschedule unlocks for retry; success stays locked',async()=>{
    const x=await reschedule();let calls=0;x.api.rescheduleAppointment=async()=>{if(++calls===1)throw Error('已满，请重新选择');return {};};
    await x.s.page.submitReschedule();assert.equal(x.s.page.data.submitting,false);assert.equal(x.s.page.data.rescheduleCompleted,false);
    await x.s.page.submitReschedule();assert.equal(calls,2);assert.equal(x.s.page.data.submitting,true);assert.equal(x.s.page.data.rescheduleCompleted,true);
    previews.push({title:'改约成功等待返回',data:structuredClone(x.s.page.data)});
  });
  await check('ACTION-05 unload cancels old successful reschedule navigation',async()=>{
    const x=await reschedule();await x.s.page.submitReschedule();x.s.page.onUnload();x.s.timers.forEach(f=>f());assert.equal(x.s.nav.length,0);
  });
  await check('ACTION-06 empty dates invalidate already pending slot response',async()=>{
    const x=await reschedule(),g=gate();x.api.getTimeSlots=()=>g.promise;
    const pending=x.s.page.selectSchedule('schedule',{silent:true});await tick();x.state.empty=true;await x.s.page.loadPage({silent:true});
    g.resolve({data:[{id:'late',label:'15:00-15:30',status:'available'}]});await pending;
    assert.equal(x.s.page.data.selectedDate,'');assert.equal(x.s.page.data.timeSlots.length,0);assert.equal(x.s.page.data.selectedTimeSlotId,'');
    previews.push({title:'可约日期失效后',data:structuredClone(x.s.page.data)});
  });
  await check('ACTION-07 no remaining schedule clears old slot selection',async()=>{
    const x=await reschedule();x.api.getSchedules=async()=>({data:[]});await x.s.page.loadSchedulesForDate('2099-01-01',{silent:true});
    assert.equal(x.s.page.data.timeSlots.length,0);assert.equal(x.s.page.data.selectedScheduleId,'');await x.s.page.submitReschedule();assert.equal(x.calls.length,0);
  });
  await check('ACTION-08 reschedule WXML disables invalid and completed form with balanced tags',async()=>{
    const xml=fs.readFileSync(path.join(__dirname,'../../mp-weixin-rewrite/pages/appointment/reschedule.wxml'),'utf8');
    assert.ok(xml.includes('disabled="{{loading || submitting || rescheduleCompleted || !selectedDate || !selectedTimeSlotId}}"'));
    const stack=[],pattern=/<(\/?)([\w-]+)\b(?:[^>"']|"[^"]*"|'[^']*')*(\/?)>/g;
    for(const m of xml.replace(/<!--[\s\S]*?-->/g,'').matchAll(pattern)){if(m[1])assert.equal(stack.pop(),m[2]);else if(!m[0].endsWith('/>'))stack.push(m[2]);}assert.equal(stack.length,0);
  });
  fs.mkdirSync(out,{recursive:true});const original=JSON.parse(fs.readFileSync(path.join(out,'original/results.json'),'utf8'));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({phase:'development self-test; not independent regression',originalBaseline:original.baseline,originalAdded:{passed:original.passed,failed:original.failed},results,previews},null,2));
  const root=path.join(__dirname,'../../mp-weixin-rewrite'),css=fs.readFileSync(path.join(root,'pages/appointment/reschedule.wxss'),'utf8').replace(/([\d.]+)rpx/g,(_,n)=>Number(n)/2+'px');
  fs.writeFileSync(path.join(out,'preview.html'),`<!doctype html><meta charset="utf-8"><style>${css}*{box-sizing:border-box}body{margin:0;padding:16px;background:#f9fafb;font-family:Arial,"Microsoft Yahei",sans-serif}section{width:390px;margin-bottom:32px}h2{font-size:15px;font-weight:500}.bar-primary-btn{width:100%}.empty-card{background:white;border-radius:16px;padding:24px}</style>${previews.map(({title,data})=>`<section><h2>${title}</h2>${!data.selectedDate?'<div class="empty-card"><span class="empty-text">暂无可改约日期，请稍后重试</span></div>':'<div class="schedule-header"><span class="schedule-period">下午</span><span class="schedule-time">14:00-15:00</span></div>'}<button class="bar-primary-btn" disabled>${data.rescheduleCompleted?'改约成功':'确认改约'}</button></section>`).join('')}`);
  process.exitCode=state.exitCode||results.some(r=>r.result==='failed')?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
