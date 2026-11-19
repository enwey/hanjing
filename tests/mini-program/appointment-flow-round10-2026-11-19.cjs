const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const helper = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const destination = process.env.APPOINTMENT_ROUND10_OUTPUT || 'artifacts/appointment-flow-round10-2026-11-19';
const fixture = { exports: {} };
vm.runInNewContext(fs.readFileSync(helper, 'utf8').split('\n(async()=>{')[0]
  .replace('artifacts/appointment-audit-2026-11-18', destination) + '\nmodule.exports={create,loadPage,tick};', {
  require: createRequire(helper), __dirname, module: fixture, Buffer, console, structuredClone,
  queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const {create, loadPage, tick} = fixture.exports;
const record = {id:'a', status:'pending', appointmentDate:'2099-01-01', appointmentTime:'09:00-09:30'};
const results = [];
async function check(id, run) {
  const observed = {};
  try { await run(observed); results.push({id, passed:true, observed}); }
  catch (error) { results.push({id, passed:false, observed, error:error.message}); }
  console.log(results.at(-1));
}
function list(api, options) {
  return loadPage('booking/index.js', create(), {
    getStores:async()=>[], getDoctors:async()=>[], getBookingSettings:async()=>({}), ...api,
  }, options);
}
(async()=>{
  for (const next of ['cancelled','pending']) {
    await check(`J01-list-cancel-${next}`, async o=>{
      let current=record, calls=0;
      const h=list({getAppointments:async()=>[current], cancelAppointment:async()=>{ calls++; throw Error('后端拒绝'); }});
      await h.page.loadPage();
      const old=h.page.data.upcomingAppointments[0];
      await h.page.cancelAppointment({detail:old});
      current={...record,status:next, ...(next==='pending'?{appointmentDate:'2000-01-01'}:{})};
      await h.page.loadPage({silent:true});
      await h.modals[0].success({confirm:true});
      Object.assign(o,{latestStatus:current.status, latestDate:current.appointmentDate,calls,toasts:h.toasts});
      assert.equal(calls,0);
    });
  }
  for (const file of ['booking/index.js','detail.js']) {
    await check(`J02-pay-retry-${file}`,async o=>{
      const appt={...record,status:'pending_payment',appointmentCharge:{canPay:true}};
      let prepay=0,native=0,confirm=0;
      const api={getAppointments:async()=>[appt],getBookingSettings:async()=>({}),
        getAppointmentDetail:async()=>({data:{appointment:appt}}),
        payAppointmentDeposit:async()=>{prepay++;return {timeStamp:'1',nonceStr:'n',package:'prepay_id=x',paySign:'s'};},
        confirmAppointmentPayment:async()=>{confirm++;throw Error('同步超时');}};
      const opts={requestPayment:r=>{native++;r.success({});}};
      const h=file==='detail.js'?loadPage(file,create(),api,opts):list(api,opts);
      h.page.options={id:'a'};
      await h.page.loadPage();
      const pay=()=>file==='detail.js'?h.page.payDeposit():h.page.handlePrimaryAction({detail:h.page.data.upcomingAppointments[0]});
      await pay(); await pay();
      Object.assign(o,{prepay,native,confirm,toasts:h.toasts});
      assert.deepEqual({prepay,native,confirm},{prepay:1,native:1,confirm:2});
    });
  }
  await check('J03-manual-refresh-loses-visible-records',async o=>{
    let fail=false;
    const h=list({getAppointments:async()=>{if(fail) throw Error('预约列表超时');return [record];}});
    await h.page.loadPage();
    o.before=h.page.data.upcomingAppointments.length;
    fail=true;await h.page.onPullDownRefresh();
    Object.assign(o,{after:h.page.data.upcomingAppointments.length,error:h.page.data.loadError,toasts:h.toasts});
    assert.equal(o.before,1);assert.equal(o.after,1);
    assert.ok(o.toasts.includes('预约列表刷新失败，请下拉重试'));
  });
  await check('J04-list-waits-for-store-catalog',async o=>{
    let rejectStores,calls=0; const stores=new Promise((_,reject)=>{rejectStores=reject;});
    const h=list({getStores:()=>stores,getAppointments:async()=>{calls++;return [record];}});
    const load=h.page.loadPage();await tick();
    Object.assign(o,{appointmentCallsBeforeStoreFailure:calls,loadingBeforeStoreFailure:h.page.data.loading});
    rejectStores(Error('门店超时'));await load;
    o.recordsAfterFailure=h.page.data.upcomingAppointments.length;
    assert.equal(o.recordsAfterFailure,1);
    assert.equal(o.appointmentCallsBeforeStoreFailure,1);
  });
  await check('J05-list-refresh-recovers',async o=>{
    let fail=true;
    const h=list({getAppointments:async()=>{if(fail)throw Error('预约列表超时');return [record];}});
    await h.page.onPullDownRefresh();o.firstError=h.page.data.loadError;
    fail=false;await h.page.onPullDownRefresh();
    Object.assign(o,{count:h.page.data.upcomingAppointments.length,error:h.page.data.loadError});
    assert.equal(o.firstError,'预约列表超时');assert.equal(o.count,1);assert.equal(o.error,'');
  });
  await check('J06-list-cancel-still-allowed-after-unchanged-refresh',async o=>{
    let calls=0;
    const h=list({getAppointments:async()=>[{...record}],cancelAppointment:async()=>{calls++;}});
    await h.page.loadPage();await h.page.cancelAppointment({detail:h.page.data.upcomingAppointments[0]});
    await h.page.loadPage({silent:true});await h.modals[0].success({confirm:true});o.calls=calls;
    assert.equal(calls,1);
  });
  if (process.env.APPOINTMENT_ROUND10_EXTENDED === '1') {
    for (const first of ['list','detail']) {
      await check(`J02-cross-entry-${first}`, async o => {
        const session=create();
        let status='pending_payment', prepay=0, native=0, confirm=0;
        const appt=()=>({...record,status,appointmentCharge:{canPay:true}});
        const api={getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),
          getAppointments:async()=>[appt()],getAppointmentDetail:async()=>({data:{appointment:appt()}}),
          payAppointmentDeposit:async()=>{prepay++;return {timeStamp:'1',nonceStr:'n',package:'prepay_id=x',paySign:'s'};},
          confirmAppointmentPayment:async()=>{if(++confirm===1)throw Error('同步超时');status='pending';}};
        const open=async kind=>{
          const h=loadPage(kind==='list'?'booking/index.js':'detail.js',session,api,
            {requestPayment:r=>{native++;r.success({});}});
          h.page.options={id:record.id};await h.page.loadPage();
          return {h,pay:()=>kind==='list'?h.page.handlePrimaryAction({detail:h.page.data.upcomingAppointments[0]}):h.page.payDeposit()};
        };
        const a=await open(first);await a.pay();a.h.page.onUnload();
        const second=first==='list'?'detail':'list';
        const b=await open(second);await b.pay();
        Object.assign(o,{prepay,native,confirm,status:second==='list'?b.h.page.data.upcomingAppointments[0].status:b.h.page.data.statusKey});
        assert.deepEqual(o,{prepay:1,native:1,confirm:2,status:'pending'});
      });
    }
  }
  fs.writeFileSync(path.join(__dirname,destination,'new-cases.json'),JSON.stringify(results,null,2));
  process.exitCode=results.some(x=>!x.passed)?1:0;
})().catch(error=>{console.error(error);process.exitCode=2;});
