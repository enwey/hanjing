const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'appointment.cjs'),'utf8').split('(async()=>{')[0];
const checks=`
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {resolve,reject,promise};};
(async()=>{
 for(const file of ['time-select.js','reschedule.js'])await test('stale error ignored '+file,async()=>{
  const a=deferred(),b=deferred();const time=file==='time-select.js';const h=page(file,time?{getDaySlots:o=>o.date==='A'?a.promise:b.promise}:{getTimeSlots:id=>id==='A'?a.promise:b.promise});
  h.p.data.schedules=[{id:'A'},{id:'B'}];const first=time?h.p.loadSchedulesForDate('A'):h.p.selectSchedule('A');const second=time?h.p.loadSchedulesForDate('B'):h.p.selectSchedule('B');
  b.resolve({data:[{id:'B',scheduleId:2,label:'14:00-14:30',status:'available'}]});await second;a.reject(Error('old failure'));await first;assert.equal(h.p.data.loadError,'');assert.equal(h.toasts.length,0);
 });
 await test('APT-03 reordered patients retain id',async()=>{const api=confirmApi(),h=page('confirm.js',api);await h.p.loadPage();h.p.handleMemberChange({detail:{value:1}});api.getFamilyMembers=async()=>({data:[members[1],members[0]]});await h.p.loadPage();assert.equal(h.p.data.memberList[h.p.data.memberIndex].id,2);});
 await test('APT-03 newly added patient overrides retained selection',async()=>{const h=page('confirm.js',confirmApi());await h.p.loadPage();h.p.selectCreatedPatient(2);await h.p.loadPage();assert.equal(h.p.data.memberList[h.p.data.memberIndex].id,2);});
 await test('APT-03 deleted selection falls back to available patient',async()=>{const api=confirmApi(),h=page('confirm.js',api);await h.p.loadPage();h.p.handleMemberChange({detail:{value:1}});api.getFamilyMembers=async()=>({data:[members[0]]});await h.p.loadPage();assert.equal(h.p.data.memberList[h.p.data.memberIndex].id,1);});
 for(const confirm of [true,false])await test('APT-04 payment outcome cannot create second appointment '+confirm,async()=>{
  let creates=0;const h=page('confirm.js',{createAppointment:async()=>({data:{id:++creates,status:'pending_payment'}}),payAppointmentDeposit:async()=>{throw Error('pay unavailable');},cancelAppointment:async()=>({})});h.p.data.draft=h.draftStore.getDraft();h.p.data.memberList=members;await h.p.submitAppointment();await h.modals[0].success({confirm});await h.p.submitAppointment();assert.equal(creates,1);assert.equal(h.draftStore.getDraft(),null);
 });
 await test('APT-04 payment dialog failure offers records route',async()=>{const h=page('confirm.js',{createAppointment:async()=>({data:{id:1,status:'pending_payment'}})});h.p.data.draft=h.draftStore.getDraft();h.p.data.memberList=members;await h.p.submitAppointment();h.modals[0].fail();assert(h.nav.some(x=>x.includes('/booking/index')));});
 await test('APT-05 absent message uses fallback and unlocks',async()=>{const h=page('confirm.js',{createAppointment:async()=>{throw {};}});h.p.data.draft=h.draftStore.getDraft();h.p.data.memberList=members;await h.p.submitAppointment();assert(h.toasts.includes('预约失败，请重试'));assert.equal(h.p.data.isSubmitting,false);});
 await test('APT-06 stale list failure cannot override logged-out page',async()=>{const g=deferred();const h=page('booking/index.js',{getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),getAppointments:()=>g.promise});const old=h.p.loadPage();await tick();h.setLoggedIn(false);await h.p.loadPage();g.reject(Error('old failure'));await old;assert.equal(h.p.data.loadError,'');assert.equal(h.p.data.upcomingAppointments.length,0);assert.equal(h.p.data.isLoggedIn,false);});
 await test('APT-06 newer refresh wins over old list',async()=>{const a=deferred(),b=deferred();let calls=0;const h=page('booking/index.js',{getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),getAppointments:()=>++calls===1?a.promise:b.promise});const first=h.p.loadPage();await tick();const second=h.p.loadPage();await tick();b.resolve({data:[{id:'B',status:'pending'}]});await second;a.resolve({data:[{id:'A',status:'pending'}]});await first;assert.equal(h.p.data.upcomingAppointments[0].id,'B');});
 console.log(JSON.stringify({scope:'Actual appointment page functions, mocked wx/API; no real payments or bookings',total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2));process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
})();
`;
vm.runInNewContext(source+checks,{require,__dirname,console,process,setImmediate},{filename:__filename});
