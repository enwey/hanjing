import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

let connection, read, write, list;
mock.module('../../hanjing-clinic-backend/db.js', {namedExports:{
  get:(...args)=>read(...args), run:(...args)=>write(...args), query:(...args)=>list(...args),
  transaction: callback=>callback(connection)
}});
mock.module('../../hanjing-clinic-backend/wechatMiniToken.js', {namedExports:{getWechatMiniAccessToken:async()=> 'fixture-token'}});
mock.module('../../hanjing-clinic-backend/notification-center.js', {namedExports:{writeNotification:async()=>{},notifyBusiness:async()=>{}}});
mock.module('../../hanjing-clinic-backend/membership.js', {namedExports:{syncUserMembership:async()=>{}}});
const {promoterQr}=await import('../../hanjing-clinic-backend/backend-promoter-admin.js');
const {verifyWechatPayCallback}=await import('../../hanjing-clinic-backend/wechatPay.js');
const {completeRefund}=await import('../../hanjing-clinic-backend/refunds.js');
const {settleCommissions}=await import('../../hanjing-clinic-backend/distribution-ledger.js');

process.env.WX_MINI_QRCODE_ENV='trial';
process.env.WX_MINI_APP_ID='fixture-app';

const code='BP'+'a'.repeat(24);
const pngSignature=Buffer.from([137,80,78,71,13,10,26,10]);
const validPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNg+A8AAQIBAEK+vGgAAAAASUVORK5CYII=','base64');
function qrFixture(t, upstream, row={code}) {
  read=async()=>row;
  const writes=[];
  write=async(...args)=>writes.push(args);
  t.mock.method(globalThis,'fetch',upstream);
  return writes;
}

test('missing or disabled promotion QR is rejected before upstream call',async t=>{
  const writes=qrFixture(t,()=>assert.fail('unexpected network'),null);
  await assert.rejects(promoterQr(1),{statusCode:404});
  assert.deepEqual(writes,[]);
});
for (const [name, respond] of [
  ['HTTP failure',()=>new Response('error',{status:503})],
  ['HTTP 200 with WeChat error JSON',()=>Response.json({errcode:45009})],
  ['empty response',()=>new Response('')],
  ['connection failure',()=>{throw new TypeError('fixture unavailable');}]
]) {
  test(`QR ${name} does not cache and can be retried`,async t=>{
    let attempts=0;
    const writes=qrFixture(t,async()=>++attempts===1?respond():new Response(validPng));
    await assert.rejects(promoterQr(1));
    assert.deepEqual(writes,[]);
    assert.equal((await promoterQr(1)).image,'data:image/png;base64,'+validPng.toString('base64'));
    assert.equal(writes.length,1);
  });
}
for (const [format, bytes] of [['PNG',pngSignature],['JPEG',Buffer.from([255,216,255])]]) {
  test(`QR rejects and never caches truncated ${format}`,async t=>{
    const writes=qrFixture(t,async()=>new Response(bytes));
    const [result]=await Promise.allSettled([promoterQr(1)]);
    assert.deepEqual({result:result.status,cacheWrites:writes.length},{result:'rejected',cacheWrites:0});
  });
}

const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
process.env.WECHAT_PAY_PLATFORM_CERT=publicKey.export({type:'spki',format:'pem'});
const body='{"resource":{}}';
for (const [name, offset, changed, missing, expected] of [
  ['valid',0,false,false,true], ['tampered',0,true,false,false], ['stale',-301,false,false,false],
  ['future',302,false,false,false], ['missing signature',0,false,true,false]
]) {
  test(`payment callback signature ${name}`,async()=>{
    read=async()=>null;
    const timestamp=String(Math.floor(Date.now()/1000)+offset);
    const nonce='fixture-nonce';
    const headers={'Wechatpay-Timestamp':timestamp,'Wechatpay-Nonce':nonce,
      'Wechatpay-Signature':missing?'':sign('RSA-SHA256',Buffer.from(`${timestamp}\n${nonce}\n${body}\n`),privateKey).toString('base64')};
    assert.equal(await verifyWechatPayCallback({get:name=>headers[name]},changed?body+' ':body),expected);
  });
}

