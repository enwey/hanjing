const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const helper = path.join(__dirname,'appointment-audit-2026-11-18.cjs');
const dest = process.env.APPOINTMENT_ROUND12_OUTPUT || 'artifacts/appointment-flow-round12-2026-11-19';
const fixture = {exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8').split('\n(async()=>{')[0]
  .replace('artifacts/appointment-audit-2026-11-18',dest)
  .replace('getStorageSync: k => h.storage.get(k), setStorageSync: (k,v) => h.storage.set(k,v)',
    'getStorageSync: k => { options.beforeStorageRead?.(k); return h.storage.get(k); }, setStorageSync: (k,v) => { options.beforeStorageWrite?.(k); h.storage.set(k,v); }')
  + '\nmodule.exports={create,loadPage,gate,tick};',{
    module:fixture,require:createRequire(helper),__dirname,Buffer,console,structuredClone,
    queueMicrotask,setImmediate,setTimeout,clearTimeout,
  });
const {create,loadPage,gate,tick}=fixture.exports;
const record={id:'restart-a',status:'pending_payment',appointmentCharge:{canPay:true},
  appointmentDate:'2099-01-01',appointmentTime:'09:00-09:30',storeId:'s',storeName:'甲门店'};
const key='rewrite_appointment_payment_submitted:'+record.id;
const base={getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({})};
const results=[];
async function check(id,fn){
  const observed={};
  try{await fn(observed);results.push({id,passed:true,observed});}
  catch(error){results.push({id,passed:false,observed,error:error.message});}
  console.log(JSON.stringify(results.at(-1)));
}
function makePayRoute(getStatus, setStatus, calls, scenario) {
  const source=fs.readFileSync(path.join(__dirname,'../../hanjing-clinic-backend/routes/client.js'),'utf8');
  const code=source.slice(source.indexOf('async function queryAppointmentOrderBeforePay('),source.indexOf('// 13.6 Confirm Appointment Payment'));
  const charge={charge_no:'fixture-charge'};let built=0,queried=0,handler;
  const error=(message,statusCode,data)=>Object.assign(Error(message),{statusCode,data});
  vm.runInNewContext(code,{
    app:{post(_path,_auth,fn){handler=fn;}},authenticateWxToken(){},businessError:error,
    transaction:async fn=>fn({execute:async()=>[[{status:getStatus()}]]}),
    prepareCharge:async()=>charge,chargeAmount:()=>8000,assertAppointmentFeesPaid:async()=>{},
    queryOrderByOutTradeNo:async no=>{
      assert.equal(no,charge.charge_no);calls.push('query');queried++;
      if(queried===1)throw error('不存在',404,{code:'ORDER_NOT_EXIST'});
      if(scenario==='route-race'&&queried===2)return {trade_state:'NOTPAY',out_trade_no:charge.charge_no};
      return {trade_state:'SUCCESS',out_trade_no:charge.charge_no};
    },
    run:async()=>({changes:1}),
    serviceBuildPaymentParams:async()=>{
      calls.push('build');if(++built===2&&scenario==='route-race')throw error('微信订单已支付',400,{code:'ORDERPAID'});
      return {timeStamp:'1',nonceStr:'n',package:'prepay_id=fixture',paySign:'s'};
    },
    settleOnlineCharge:async()=>{calls.push('settle');setStatus('pending');return {status:'paid'};},console:{error(){}},
  });
  return async id=>{
    const response={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
    await handler({params:{id},user:{id:1,openid:'fixture'}},response);
    if(response.statusCode!==200)throw error(response.body.message,response.statusCode);
    return response.body;
  };
}
async function restart(first,second,scenario,o){
  const calls=[],routeCalls=[];let status='pending_payment',phase=1;
  const useRoute=process.env.APPOINTMENT_ROUND12_ACTUAL_ROUTE==='1'&&['write-failed','read-failed','route-race'].includes(scenario);
  const actualPay=useRoute?makePayRoute(()=>status,next=>{status=next;},routeCalls,scenario):null;
  const row=()=>({...record,status});
  const api={...base,getAppointments:async()=>[row()],getAppointmentDetail:async()=>({data:{appointment:row()}}),
    payAppointmentDeposit:async()=>{
      calls.push('prepay');
      if(actualPay)return actualPay(record.id);
      if(phase===2&&scenario==='prepay-rejected')throw Error('微信订单已支付');
      if(phase===2&&['write-failed','read-failed'].includes(scenario)&&process.env.APPOINTMENT_ROUND12_FIXED_API==='1'){
        status='pending';return {data:{alreadyPaid:true}};
      }
      return {timeStamp:'1',nonceStr:'n',package:'prepay_id=fixture',paySign:'s'};
    },
    confirmAppointmentPayment:async()=>{
      calls.push('confirm');
      if(phase===1&&scenario!=='server-synced')throw Error('同步超时');
      status='pending';
    },
  };
  async function open(kind,session){
    const h=loadPage(kind==='list'?'booking/index.js':'detail.js',session,api,{
      beforeStorageWrite(k){if(k===key&&['write-failed','server-synced','prepay-rejected','route-race'].includes(scenario))throw Error('本地写入失败');},
      beforeStorageRead(k){if(k===key&&phase===2&&scenario==='read-failed')throw Error('本地读取失败');},
      requestPayment(r){calls.push('wechat');r.success({});},
    });
    h.page.options={id:record.id};await h.page.loadPage();
    const pay=()=>kind==='list'?h.page.handlePrimaryAction({detail:h.page.data.upcomingAppointments[0]}):h.page.payDeposit();
    return {h,pay};
  }
  const old=create();const a=await open(first,old);await a.pay();a.h.page.onUnload();
  const before=calls.slice();
  // Recreate both the session and module cache; carry over only persisted storage values.
  const fresh=create();fresh.storage.clear();
  for(const [k,v] of old.storage)fresh.storage.set(k,structuredClone(v));
  phase=2;const b=await open(second,fresh);
  assert.notEqual(fresh.paymentReceipt,old.paymentReceipt);
  o.persistedBeforeRestart=fresh.storage.has(key);
  o.statusBeforeRetry=second==='list'?b.h.page.data.upcomingAppointments[0].status:b.h.page.data.statusKey;
  if(o.statusBeforeRetry==='pending_payment')await b.pay();
  Object.assign(o,{before,after:calls.slice(before.length),toasts:b.h.toasts,
    statusAfter:second==='list'?b.h.page.data.upcomingAppointments[0].status:b.h.page.data.statusKey});
  assert.deepEqual(before,['prepay','wechat','confirm']);
  assert.equal(o.persistedBeforeRestart,['write-ok','read-failed'].includes(scenario));
  if(useRoute){
    o.routeCalls=routeCalls;
    assert.deepEqual(routeCalls,scenario==='route-race'?['query','build','query','build','query','settle']:['query','build','query','settle']);
  }
  const expected=useRoute?['prepay']:scenario==='server-synced'?[]:scenario==='prepay-rejected'?['prepay','confirm']:
    ['write-failed','read-failed'].includes(scenario)&&process.env.APPOINTMENT_ROUND12_FIXED_API==='1'?['prepay']:['confirm'];
  assert.deepEqual(o.after,expected);
  assert.equal(o.statusAfter,'pending');
}
(async()=>{
  for(const [first,second] of [['list','list'],['detail','detail'],['list','detail'],['detail','list']])
    await check(`L01-write-failed-${first}-${second}`,o=>restart(first,second,'write-failed',o));
  for(const [first,second] of [['list','detail'],['detail','list']]){
    await check(`L02-marker-persists-${first}-${second}`,o=>restart(first,second,'write-ok',o));
    await check(`L03-server-synced-${first}-${second}`,o=>restart(first,second,'server-synced',o));
    await check(`L04-marker-read-fails-${first}-${second}`,o=>restart(first,second,'read-failed',o));
    await check(`L05-prepay-rejected-${first}-${second}`,o=>restart(first,second,'prepay-rejected',o));
    if(process.env.APPOINTMENT_ROUND12_ACTUAL_ROUTE==='1')await check(`L05-route-race-${first}-${second}`,o=>restart(first,second,'route-race',o));
  }
  await check('L06-result-waits-for-store-directory',async o=>{
    const stores=gate();const h=loadPage('success.js',create(),{...base,getStores:()=>stores.promise,
      getAppointmentDetail:async()=>({data:{appointment:{...record,status:'pending'}}})});
    h.page.options={id:record.id};const load=h.page.loadPage();await tick();
    Object.assign(o,{visibleBefore:!!h.page.data.appointment,loadingBefore:h.page.data.loading});
    stores.resolve([]);await load;o.visibleAfter=!!h.page.data.appointment;o.storeName=h.page.data.storeName;
    assert.equal(o.visibleAfter,true); assert.equal(o.visibleBefore,true);
  });
  fs.writeFileSync(path.join(__dirname,dest,'new-cases.json'),JSON.stringify(results,null,2));
  process.exitCode=results.some(x=>!x.passed)?1:0;
})().catch(e=>{console.error(e);process.exitCode=2;});
