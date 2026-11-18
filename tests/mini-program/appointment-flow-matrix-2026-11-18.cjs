const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const file = path.join(__dirname,'appointment-audit-2026-11-18.cjs');
const output = process.env.APPOINTMENT_MATRIX_OUTPUT || 'artifacts/appointment-flow-matrix-2026-11-18';
const fixture = {exports:{}};
vm.runInNewContext(fs.readFileSync(file,'utf8').split('\n(async()=>{')[0]
  .replaceAll('artifacts/appointment-audit-2026-11-18',output)
  +'\nmodule.exports={create,loadPage,confirmApi,gate,tick,members,token};',{
  require:require('node:module').createRequire(file),__dirname,module:fixture,
  Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout,
});
const {create,loadPage,confirmApi,gate,tick,members,token}=fixture.exports;
const results=[];
async function check(id,fn) {
  const observed={};
  try {await fn(observed);results.push({id,passed:true,observed});}
  catch(e){results.push({id,passed:false,error:e.message,observed});}
}
const reject=async()=>{throw Error('网络请求超时');};
function success(h,overrides={}) {
  const s=loadPage('success.js',h,{getBookingSettings:async()=>({}),getStores:async()=>[],
    getAppointmentDetail:async()=>({data:{appointment:{id:'a',status:'pending'},store:{name:'门店'}}}),...overrides});
  s.page.options={id:'a'};
  return s;
}
(async()=>{
  await check('M01 门店入口加载失败可见',async o=>{
    const s=loadPage('store-select.js',create(),{getStores:reject,getDoctors:async()=>[]});
    s.page.getLocation=async()=>null;
    try {await s.page.loadPage();} catch(e){o.rejection=e.message;}
    o.error=s.page.data.loadError||'';assert.ok(o.error||s.toasts.length);
  });
  await check('M02 门店排班请求失败区别于无排班',async o=>{
    const s=loadPage('store-select.js',create(),{
      getStores:async()=>[{id:'1',status:'open'}],getDoctors:async()=>[{id:'2',storeIds:['1']}],getScheduleDates:reject,
    });s.page.getLocation=async()=>null;
    await s.page.loadPage();
    Object.assign(o,{stores:s.page.data.stores.length,error:s.page.data.loadError||'',toasts:s.toasts});
    assert.ok(o.error||o.toasts.length);
  });
  await check('M03 医生列表加载失败可见',async o=>{
    const s=loadPage('doctor-list.js',create(),{getDoctors:reject,getStores:async()=>[]});
    s.page.options={storeId:'1'};
    try {await s.page.loadPage();} catch(e){o.rejection=e.message;}
    o.error=s.page.data.loadError||'';assert.ok(o.error||s.toasts.length);
  });
  await check('M04 时段接口失败显示错误',async o=>{
    const s=loadPage('time-select.js',create(),{getDaySlots:reject});
    await s.page.loadSchedulesForDate('2099-01-01');
    o.error=s.page.data.loadError;
    assert.ok(o.error);assert.equal(s.page.data.loadingSchedules,false);
  });
  await check('M05 创建明确拒绝保留草稿并允许重试',async o=>{
    const h=create({response:()=>({statusCode:200,data:{data:members}})}),api=confirmApi(h);
    api.createAppointment=async()=>{throw Object.assign(Error('时段已满'),{statusCode:400});};
    const s=loadPage('confirm.js',h,api);
    await s.page.loadPage();await s.page.submitAppointment();
    o.toasts=s.toasts;
    assert.ok(s.page.data.draft);assert.equal(s.page.data.isSubmitting,false);assert.ok(o.toasts.includes('时段已满'));
  });
  await check('M06 成功页已有门店详情时不受门店列表故障影响',async o=>{
    const s=success(create(),{getStores:reject});await s.page.loadPage();
    o.error=s.page.data.loadError;assert.equal(o.error,'');
  });
  await check('M07 成功页新取消状态不被旧成功响应覆盖',async o=>{
    const g=gate();let count=0;
    const s=success(create(),{getAppointmentDetail:()=>++count===1?g.promise:Promise.resolve({data:{appointment:{status:'cancelled'}}})});
    const old=s.page.loadPage();await tick();await s.page.loadPage();
    assert.equal(s.page.data.loadError,'该预约已取消');
    g.resolve({data:{appointment:{id:'a',status:'pending'}}});await old;
    o.appointment=s.page.data.appointment?.status;o.error=s.page.data.loadError;
    assert.notEqual(o.appointment,'pending');
  });
  await check('M08 成功页退出后拒绝旧详情回填',async o=>{
    const h=create(),g=gate();
    const s=success(h,{getAppointmentDetail:()=>g.promise});
    const pending=s.page.loadPage();await tick();h.store.logout();
    g.resolve({data:{appointment:{id:'a',status:'pending',patientName:'模拟旧就诊人'}}});await pending;
    o.session=h.store.isLoggedIn();o.patient=s.page.data.patientName;
    assert.equal(o.session,false);assert.notEqual(o.patient,'模拟旧就诊人');
  });
  await check('M09 待支付结果页不显示预约成功',async o=>{
    const s=success(create(),{getAppointmentDetail:async()=>({data:{appointment:{status:'pending_payment'}}})});
    await s.page.loadPage();o.error=s.page.data.loadError;
    assert.match(o.error,/勿重复付款/);
  });
  await check('M10 详情取消被拒绝时显示具体原因',async o=>{
    const s=loadPage('detail.js',create(),{
      getBookingSettings:async()=>({}),getAppointmentDetail:async()=>({data:{appointment:{status:'pending_payment'}}}),
      cancelAppointment:async()=>{throw Error('预约状态已变更');},
    });s.page.options={id:'a'};await s.page.loadPage();
    const p=s.page.cancelAppointment();s.modals[0].success({confirm:true});await p;
    o.toasts=s.toasts;assert.ok(o.toasts.includes('预约状态已变更'));
  });
  await check('M11 微信取消支付不调用支付确认',async o=>{
    let calls=0;
    const s=loadPage('booking/index.js',create(),{payAppointmentDeposit:async()=>({data:{timeStamp:'fixture'}}),
      confirmAppointmentPayment:async()=>{calls++;}}, {requestPayment:o=>o.fail({errMsg:'requestPayment:fail cancel'})});
    await s.page.handlePrimaryAction({detail:{id:'a',status:'pending_payment'}});
    Object.assign(o,{calls,toasts:s.toasts,locked:s.page.appointmentPaymentInProgress});
    assert.equal(calls,0);assert.equal(o.locked,false);assert.ok(o.toasts.includes('支付未完成'));
  });
  await check('M12 改约接口拒绝时无跳转且可重试',async o=>{
    const s=loadPage('reschedule.js',create(),{
      getAppointmentDetail:async()=>({data:{appointment:{doctorId:'1',storeId:'1'}}}),
      getScheduleDates:async()=>({data:['2099-01-01']}),
      getSchedules:async()=>({data:[{id:'s',status:'available'}]}),
      getTimeSlots:async()=>({data:[{id:'t',label:'09:00-09:30',status:'available'}]}),
      rescheduleAppointment:async()=>{throw Error('时段已满');},
    });s.page.options={id:'a'};await s.page.loadPage();
    s.page.selectTimeSlot({currentTarget:{dataset:{timeSlotId:'t'}}});await s.page.submitReschedule();
    Object.assign(o,{toasts:s.toasts,timers:s.timers.length,locked:s.page.data.submitting});
    assert.ok(o.toasts.includes('时段已满'));assert.equal(o.timers,0);assert.equal(o.locked,false);
  });
  await check('M13 部分排班失败保留可约门店，重试恢复',async o=>{
    let offline=true;
    const s=loadPage('store-select.js',create(),{
      getStores:async()=>[{id:'1',status:'open'},{id:'2',status:'open'}],
      getDoctors:async()=>[{id:'a',storeIds:['1','2']}],
      getScheduleDates:async({storeId})=>{if(offline&&storeId==='2')throw Error('超时');return ['2099-01-01'];},
    });
    s.page.getLocation=async()=>null;
    await s.page.loadPage();
    assert.equal(s.page.data.stores.length,1);assert.ok(s.page.data.loadError);
    offline=false;await s.page.loadPage();
    o.stores=s.page.data.stores.length;assert.equal(o.stores,2);assert.equal(s.page.data.loadError,'');
  });
  await check('M14 医生加载失败后重试恢复',async o=>{
    let offline=true;
    const s=loadPage('doctor-list.js',create(),{
      getDoctors:async()=>{if(offline)throw Error('超时');return [{id:'a',name:'医生'}];},
      getStores:async()=>[],
    });
    await s.page.loadPage();assert.ok(s.page.data.loadError);
    offline=false;await s.page.loadPage();
    o.doctors=s.page.data.doctors.length;assert.equal(o.doctors,1);assert.equal(s.page.data.loadError,'');
  });
  await check('R01 已显示旧结果时退出，静默刷新晚到后清空隐私资料',async o=>{
    const h=create(),g=gate();let calls=0;
    const old={data:{appointment:{status:'pending',patientName:'测试旧姓名',symptomDesc:'测试旧主诉'},store:{name:'门店'}}};
    const s=success(h,{getAppointmentDetail:()=>++calls===1?Promise.resolve(old):g.promise});
    await s.page.loadPage();assert.equal(s.page.data.patientName,'测试旧姓名');
    const pending=s.page.onShow();await tick();h.store.logout();g.resolve(old);await pending;
    Object.assign(o,{record:s.page.data.appointment,patient:s.page.data.patientName,symptom:s.page.data.symptomDesc,error:s.page.data.loadError});
    assert.equal(o.record,null);assert.equal(o.patient,'');assert.equal(o.symptom,'');assert.match(o.error,/登录已失效/);
  });
  await check('R02 换号后旧详情晚到不覆盖新账号结果',async o=>{
    const h=create(),g=gate();let calls=0;
    const s=success(h,{getAppointmentDetail:()=>++calls===1?g.promise:Promise.resolve({data:{appointment:{status:'pending',patientName:'测试新姓名'},store:{name:'新门店'}}})});
    const pending=s.page.loadPage();await tick();
    h.store.logout();h.store.setAccessToken(token('b'));h.store.setAuthMode('wechat');
    s.page.options={id:'b'};await s.page.loadPage();
    g.resolve({data:{appointment:{status:'pending',patientName:'测试旧姓名'},store:{name:'旧门店'}}});await pending;
    Object.assign(o,{patient:s.page.data.patientName,store:s.page.data.storeName,error:s.page.data.loadError});
    assert.equal(o.patient,'测试新姓名');assert.equal(o.store,'新门店');assert.equal(o.error,'');
  });
  await check('R03 等待补充门店时退出，返回后不写入预约结果',async o=>{
    const h=create(),g=gate();let called=false;
    const s=success(h,{getAppointmentDetail:async()=>({data:{appointment:{status:'pending',patientName:'测试旧姓名',storeId:'1'}}}),
      getStores:()=>{called=true;return g.promise;}});
    const pending=s.page.loadPage();await tick();assert.equal(called,true);
    h.store.logout();g.resolve([{id:'1',name:'旧门店'}]);await pending;
    Object.assign(o,{patient:s.page.data.patientName,record:s.page.data.appointment,error:s.page.data.loadError});
    assert.equal(o.patient,'');assert.equal(o.record,null);assert.match(o.error,/登录已失效/);
  });
  fs.writeFileSync(path.join(__dirname,output,'results.json'),JSON.stringify(results,null,2));
  for(const r of results)console.log(r.passed?'PASS':'FAIL',r.id,JSON.stringify(r.observed),r.error||'');
  process.exitCode=results.some(r=>!r.passed)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