const refund={status:'SUCCESS',out_refund_no:'fixture-refund',out_trade_no:'fixture-order',refund_id:'fixture-receipt',success_time:'2026-11-19T12:00:00+08:00',amount:{currency:'CNY',refund:100,total:100}};
const order={id:1,order_no:'fixture-order',status:'refunding',pay_amount:100};
for (const [name, patch, row, error] of [
  ['processing', {status:'PROCESSING'}, undefined, null], ['missing success time',{success_time:''},undefined,409],
  ['unknown refund',{},null,404], ['wrong trade',{out_trade_no:'different'},order,409],
  ['wrong currency',{amount:{...refund.amount,currency:'USD'}},order,409],
  ['partial amount',{amount:{...refund.amount,refund:99}},order,409],
  ['incorrect original total',{amount:{...refund.amount,total:101}},order,409], ['missing reference',{refund_id:''},order,409],
  ['wrong order state',{}, {...order,status:'paid'},409], ['replay',{}, {...order,status:'refunded'},null]
]) {
  test(`refund ${name} leaves the ledger untouched`,async()=>{
    connection={async execute(sql){assert.match(sql,/^SELECT \* FROM orders WHERE wechat_refund_no/);return [[row]];}};
    const call=()=>completeRefund({...refund,...patch});
    if(error) await assert.rejects(call(),{statusCode:error});
    else assert.equal(await call(),false);
  });
}

test('settlement credits only rows that successfully transition from pending',async()=>{
  list=async sql=>sql.includes('system_settings')?Object.entries({distribution_settle_days:7,enable_distribution:true,min_withdraw:1,withdraw_fee_rate:0}).map(([key_name,key_value])=>({key_name,key_value})):[{id:1}];
  const updates=[];
  connection={async execute(sql,args){
    if(sql.includes('JOIN orders')) {
      assert.match(sql,/status = 'completed'/);
      assert.match(sql,/lock_until <= CURRENT_TIMESTAMP/);
      assert.match(sql,/FOR UPDATE/);
      assert.deepEqual(args,[1,7]);
      return [[{id:1,commission_amount:20},{id:2,commission_amount:40}]];
    }
    if(sql.startsWith('UPDATE distribution_orders'))return [{affectedRows:args[0]===1?1:0}];
    assert.match(sql,/UPDATE distributors SET available_commission/);
    updates.push(args);
    return [[]];
  }};
  assert.equal(await settleCommissions(null,1),20);
  assert.deepEqual(updates,[[20,1]]);
});

for (const status of ['pending','settled']) {
  test(`full refund reverses a ${status} commission exactly once in the module`,async()=>{
    const balance=[];
    let ledgerStatus=status;
    const row={...order,shipping_address:{refund_from_status:'paid'},user_id:4};
    connection={async execute(sql,args){
      if(sql.includes('FROM orders WHERE wechat_refund_no'))return [[row]];
      if(sql.includes('FROM fulfillment_cases') || sql.includes('FROM fulfillment_fittings') || sql.includes('FROM order_items oi'))return [[]];
      if(sql.startsWith('SELECT * FROM distribution_orders'))return [[{id:10,distributor_id:2,commission_amount:20,status:ledgerStatus}]];
      if(sql.startsWith('UPDATE distributors SET total_commission'))balance.push(args);
      else if(sql.startsWith('UPDATE distribution_orders'))ledgerStatus='refunded';
      else if(sql.startsWith('UPDATE orders'))row.status='refunded';
      else if(sql.startsWith('SELECT COUNT'))return [[{count:0}]];
      else assert.match(sql,/^UPDATE distributors SET level/);
      return [[]];
    }};
    assert.equal(await completeRefund(refund),true);
    assert.equal(ledgerStatus,'refunded');
    assert.equal(await completeRefund(refund),false);
    assert.deepEqual(balance,[[20,status==='settled'?20:0,2]]);
  });
}

for (const cached of [pngSignature, validPng.subarray(0, -12)]) {
  test(`invalid PNG cache (${cached.length} bytes) is replaced and the valid replacement is reused`,async t=>{
    const row={code,image:cached,qr_environment:'trial',qr_app_id:'fixture-app'};
    let fetches=0;
    const writes=qrFixture(t,async()=>{
      fetches++;
      return new Response(validPng);
    },row);
    const refreshed=await promoterQr(1);
    assert.equal(refreshed.image,'data:image/png;base64,'+validPng.toString('base64'));
    assert.equal(writes.length,1);
    row.image=writes[0][1][0];
    assert.deepEqual(await promoterQr(1),refreshed);
    assert.equal(fetches,1);
  });
}
