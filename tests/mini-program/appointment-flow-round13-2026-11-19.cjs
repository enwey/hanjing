const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const helper=path.join(__dirname,'appointment-audit-2026-11-18.cjs');
const destination=process.env.APPOINTMENT_ROUND13_OUTPUT || 'artifacts/appointment-flow-round13-2026-11-19';
const fixture={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8').split('\n(async()=>{')[0].replace('artifacts/appointment-audit-2026-11-18',destination)
  +'\nmodule.exports={create,loadPage,gate,tick};',{module:fixture,require:createRequire(helper),__dirname,Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout});
const {create,loadPage,gate,tick}=fixture.exports;
const source=fs.readFileSync(path.join(__dirname,'../../hanjing-clinic-backend/routes/client.js'),'utf8');
const routeSource=source.slice(source.indexOf('async function queryAppointmentOrderBeforePay('),source.indexOf("app.post('/api/v1/appointments/pay-callback'"));
const record={id:'a',status:'pending_payment',appointment_no:'legacy-a',appointmentDate:'2099-01-01',appointmentTime:'09:00-09:30',appointmentCharge:{canPay:true}};
const key='rewrite_appointment_payment_submitted:a';
const error=(message,statusCode,data)=>Object.assign(Error(message),{statusCode,data});
const missing=()=>error('不存在',404,{code:'ORDER_NOT_EXIST'});
const routes=(scenario,log)=>{
  let status='pending_payment',gatewayPaid=false,charge=scenario==='legacy-paid'?null:{id:1,charge_no:'charge-a'},attempt=0;
  const handlers={};const settle=()=>{status='pending';log.push('settle');return {status:'paid'};};
  vm.runInNewContext(routeSource,{
    app:{post(url,_auth,fn){handlers[url.split('/').at(-1)]=fn;}},authenticateWxToken(){},businessError:error,
    transaction:async fn=>fn({execute:async(sql,params)=>{
      if(sql.startsWith('UPDATE appointment_charges')){
        assert.deepEqual(Array.from(params),[1,'a','charge-a']);log.push('retire:charge-a');charge=null;return [{affectedRows:1}];
      }
      return [[{...record,status}]];
    }}),
    get:async sql=>sql.includes('appointment_charges')?charge:{...record,status},
    assertAppointmentFeesPaid:async()=>{},prepareCharge:async()=>charge||={id:2,charge_no:'charge-b'},chargeAmount:()=>8000,
    queryOrderByOutTradeNo:async no=>{
      log.push(`query:${no}`);
      if(no===record.appointment_no){
        if(scenario==='legacy-timeout')throw error('旧单查单超时',504);
        if(scenario==='legacy-processing')return {trade_state:'USERPAYING',out_trade_no:no};
        if(scenario==='closed-legacy')return {trade_state:'CLOSED',out_trade_no:no};
        if(scenario==='legacy-paid')return {trade_state:'SUCCESS',out_trade_no:no};
        throw missing();
      }
      if(scenario==='wrong-closed-number')return {trade_state:'CLOSED',out_trade_no:'wrong'};
      if(scenario==='replacement-processing')return {trade_state:no==='charge-a'?'CLOSED':'USERPAYING',out_trade_no:no};
      if(scenario==='closed')return {trade_state:no==='charge-a'?'CLOSED':gatewayPaid?'SUCCESS':'NOTPAY',out_trade_no:no};
      if(scenario==='legacy-paid')throw missing();
      if(!gatewayPaid)throw missing();
      if(attempt===1)throw error('同步超时',504);
      if(attempt===2&&scenario==='timeout-recovery')throw error('查单超时',504);
      if(attempt===2&&scenario==='processing-recovery')return {trade_state:'USERPAYING'};
      return {trade_state:'SUCCESS',out_trade_no:no};
    },
    run:async()=>({changes:1}),
    serviceBuildPaymentParams:async(_name,_amount,no)=>{log.push('build');if(scenario==='closed')assert.equal(no,'charge-b');return {timeStamp:'1',nonceStr:'n',package:'prepay_id=fixture',paySign:'s'};},
    settleOnlineCharge:async()=>settle(),finalizePaidAppointment:async()=>{settle(); return true;},console:{error(){}},
  });
  return {getStatus:()=>status,setAttempt:n=>{attempt=n;},gatewayPaid:()=>{gatewayPaid=true;},async request(action){
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
    await handlers[action]({params:{id:'a'},user:{id:1,openid:'fixture'}},res);
    if(res.statusCode!==200)throw error(res.body.message,res.statusCode);
    return res.body;
  }};
};
const base={getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({})};
const results=[];
async function check(id,fn){const observed={};try{await fn(observed);results.push({id,passed:true,observed});}
  catch(e){results.push({id,passed:false,observed,error:e.message});}console.log(JSON.stringify(results.at(-1)));}
async function replay(first,second,scenario,o){
  const log=[];const server=routes(scenario,log);const row=()=>({...record,status:server.getStatus()});
  const api={...base,getAppointments:async()=>[row()],getAppointmentDetail:async()=>({data:{appointment:row()}}),
    payAppointmentDeposit:()=>server.request('pay'),confirmAppointmentPayment:()=>server.request('confirm-pay')};
  async function open(session,where){
    const h=loadPage(where==='list'?'booking/index.js':'detail.js',session,api,{requestPayment:r=>{log.push('wechat');server.gatewayPaid();r.success({});}});
    h.page.options={id:'a'};await h.page.loadPage();
    return {h,pay:()=>where==='list'?h.page.handlePrimaryAction({detail:h.page.data.upcomingAppointments[0]}):h.page.payDeposit()};
  }
  const firstSession=create();
  if(!['legacy-paid','closed'].includes(scenario)){
    // Reject persistence in the real payment-receipt module's storage adapter.
    const set=firstSession.storage.set.bind(firstSession.storage);
    firstSession.storage.set=(k,v)=>{if(k===key)throw Error('存储不可写');return set(k,v);};
    server.setAttempt(1);const a=await open(firstSession,first);await a.pay();a.h.page.onUnload();
    assert.equal(log.filter(x=>x==='wechat').length,1);
  }
  const fresh=create();fresh.storage.clear();for(const [k,v] of firstSession.storage)fresh.storage.set(k,structuredClone(v));
  assert.equal(fresh.storage.has(key),false);server.setAttempt(2);const b=await open(fresh,second);
  const mark=log.length;await b.pay();o.firstRetry=log.slice(mark);o.firstToast=b.h.toasts.at(-1);
  if(!['legacy-paid','closed'].includes(scenario)){server.setAttempt(3);await b.pay();}
  Object.assign(o,{afterRestart:log.slice(mark),status:server.getStatus(),toasts:b.h.toasts});
  if(scenario==='closed')assert.deepEqual(o.afterRestart,['query:legacy-a','query:charge-a','retire:charge-a','query:charge-b','build','wechat','query:charge-b','settle']);
  else assert.ok(!o.afterRestart.includes('wechat')&&!o.afterRestart.includes('build'),'重启后再次生成支付参数或拉起微信支付');
  if(scenario==='legacy-paid')assert.deepEqual(o.afterRestart,['query:legacy-a','settle']);
  assert.equal(o.status,'pending');
}
(async()=>{
  for(const [first,second] of [['list','detail'],['detail','list']]){
    await check(`M01-timeout-recovery-${second}`,o=>replay(first,second,'timeout-recovery',o));
    await check(`M02-processing-recovery-${second}`,o=>replay(first,second,'processing-recovery',o));
    await check(`M03-legacy-paid-${second}`,o=>replay(first,second,'legacy-paid',o));
    await check(`M04-closed-order-${second}`,o=>replay(first,second,'closed',o));
  }
  await check('M05-late-store-response-does-not-overwrite-new-result',async o=>{
    const stores=gate();const h=loadPage('success.js',create(),{...base,getStores:()=>stores.promise,
      getAppointmentDetail:async id=>({data:{appointment:{...record,id,status:'pending',storeId:id},...(id==='b'?{store:{name:'新门店'}}:{})}})});
    h.page.options={id:'a'};await h.page.loadPage();await tick();
    h.page.options={id:'b'};await h.page.loadPage();stores.resolve([{id:'a',name:'旧门店'}]);await tick();
    Object.assign(o,{id:h.page.data.appointmentId,storeName:h.page.data.storeName});
    assert.deepEqual(o,{id:'b',storeName:'新门店'});
  });
  if(process.env.APPOINTMENT_ROUND13_EXTENDED==='1'){
    for(const [scenario,code,expected] of [
      ['legacy-timeout',504,['query:legacy-a']],
      ['legacy-processing',409,['query:legacy-a']],
      ['wrong-closed-number',409,['query:legacy-a','query:charge-a']],
      ['replacement-processing',409,['query:legacy-a','query:charge-a','retire:charge-a','query:charge-b']],
    ])await check(`M06-${scenario}`,async o=>{
      const log=[],server=routes(scenario,log);
      await assert.rejects(server.request('pay'),error=>{o.code=error.statusCode;return o.code===code;});
      o.calls=log;assert.deepEqual(log,expected);
    });
  }
  fs.writeFileSync(path.join(__dirname,destination,'new-cases.json'),JSON.stringify(results,null,2));
  process.exitCode=results.some(r=>!r.passed)?1:0;
})().catch(e=>{console.error(e);process.exitCode=2;});
