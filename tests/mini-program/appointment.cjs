const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../mp-weixin-rewrite');
const results=[];const tick=()=>new Promise(r=>setImmediate(r));
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
function page(file,api={}){
  let p,loggedIn=true;const storage=new Map(),toasts=[],modals=[],nav=[],timers=[];let draft={doctorId:1,storeId:1,scheduleId:1,appointmentDate:'2099-01-01',timeSlot:{label:'09:00-09:30'}};
  const draftStore={getDraft:()=>draft,setDraft:v=>draft=v,clearDraft:()=>draft=null};
  const wx={getStorageSync:k=>storage.get(k),removeStorageSync:k=>storage.delete(k),showToast:o=>toasts.push(o.title),showModal:o=>modals.push(o),showLoading(){},hideLoading(){},navigateTo:o=>nav.push(o.url),reLaunch:o=>nav.push(o.url)};
  const deps={};
  const ctx=vm.createContext({Page:o=>p=o,wx,console:{error(){}},setTimeout:fn=>timers.push(fn),require:s=>{
    if(s.includes('api/index'))return api;
    if(s.includes('appointment-draft'))return draftStore;
    if(s.includes('session-store'))return {isLoggedIn:()=>loggedIn,getAccessToken:()=>loggedIn?'test':''};
    if(s.includes('subscribe'))return {requestSubscribe:async()=>{}};
    if(s.includes('navigation'))return {openPage:url=>nav.push(url)};
    return deps;
  }});
  vm.runInContext(fs.readFileSync(path.join(root,'pages/appointment',file),'utf8'),ctx);
  p.data=JSON.parse(JSON.stringify(p.data));p.setData=o=>Object.assign(p.data,o);
  return {p,wx,ctx,storage,toasts,modals,nav,timers,draftStore,setLoggedIn:v=>loggedIn=v};
}
const members=[{id:1,name:'Self',relation:'self'},{id:2,name:'Parent',relation:'parent',age:50}];
const confirmApi=()=>({getStores:async()=>({data:[{id:1,name:'Store'}]}),getDoctors:async()=>({data:[{id:1,name:'Doctor',consultFee:0}]}),getFamilyMembers:async()=>({data:members}),getBookingSettings:async()=>({data:{requireDeposit:false}})});
(async()=>{
 await test('confirm loads patient and doctor',async()=>{const h=page('confirm.js',confirmApi());await h.p.loadPage();assert.equal(h.p.data.doctorName,'Doctor');assert.equal(h.p.data.memberList.length,2);});
 await test('confirm rejects missing patient',async()=>{let calls=0;const h=page('confirm.js',{createAppointment:async()=>calls++});h.p.data.draft=h.draftStore.getDraft();await h.p.submitAppointment();assert.equal(calls,0);assert(h.toasts.includes('请先选择就诊人'));});
 await test('confirm deduplicates in-flight create',async()=>{const g=gate();let calls=0;const h=page('confirm.js',{createAppointment:()=>{calls++;return g.promise;}});h.p.data.draft=h.draftStore.getDraft();h.p.data.memberList=members;const a=h.p.submitAppointment();await h.p.submitAppointment();assert.equal(calls,1);g.resolve({data:{id:1,status:'pending'}});await a;});
 await test('APT-01 booking payment action calls exported API',async()=>{
  let calls=0,payment;const ctx={module:{exports:{}},require:()=>({request:async()=>{calls++;return {data:{timeStamp:'123',nonceStr:'test',package:'prepay_id=test',signType:'RSA',paySign:'test'}};}})};
  vm.runInNewContext(fs.readFileSync(path.join(root,'api/modules/appointment-api.js'),'utf8'),ctx);
  const h=page('booking/index.js',ctx.module.exports);h.wx.requestPayment=o=>{payment=o;};await h.p.handlePrimaryAction({detail:{id:1,status:'pending_payment'}});
  assert.equal(calls,1,'payment request count='+calls+' toast='+h.toasts.join(';'));
  assert.equal(payment.package,'prepay_id=test');assert.equal(payment.timeStamp,'123');
 });
 await test('APT-02 late date response cannot overwrite current date slots',async()=>{
  const a=gate(),b=gate();const h=page('time-select.js',{getDaySlots:o=>o.date==='2099-01-01'?a.promise:b.promise});h.p.data.doctorId='1';h.p.data.storeId='1';
  const first=h.p.loadSchedulesForDate('2099-01-01');const second=h.p.loadSchedulesForDate('2099-01-02');
  b.resolve({data:[{id:'B',scheduleId:2,label:'10:00-10:30',status:'available'}]});await second;
  a.resolve({data:[{id:'A',scheduleId:1,label:'09:00-09:30',status:'available'}]});await first;
  assert.equal(h.p.data.selectedDate,'2099-01-02');assert.equal(h.p.data.timeSlotSections[0].slots[0].id,'B');
 });
 await test('APT-03 selection survives confirm page refresh',async()=>{const h=page('confirm.js',confirmApi());await h.p.loadPage();h.p.handleMemberChange({detail:{value:1}});assert.equal(h.p.data.memberIndex,1);await h.p.loadPage({silent:true});assert.equal(h.p.data.memberList[h.p.data.memberIndex].id,2);});
 await test('APT-04 created pending-payment order remains submission-locked',async()=>{let calls=0;const h=page('confirm.js',{createAppointment:async()=>{calls++;return {data:{id:calls,status:'pending_payment'}};}});h.p.data.draft=h.draftStore.getDraft();h.p.data.memberList=members;await h.p.submitAppointment();assert.equal(h.modals.length,1);assert.equal(h.p.data.isSubmitting,true);});
 await test('APT-04 successful create cannot be resubmitted before navigation',async()=>{let calls=0;const h=page('confirm.js',{createAppointment:async()=>{calls++;return {data:{id:calls,status:'pending'}};}});h.p.data.draft=h.draftStore.getDraft();h.p.data.memberList=members;h.p.requestSubscribe=()=>{};await h.p.submitAppointment();await h.p.submitAppointment();assert.equal(calls,1);});
 await test('APT-05 backend rejection reason is visible',async()=>{const h=page('confirm.js',{createAppointment:async()=>{throw Error('该时间段预约人数已满，请选择其他时间段');}});h.p.data.draft=h.draftStore.getDraft();h.p.data.memberList=members;await h.p.submitAppointment();assert(h.toasts.some(s=>s.includes('已满')),JSON.stringify(h.toasts));});
 await test('lunch exclusion matches backend slot generator',()=>{const src=fs.readFileSync(path.resolve(root,'../hanjing-clinic-backend/routes/client.js'),'utf8');const a=src.indexOf('function buildScheduleSlots('),b=src.indexOf('function getSlotStatusPriority',a);const ctx=vm.createContext({});vm.runInContext(src.slice(a,b),ctx);const slots=vm.runInContext("buildScheduleSlots({id:1,start_time:'13:00',end_time:'13:30'},30)",ctx);assert.equal(slots.length,0);});
 await test('unavailable time slot cannot advance',()=>{const h=page('time-select.js');h.p.data.timeSlotSections=[{slots:[{id:'A',isAvailable:false}]}];h.p.handleTimeSlotTap({currentTarget:{dataset:{timeSlotId:'A'}}});assert.equal(h.nav.length,0);});
 await test('available time slot records selected schedule',()=>{const h=page('time-select.js');h.p.data.selectedDate='2099-01-01';h.p.data.timeSlotSections=[{slots:[{id:'A',scheduleId:22,isAvailable:true,label:'09:00-09:30'}]}];h.p.handleTimeSlotTap({currentTarget:{dataset:{timeSlotId:'A'}}});assert.equal(h.draftStore.getDraft().scheduleId,22);assert.equal(h.nav.length,1);});
 await test('missing doctor/store rejected',async()=>{const h=page('time-select.js');await h.p.loadPage();assert(h.p.data.loadError.includes('缺少'));});
 await test('reschedule original slot rejected',()=>{const h=page('reschedule.js');h.p.originalDate='2099-01-01';h.p.originalTime='09:00-09:30';h.p.data.selectedDate=h.p.originalDate;h.p.data.timeSlots=[{id:'x',label:h.p.originalTime,selectable:true}];h.p.selectTimeSlot({currentTarget:{dataset:{timeSlotId:'x'}}});assert.equal(h.p.data.selectedTimeSlotId,'');assert(h.toasts.length);});
 await test('APT-07 late reschedule response cannot replace current schedule slots',async()=>{
  const a=gate(),b=gate();const h=page('reschedule.js',{getTimeSlots:id=>id==='A'?a.promise:b.promise});h.p.data.schedules=[{id:'A'},{id:'B'}];
  const first=h.p.selectSchedule('A');const second=h.p.selectSchedule('B');b.resolve({data:[{id:'Bslot',label:'14:00-14:30',status:'available'}]});await second;a.resolve({data:[{id:'Aslot',label:'09:00-09:30',status:'available'}]});await first;
  assert.equal(h.p.data.selectedScheduleId,'B');assert.equal(h.p.data.timeSlots[0].id,'Bslot');
 });
 await test('APT-06 late list response must not repopulate logged-out view',async()=>{
  const g=gate();const h=page('booking/index.js',{getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),getAppointments:()=>g.promise});const pending=h.p.loadPage();await tick();h.setLoggedIn(false);await h.p.loadPage();assert.equal(h.p.data.isLoggedIn,false);g.resolve({data:[{id:1,status:'pending',patientName:'previous-account'}]});await pending;assert.equal(h.p.data.upcomingAppointments.length,0);
 });
 await test('APT-04 failed creation releases lock for retry',async()=>{let calls=0;const h=page('confirm.js',{createAppointment:async()=>{calls++;throw Error('slot full');}});h.p.data.draft=h.draftStore.getDraft();h.p.data.memberList=members;await h.p.submitAppointment();assert.equal(h.p.data.isSubmitting,false);await h.p.submitAppointment();assert.equal(calls,2);});
 await test('APT-04 created order clears persistent draft',async()=>{const h=page('confirm.js',{createAppointment:async()=>({data:{id:99,status:'pending_payment'}})});h.p.data.draft=h.draftStore.getDraft();h.p.data.memberList=members;await h.p.submitAppointment();assert.equal(h.draftStore.getDraft(),null);assert.equal(h.p.data.draft,null);});
 console.log(JSON.stringify({scope:'Actual page functions with mocked wx/API; no real appointments or payments',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
