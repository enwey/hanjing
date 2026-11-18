const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const file = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const output = process.env.APPOINTMENT_DETAIL_OUTPUT || 'artifacts/appointment-detail-actions-2026-11-18';
const fixture = {exports:{}};
vm.runInNewContext(fs.readFileSync(file,'utf8').split('\n(async()=>{')[0]
  .replaceAll('artifacts/appointment-audit-2026-11-18',output)
  + '\nmodule.exports={create,loadPage};',{
  require:require('node:module').createRequire(file),__dirname,module:fixture,
  Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout,
});
const {create,loadPage}=fixture.exports;
const results=[];
const reason='预约状态已变更，请刷新后重试';
async function check(name,fn) {
  const observed={};
  try {await fn(observed);results.push({name,passed:true,observed});}
  catch(error){results.push({name,passed:false,error:error.message,observed});}
}
async function detail(status, cancelAppointment) {
  const s=loadPage('detail.js',create(),{
    getBookingSettings:async()=>({}),
    getAppointmentDetail:async()=>({data:{appointment:{id:'fixture',status,appointmentDate:'2099-01-01',appointmentTime:'09:00-09:30'},store:{},doctor:{}}}),
    cancelAppointment,
  });
  s.page.options={id:'fixture'};
  await s.page.loadPage();
  assert.equal(s.page.data.appointmentLoaded,true);
  return s;
}
(async()=>{
  for(const status of ['checked_in','pending','completed']) await check('self-service footer: '+status,async observed=>{
    const s=await detail(status);
    observed.footer=s.page.data.showRescheduleCancelFooter;
    assert.equal(observed.footer,status==='pending');
  });
  await check('cancel rejection retains actionable reason',async observed=>{
    let calls=0;
    const s=await detail('pending',async()=>{calls++;throw Object.assign(Error(reason),{statusCode:409});});
    const pending=s.page.cancelAppointment();
    s.modals[0].success({confirm:true});
    await pending;
    Object.assign(observed,{calls,toasts:s.toasts});
    assert.equal(calls,1);
    assert.ok(s.toasts.includes(reason));
  });
  await check('cancel confirmation dismissed never calls API',async observed=>{
    let calls=0;
    const s=await detail('pending',async()=>{calls++;});
    const pending=s.page.cancelAppointment();
    s.modals[0].success({confirm:false});
    await pending;
    observed.calls=calls;
    assert.equal(calls,0);
  });
  fs.writeFileSync(path.join(__dirname,output,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
  process.exitCode=results.some(r=>!r.passed)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
