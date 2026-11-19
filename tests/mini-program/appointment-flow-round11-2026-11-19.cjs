const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const helper=path.join(__dirname,'appointment-audit-2026-11-18.cjs');
const dest=process.env.APPOINTMENT_ROUND11_OUTPUT || 'artifacts/appointment-flow-round11-2026-11-19';
const fixture={exports:{}};
const script=fs.readFileSync(helper,'utf8').split('\n(async()=>{')[0]
  .replace('artifacts/appointment-audit-2026-11-18',dest)
  .replace('setStorageSync: (k,v) => h.storage.set(k,v)', 'setStorageSync: (k,v) => { options.beforeStorageWrite?.(k,v); h.storage.set(k,v); }');
vm.runInNewContext(script+'\nmodule.exports={create,loadPage,gate,tick};',{
  module:fixture,require:createRequire(helper),__dirname,Buffer,console,structuredClone,
  queueMicrotask,setImmediate,setTimeout,clearTimeout,
});
const {create,loadPage,gate,tick}=fixture.exports;
const results=[];
const record={id:'a',status:'pending',storeId:'s',doctorId:'d',appointmentDate:'2099-01-01',appointmentTime:'09:00-09:30'};
const basic={getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),getAppointments:async()=>[record]};
const list=(api={})=>loadPage('booking/index.js',create(),{...basic,...api});
const result=(appt,api={})=>{
  const h=loadPage('success.js',create(),{...basic,getAppointmentDetail:async()=>({data:{appointment:appt,store:{name:'甲门店'}}}),...api});
  h.page.options={id:appt.id};return h;
};
async function check(id,run){
  const observed={};try{await run(observed);results.push({id,passed:true,observed});}
  catch(error){results.push({id,passed:false,observed,error:error.message});}
  console.log(JSON.stringify(results.at(-1)));
}
(async()=>{
  await check('K01-cancel-before-settings',async o=>{
    const settings=gate(); let calls=0;
    const china=new Date(Date.now()+11*3600000).toISOString();
    const row={...record,appointmentDate:china.slice(0,10),appointmentTime:china.slice(11,16)};
    const h=list({getBookingSettings:()=>settings.promise,getAppointments:async()=>[row],cancelAppointment:async()=>{calls++;throw Error('超过4小时取消截止');}});
    await h.page.loadPage();await h.page.cancelAppointment({detail:h.page.data.upcomingAppointments[0]});
    o.cutoffBefore=h.page.data.cancelLimitHours;o.modals=h.modals.length;
    if(h.modals.length)await h.modals[0].success({confirm:true});
    settings.resolve({cancelLimitHours:4});await tick();
    Object.assign(o,{calls,cutoffAfter:h.page.data.cancelLimitHours,toasts:h.toasts});assert.equal(calls,0);
  });
  await check('K02-refresh-drops-catalog-labels',async o=>{
    let refresh=false;
    const h=list({getStores:async()=>{if(refresh)throw Error('门店超时');return [{id:'s',name:'甲门店'}];},
      getDoctors:async()=>{if(refresh)throw Error('医生超时');return [{id:'d',name:'甲医生'}];}});
    const names=()=>{const a=h.page.data.upcomingAppointments[0];return [a.storeName,a.doctorName];};
    await h.page.loadPage();await tick();o.before=names();refresh=true;
    await h.page.onPullDownRefresh();await tick();o.after=names();
    assert.deepEqual(o.before,['甲门店','甲医生']);assert.deepEqual(o.after,o.before);
  });
  await check('K03-result-waits-for-settings',async o=>{
    const settings=gate(); const h=result(record,{getBookingSettings:()=>settings.promise});
    const load=h.page.loadPage();await tick();o.visibleBeforeSettings=!!h.page.data.appointment;o.loading=h.page.data.loading;
    settings.resolve({});await load;o.visibleAfterSettings=!!h.page.data.appointment;
    assert.equal(o.visibleAfterSettings,true);assert.equal(o.visibleBeforeSettings,true);
  });
  await check('K04-reminded-result',async o=>{
    const h=result({...record,status:'reminded'});await h.page.loadPage();
    Object.assign(o,{visible:!!h.page.data.appointment,error:h.page.data.loadError,retry:h.page.data.canRetryLoad});
    assert.equal(o.visible,true);
  });
  for(const kind of ['list','detail']) await check(`K05-payment-receipt-write-fails-${kind}`,async o=>{
    const appt={...record,status:'pending_payment',appointmentCharge:{canPay:true}};
    let writes=0,prepay=0,native=0,confirm=0;
    const h=loadPage(kind==='list'?'booking/index.js':'detail.js',create(),{
      ...basic,getAppointments:async()=>[appt],getAppointmentDetail:async()=>({data:{appointment:appt}}),
      payAppointmentDeposit:async()=>{prepay++;return {timeStamp:'1',nonceStr:'n',package:'prepay_id=x',paySign:'s'};},
      confirmAppointmentPayment:async()=>{confirm++;throw Error('同步超时');},
    },{beforeStorageWrite(k){if(k.startsWith('rewrite_appointment_payment_submitted:') && ++writes===1)throw Error('本地存储写入失败');},
      requestPayment(r){native++;r.success({});}});
    h.page.options={id:'a'};await h.page.loadPage();
    const pay=()=>kind==='list'?h.page.handlePrimaryAction({detail:h.page.data.upcomingAppointments[0]}):h.page.payDeposit();
    await pay();o.confirmAfterFirst=confirm;await pay();Object.assign(o,{prepay,native,confirm,toasts:h.toasts});
    assert.deepEqual({prepay,native,confirm,first:o.confirmAfterFirst},{prepay:1,native:1,confirm:2,first:1});
  });
  if (process.env.APPOINTMENT_ROUND11_EXTENDED === '1') for (const first of ['list', 'detail']) {
    await check(`K05-storage-failure-cross-entry-${first}`, async o => {
      const session=create();let status='pending_payment',prepay=0,native=0,confirm=0,writeFailures=0;
      const row=()=>({...record,status,appointmentCharge:{canPay:true}});
      const api={...basic,getAppointments:async()=>[row()],getAppointmentDetail:async()=>({data:{appointment:row()}}),
        payAppointmentDeposit:async()=>{prepay++;return {timeStamp:'1',nonceStr:'n',package:'prepay_id=x',paySign:'s'};},
        confirmAppointmentPayment:async()=>{if(++confirm===1)throw Error('同步超时');status='pending';}};
      const open=async kind=>{
        const h=loadPage(kind==='list'?'booking/index.js':'detail.js',session,api,{
          beforeStorageWrite(k){if(k.startsWith('rewrite_appointment_payment_submitted:')){writeFailures++;throw Error('存储不可写');}},
          requestPayment(r){native++;r.success({});}});
        h.page.options={id:'a'};await h.page.loadPage();
        return {h,pay:()=>kind==='list'?h.page.handlePrimaryAction({detail:h.page.data.upcomingAppointments[0]}):h.page.payDeposit()};
      };
      const a=await open(first);await a.pay();a.h.page.onUnload();
      const second=first==='list'?'detail':'list';const b=await open(second);await b.pay();
      Object.assign(o,{writeFailures,prepay,native,confirm,status:second==='list'?b.h.page.data.upcomingAppointments[0].status:b.h.page.data.statusKey});
      assert.deepEqual(o,{writeFailures:1,prepay:1,native:1,confirm:2,status:'pending'});
    });
  }
  await check('K06-settings-arrive-before-cancel-confirm',async o=>{
    const settings=gate();let calls=0;const china=new Date(Date.now()+11*3600000).toISOString();
    const row={...record,appointmentDate:china.slice(0,10),appointmentTime:china.slice(11,16)};
    const h=list({getBookingSettings:()=>settings.promise,getAppointments:async()=>[row],cancelAppointment:async()=>{calls++;}});
    await h.page.loadPage();await h.page.cancelAppointment({detail:h.page.data.upcomingAppointments[0]});
    settings.resolve({cancelLimitHours:4});await tick();
    if(h.modals.length) await h.modals[0].success({confirm:true});
    else await h.page.cancelAppointment({detail:h.page.data.upcomingAppointments[0]});
    Object.assign(o,{calls,toasts:h.toasts});assert.equal(calls,0);assert.match(h.toasts.at(-1),/4小时/);
  });
  await check('K07-late-catalog-enriches-list',async o=>{
    const stores=gate(); const h=list({getStores:()=>stores.promise});
    await h.page.loadPage();o.count=h.page.data.upcomingAppointments.length;
    stores.resolve([{id:'s',name:'甲门店'}]);await tick();o.store=h.page.data.upcomingAppointments[0].storeName;
    assert.equal(o.count,1);assert.equal(o.store,'甲门店');
  });
  fs.writeFileSync(path.join(__dirname,dest,'new-cases.json'),JSON.stringify(results,null,2));
  process.exitCode=results.some(x=>!x.passed)?1:0;
})().catch(e=>{console.error(e);process.exitCode=2;});
