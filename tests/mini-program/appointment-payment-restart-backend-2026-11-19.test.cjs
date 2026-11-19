const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../hanjing-clinic-backend/routes/client.js'),'utf8');
const route=source.slice(source.indexOf('async function queryAppointmentOrderBeforePay('),source.indexOf('// 13.6 Confirm Appointment Payment'));
const charge={charge_no:'charge-a',consult_fee:3000,deposit_amount:5000};
const paid={trade_state:'SUCCESS',out_trade_no:charge.charge_no};
const error=(message,statusCode,data)=>Object.assign(Error(message),{statusCode,data});
async function invoke({queries=[],buildError,status='pending_payment',settledStatus='paid'}={}){
  const calls=[];const response={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}};
  let handler;
  vm.runInNewContext(route,{
    app:{post(url,auth,fn){assert.equal(url,'/api/v1/appointments/:id/pay');handler=fn;}},authenticateWxToken:()=>{},
    transaction:async fn=>fn({execute:async()=>[[{status}]]}),
    businessError:error,assertAppointmentFeesPaid:async()=>calls.push('assert-paid'),
    prepareCharge:async()=>charge,chargeAmount:c=>c.consult_fee+c.deposit_amount,
    queryOrderByOutTradeNo:async no=>{assert.equal(no,charge.charge_no);calls.push('query');const response=queries.shift();if(response instanceof Error)throw response;return response;},
    run:async()=>({changes:1}),
    serviceBuildPaymentParams:async(_subject,amount,no)=>{assert.equal(amount,8000);assert.equal(no,charge.charge_no);calls.push('build');if(buildError)throw buildError;return {package:'prepay_id=fixture'};},
    settleOnlineCharge:async result=>{assert.equal(result.out_trade_no,charge.charge_no);calls.push('settle');return {status:settledStatus};},console:{error(){}},
  });
  await handler({params:{id:'a'},user:{id:1,openid:'fixture'}},response);
  return {calls,...response};
}
const missing=()=>error('不存在',404,{code:'ORDER_NOT_EXIST'});
for(const [label,prior] of [['首次下单',missing()],['未支付',{trade_state:'NOTPAY',out_trade_no:charge.charge_no}]])test(label+'可获取同一收费单的支付参数',async()=>{
  const r=await invoke({queries:[prior]});assert.deepEqual(r.calls,['query','build']);assert.equal(r.body.data.package,'prepay_id=fixture');
});
test('查到已支付：直接结算，不请求预支付',async()=>{
  const r=await invoke({queries:[paid]});assert.deepEqual(r.calls,['query','settle']);assert.equal(r.body.data.alreadyPaid,true);assert.equal(r.body.data.package,undefined);
});
test('下单返回已支付：重新核对并结算',async()=>{
  const r=await invoke({queries:[{trade_state:'NOTPAY',out_trade_no:charge.charge_no},paid],buildError:error('订单已支付',400,{code:'ORDERPAID'})});
  assert.deepEqual(r.calls,['query','build','query','settle']);assert.equal(r.body.data.alreadyPaid,true);
});
test('下单称已支付但查单仍未支付：不返回支付参数',async()=>{
  const r=await invoke({queries:[{trade_state:'NOTPAY',out_trade_no:charge.charge_no},{trade_state:'NOTPAY',out_trade_no:charge.charge_no}],buildError:error('订单已支付',400,{code:'ORDERPAID'})});
  assert.deepEqual(r.calls,['query','build','query']);assert.equal(r.statusCode,409);assert.equal(r.body.data,undefined);
});
for(const [label,prior,code] of [['查单超时',error('超时',504),504],['支付处理中',{trade_state:'USERPAYING',out_trade_no:charge.charge_no},409],['单号不匹配',{...paid,out_trade_no:'wrong'},409]])test(label+'时不生成支付参数',async()=>{
  const r=await invoke({queries:[prior]});assert.deepEqual(r.calls,['query']);assert.equal(r.statusCode,code);assert.equal(r.body.data,undefined);
});
test('预约已同步：核对付款记录后直接返回',async()=>{
  const r=await invoke({status:'pending'});assert.deepEqual(r.calls,['assert-paid']);assert.equal(r.body.data.alreadyPaid,true);
});
test('已付款但落入退款流程：不返回成功或支付参数',async()=>{
  const r=await invoke({queries:[paid],settledStatus:'refund_pending'});assert.deepEqual(r.calls,['query','settle']);assert.equal(r.statusCode,409);assert.equal(r.body.data,undefined);
});
