const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const helper=path.join(__dirname,'appointment-audit-2026-11-18.cjs');
const dest=process.env.APPOINTMENT_ROUND15_OUTPUT || 'artifacts/appointment-flow-round15-fix-2026-11-19';
const fixture={exports:{}};
vm.runInNewContext(fs.readFileSync(helper,'utf8').split('\n(async()=>{')[0].replace('artifacts/appointment-audit-2026-11-18',dest)
  +'\nmodule.exports={create,loadPage,gate,tick};',{module:fixture,require:createRequire(helper),__dirname,Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout});
const {create,loadPage,gate,tick}=fixture.exports;
const files=(file)=>fs.readFileSync(path.join(__dirname,'../../hanjing-clinic-backend',file),'utf8');
const source=files('routes/client.js'), charges=files('appointment-charges.js');
const route=source.slice(source.indexOf('async function queryAppointmentOrderBeforePay('),source.indexOf("app.post('/api/v1/appointments/pay-callback'"));
const prepare=charges.slice(charges.indexOf('export async function prepareCharge'),charges.indexOf('async function insertRefund')).replace('export ','');
const initial={id:'a',user_id:1,status:'pending_payment',appointment_no:'legacy-a',appointmentDate:'2099-01-01',appointmentTime:'09:00-09:30',appointmentCharge:{canPay:true}};
const fee={consult_fee:3000,deposit_amount:5000};
const error=(message,statusCode,data)=>Object.assign(Error(message),{statusCode,data});
const missing=()=>error('不存在',404,{code:'ORDER_NOT_EXIST'});
function backend(mode){
  const row={...initial}, items=mode==='legacy-only'?[]:[{id:1,charge_no:'charge-a',status:'pending',payment_method:'wechat',...fee}];
  const calls={queries:[],created:[],retired:[],builds:[],settled:0,native:[]};
  const leases=new Map(); let now=0, retryState=null;
  const closedBarrier=gate(), buildBarrier=gate();let closedReads=0,seq=1,queue=Promise.resolve();
  const conn={execute:async(sql,args)=>{
    if(sql.includes('FROM appointments'))return [[{...row}]];
    if(sql.includes('FROM orders'))return [[]];
    if(sql.includes('FROM appointment_charges'))return [[items.filter(c=>!['cancelled','refunded'].includes(c.status)).at(-1)]];
    if(sql.startsWith('UPDATE appointment_charges')){
      const item=items.find(c=>c.id===args[0]&&c.charge_no===args[2]&&c.status==='pending');
      if(item){item.status='cancelled';calls.retired.push(item.charge_no);}
      return [{affectedRows:item?1:0}];
    }
    if(sql.startsWith('INSERT INTO appointment_charges')){
      items.push({id:++seq,charge_no:args[1],status:'pending',payment_method:'wechat',...fee});calls.created.push(args[1]);return [{insertId:seq}];
    }
    throw Error(`Unexpected SQL: ${sql}`);
  }};
  function instance(){
  const handlers={};
  vm.runInNewContext(prepare+'\n'+route,{
    app:{post(url,_auth,fn){handlers[url.split('/').at(-1)]=fn;}},authenticateWxToken(){},businessError:error,
    transaction(fn){const r=queue.then(()=>fn(conn));queue=r.catch(()=>{});return r;},
    run:async (sql,[no])=>{
      assert.match(sql,/prepay_lease_until/);
      assert.match(sql,/INTERVAL 120 SECOND/);
      if(leases.get(no)>now)return {changes:0};
      leases.set(no,now+120);return {changes:1};
    },
    get:async sql=>sql.includes('appointment_charges')?items.findLast(c=>c.status==='pending'):{...row},
    appointmentFeeSnapshot:()=>fee,chargeAmount:c=>c.consult_fee+c.deposit_amount,orderCoversAppointmentFees:()=>false,reference:()=>`charge-${seq+1}`,
    getMissingWechatPayConfig:async()=>[],assertAppointmentFeesPaid:async()=>assert.equal(row.status,'pending'),
    queryOrderByOutTradeNo:async no=>{
      calls.queries.push(no);
      if(no==='legacy-a'){
        if(['legacy-only','legacy-with-charge'].includes(mode))return {trade_state:'SUCCESS',out_trade_no:no};
        if(mode==='wrong-legacy-closed')return {trade_state:'CLOSED',out_trade_no:'another-order'};
        throw missing();
      }
      if(no==='charge-a'&&mode.startsWith('closed')){
        if(++closedReads===2)closedBarrier.resolve();
        if(mode==='closed-cross-instance')await closedBarrier.promise;
        return {trade_state:'CLOSED',out_trade_no:no};
      }
      if(retryState==='timeout')throw error('查单超时',504);
      if(retryState)return {trade_state:retryState,out_trade_no:no};
      throw missing();
    },
    finalizePaidAppointment:async()=>{if(row.status==='pending')return false;row.status='pending';calls.settled++;return true;},
    settleOnlineCharge:async()=>{calls.settled++;row.status='pending';return {status:'paid'};},
    serviceBuildPaymentParams:async(_title,_amount,no)=>{calls.builds.push(no);if(mode==='closed-backend-concurrent')await buildBarrier.promise;return {timeStamp:'1',nonceStr:'n',package:`prepay_id=${no}`,paySign:'s'};},
    console:{error(){}},
  });
  return async function request(action){
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
    await handlers[action]({params:{id:'a'},user:{id:1,openid:'fixture'}},res);
    if(res.statusCode!==200)throw error(res.body.message,res.statusCode);
    return res.body;
  };
  }
  return {row,calls,instance,advance(t,state){now=t;retryState=state;},request:instance(),releaseBuild:buildBarrier.resolve};
}
async function open(server,session,kind,waiters){
  const data=()=>({...server.row});
  const h=loadPage(kind==='list'?'booking/index.js':'detail.js',session,{
    getStores:async()=>[],getDoctors:async()=>[],getBookingSettings:async()=>({}),getAppointments:async()=>[data()],
    getAppointmentDetail:async()=>({data:{appointment:data()}}),payAppointmentDeposit:()=>server.request('pay'),confirmAppointmentPayment:()=>server.request('confirm-pay'),
  },{requestPayment(r){server.calls.native.push({kind,package:r.package});waiters.push(r);}});
  h.page.options={id:'a'};await h.page.loadPage();
  return ()=>kind==='list'?h.page.handlePrimaryAction({detail:h.page.data.upcomingAppointments[0]}):h.page.payDeposit();
}
const results=[];
async function check(id,fn){const observed={};try{await fn(observed);results.push({id,passed:true,observed});}catch(e){results.push({id,passed:false,observed,error:e.message});}console.log(JSON.stringify(results.at(-1)));}
async function concurrent(mode,o,detailFirst=false){
  const s=backend(mode),first=create(),fresh=create(),waiters=[];
  fresh.storage.clear();for(const [k,v] of first.storage)fresh.storage.set(k,structuredClone(v));
  assert.equal(fresh.storage.has('rewrite_appointment_payment_submitted:a'),false);
  const [list,detail]=await Promise.all([open(s,fresh,'list',waiters),open(s,fresh,'detail',waiters)]);
  let finished=false;const runs=Promise.all(detailFirst?[detail(),list()]:[list(),detail()]).finally(()=>{finished=true;});
  for(let i=0;i<30&&!finished&&waiters.length<2;i++)await tick();
  const nativeCount=waiters.length;
  for(const r of waiters)r.fail({errMsg:'requestPayment:fail cancel'});
  await runs;Object.assign(o,s.calls,{status:s.row.status,nativeCount});return s;
}
(async()=>{
  for(const [name,shared,mode] of [
    ['cross-instance-separate-runtimes',false,'closed-cross-instance'],
    ['cross-instance-shared-runtime',true,'closed-concurrent'],
    ['cross-instance-legacy-paid',false,'legacy-with-charge'],
  ])await check(name,async o=>{
    const s=backend(mode), second={...s,request:s.instance()}, session=create(), waiters=[];
    const [list,detail]=await Promise.all([open(s,session,'list',waiters),open(second,shared?session:create(),'detail',waiters)]);
    let finished=false;const run=Promise.all([list(),detail()]).finally(()=>{finished=true;});
    for(let i=0;i<60&&!finished&&waiters.length<(shared?1:2);i++)await tick();
    for(const r of waiters)r.fail({errMsg:'requestPayment:fail cancel'});
    await run;Object.assign(o,s.calls,{status:s.row.status});
    if(mode==='legacy-with-charge'){
      assert.equal(o.settled,1);assert.equal(o.created.length+o.builds.length+o.native.length,0);
    }else{
      assert.equal(o.retired.length,1);assert.equal(o.created.length,1);
      assert.deepEqual(o.builds,o.created);assert.equal(o.native.length,1);
    }
  });
  if(process.env.APPOINTMENT_ROUND15_EXPIRY==='1')for(const state of ['NOTPAY','USERPAYING','SUCCESS','timeout']){
    await check('lease-expiry-'+state,async o=>{
      const s=backend('closed-concurrent');await s.request('pay');
      const second=s.instance();
      s.advance(119,'NOTPAY');await assert.rejects(second('pay'),e=>e.statusCode===409);
      assert.equal(s.calls.builds.length,1);
      s.advance(120,state);const start=s.calls.queries.length;
      if(state==='timeout'||state==='USERPAYING')await assert.rejects(second('pay'),e=>e.statusCode===(state==='timeout'?504:409));
      else await second('pay');
      Object.assign(o,{queries:s.calls.queries.slice(start),builds:s.calls.builds,settled:s.calls.settled});
      assert.deepEqual(o.queries,['legacy-a','charge-2']);
      assert.equal(o.builds.length,state==='NOTPAY'?2:1);assert.equal(o.settled,state==='SUCCESS'?1:0);
    });
  }
  fs.writeFileSync(path.join(__dirname,dest,'new-cases.json'),JSON.stringify(results,null,2));
  process.exitCode=results.some(x=>!x.passed)?1:0;
})().catch(e=>{console.error(e);process.exitCode=2;});
