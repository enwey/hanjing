const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const file = path.join(__dirname,'appointment-audit-2026-11-18.cjs');
const output = process.env.APPOINTMENT_SESSION_OUTPUT || 'artifacts/appointment-session-boundary-2026-11-18';
const fixture = {exports:{}};
vm.runInNewContext(fs.readFileSync(file,'utf8').split('\n(async()=>{')[0]
  .replaceAll('artifacts/appointment-audit-2026-11-18',output)
  + '\nmodule.exports={create,loadPage,confirmApi};',{
  require:require('node:module').createRequire(file),__dirname,module:fixture,
  Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout,
});
const {create,loadPage,confirmApi} = fixture.exports;
const results=[];
async function check(name,fn){
  const observed={};
  try {await fn(observed);results.push({name,passed:true,observed});}
  catch(error){results.push({name,passed:false,error:error.message,observed});}
}
(async()=>{
  for(const silent of [false,true]) await check('list renewal denied, silent='+silent,async observed=>{
    let denied=!silent;
    const h=create({response:()=>denied?{statusCode:401,data:{message:'登录已失效'}}:
      {statusCode:200,data:{data:[{id:'fixture',status:'pending',patientName:'测试就诊人'}]}}});
    const s=loadPage('booking/index.js',h,{
      getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),
      getAppointments:()=>h.request.request({url:'/appointments'}),
    });
    if(silent){await s.page.loadPage();assert.equal(s.page.data.upcomingAppointments.length,1);denied=true;}
    await s.page.loadPage({silent});
    Object.assign(observed,{session:h.store.isLoggedIn(),pageSession:s.page.data.isLoggedIn,
      loading:s.page.data.loading,records:s.page.data.upcomingAppointments.length});
    assert.equal(observed.session,false);
    assert.deepEqual([observed.pageSession,observed.loading,observed.records],[false,false,0]);
  });
  await check('confirmation renewal denied ends loading',async observed=>{
    const h=create({response:()=>({statusCode:401,data:{message:'登录已失效'}})});
    const s=loadPage('confirm.js',h,confirmApi(h));
    await s.page.loadPage();
    Object.assign(observed,{session:h.store.isLoggedIn(),loading:s.page.data.loading,error:s.page.data.loadError});
    assert.equal(observed.session,false);
    assert.equal(observed.loading,false);
    assert.ok(observed.error);
  });
  await check('reschedule from list returns to immediate predecessor',async observed=>{
    const h=create(), list=loadPage('booking/index.js',h,{});
    await list.page.handlePrimaryAction({detail:{id:'fixture',status:'pending'}});
    assert.ok(list.nav[0].includes('/reschedule?id='));
    const s=loadPage('reschedule.js',h,{
      getAppointmentDetail:async()=>({data:{appointment:{doctorId:'1',storeId:'1'}}}),
      getScheduleDates:async()=>({data:['2099-01-01']}),
      getSchedules:async()=>({data:[{id:'s',status:'available'}]}),
      getTimeSlots:async()=>({data:[{id:'t',label:'09:00-09:30',status:'available'}]}),
      rescheduleAppointment:async()=>({}),
    });
    s.page.options={id:'fixture'};
    await s.page.loadPage();
    s.page.selectTimeSlot({currentTarget:{dataset:{timeSlotId:'t'}}});
    await s.page.submitReschedule();
    s.timers.forEach(fn=>fn());
    observed.back=s.nav;
    assert.deepEqual(Array.from(s.nav),[1]);
  });
  fs.writeFileSync(path.join(__dirname,output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
  process.exitCode=results.some(r=>!r.passed)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
