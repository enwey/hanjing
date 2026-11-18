const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
process.env.TZ='Asia/Tokyo';
let now=Date.parse('2026-11-18T15:30:00Z');
class Clock extends Date {
  constructor(...args){super(...(args.length?args:[now]));}
  static now(){return now;}
}
const file=path.join(__dirname,'appointment-audit-2026-11-18.cjs');
const output=process.env.APPOINTMENT_ROUND2_OUTPUT || 'artifacts/appointment-flow-round2-2026-11-18',fixture={exports:{}};
vm.runInNewContext(fs.readFileSync(file,'utf8').split('\n(async()=>{')[0]
  .replaceAll('artifacts/appointment-audit-2026-11-18',output).replace('Page: p =>','Date, Page: p =>')
  +'\nmodule.exports={create,loadPage,confirmApi,members};',{
  require:require('node:module').createRequire(file),__dirname,module:fixture,Date:Clock,Buffer,console,
  structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout,
});
const {create,loadPage,confirmApi,members}=fixture.exports;
const results=[];
async function check(id,fn){
  const observed={};
  try{await fn(observed);results.push({id,passed:true,observed});}
  catch(e){results.push({id,passed:false,error:e.message,observed});}
}
const record={id:'a',status:'pending',appointmentDate:'2026-11-20',appointmentTime:'09:00-09:30'};
function detail(h,api={}){
  const s=loadPage('detail.js',h,{getBookingSettings:async()=>({data:{cancelLimitHours:2}}),
    getAppointmentDetail:async()=>({data:{appointment:record,doctor:{},store:{}}}),...api});
  s.page.options={id:'a'};return s;
}
(async()=>{
  await check('B01 北京仍是当天时保留当天有排班门店',async o=>{
    assert.equal(new Clock().getDate(),19);
    const s=loadPage('store-select.js',create(),{
      getStores:async()=>[{id:'1',status:'open'}],getDoctors:async()=>[{id:'d',storeIds:['1']}],
      getScheduleDates:async()=>['2026-11-18'],
    });
    s.page.getLocation=async()=>null;await s.page.loadPage();
    o.stores=s.page.data.stores.length;assert.equal(o.stores,1);
  });
  await check('B02 时段页优先选择北京时间当天',async o=>{
    const dates=['2026-11-18','2026-11-19'];
    const s=loadPage('time-select.js',create(),{getScheduleDates:async()=>dates,getDoctors:async()=>[],getDaySlots:async()=>[]});
    s.page.options={doctorId:'d',storeId:'1'};await s.page.loadPage();
    o.selected=s.page.data.selectedDate;assert.equal(o.selected,dates[0]);
  });
  await check('B03 无就诊人时确认页不发送创建请求',async o=>{
    const h=create(),api=confirmApi(h);let calls=0;
    api.getFamilyMembers=async()=>[];api.createAppointment=async()=>{calls++;};
    const s=loadPage('confirm.js',h,api);await s.page.loadPage();await s.page.submitAppointment();
    o.calls=calls;assert.equal(calls,0);
  });
  await check('B04 明确拒绝创建后可提交同一草稿',async o=>{
    const h=create(),api=confirmApi(h);let calls=0;
    api.getFamilyMembers=async()=>members;api.createAppointment=async()=>{
      if(++calls===1)throw Object.assign(Error('时段已满'),{statusCode:400});
      return {data:{id:'created',status:'pending'}};
    };
    const s=loadPage('confirm.js',h,api);await s.page.loadPage();await s.page.submitAppointment();await s.page.submitAppointment();
    o.calls=calls;assert.equal(calls,2);assert.ok(s.nav.some(url=>url.includes('success')));
  });
  await check('B05 补充门店接口超时不遮住已知预约结果',async o=>{
    const s=loadPage('success.js',create(),{getBookingSettings:async()=>({}),getStores:async()=>{throw Error('超时');},
      getAppointmentDetail:async()=>({data:{appointment:{...record,storeName:'预约门店'}}})});
    s.page.options={id:'a'};await s.page.loadPage();
    o.store=s.page.data.storeName;assert.equal(o.store,'预约门店');assert.equal(s.page.data.loadError,'');
  });
  await check('B06 支付确认失败时不给成功提示且释放锁',async o=>{
    const s=loadPage('booking/index.js',create(),{payAppointmentDeposit:async()=>({data:{timeStamp:'fixture'}}),
      confirmAppointmentPayment:async()=>{throw Error('支付状态核对超时');}});
    await s.page.handlePrimaryAction({detail:{...record,status:'pending_payment'}});
    o.toasts=s.toasts;assert.ok(o.toasts.includes('支付状态核对超时'));assert.equal(s.page.appointmentPaymentInProgress,false);
  });
  for(const page of ['booking/index.js','detail.js'])await check('B07 取消弹窗跨过截止后确认 '+page,async o=>{
    now=Date.parse('2026-11-20T06:59:00+08:00');let calls=0;
    const api={cancelAppointment:async()=>{calls++;}};
    const s=page==='detail.js'?detail(create(),api):loadPage(page,create(),api);
    if(page==='detail.js')await s.page.loadPage();
    const pending=page==='detail.js'?s.page.cancelAppointment():s.page.cancelAppointment({detail:record});
    assert.equal(s.modals.length,1);
    now=Date.parse('2026-11-20T07:01:00+08:00');
    await s.modals[0].success({confirm:true});await pending;
    Object.assign(o,{calls,toasts:s.toasts});assert.equal(calls,0);
    assert.ok(o.toasts.some(title=>title.includes('不支持取消')||title.includes('超过取消截止')));
  });
  await check('B08 改约静默刷新保留仍可预约的已选日期',async o=>{
    const s=loadPage('reschedule.js',create(),{
      getAppointmentDetail:async()=>({data:{appointment:{...record,doctorId:'d',storeId:'1'}}}),
      getScheduleDates:async()=>['2026-11-20','2026-11-21'],
      getSchedules:async({startDate})=>[{id:startDate,status:'available'}],
      getTimeSlots:async()=>[{id:'slot',label:'10:00-10:30',status:'available'}],
    });
    s.page.options={id:'a'};await s.page.loadPage();await s.page.selectDate({detail:'2026-11-21'});
    assert.equal(s.page.data.selectedDate,'2026-11-21');
    await s.page.onShow();
    o.selected=s.page.data.selectedDate;assert.equal(o.selected,'2026-11-21');
  });
  fs.writeFileSync(path.join(__dirname,output,'results.json'),JSON.stringify(results,null,2));
  for(const r of results)console.log(r.passed?'PASS':'FAIL',r.id,JSON.stringify(r.observed),r.error||'');
  process.exitCode=results.some(r=>!r.passed)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
