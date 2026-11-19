import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';

let row, writes;
mock.module('../../hanjing-clinic-backend/db.js',{namedExports:{get:async()=>row,query:async()=>[],transaction:async()=>assert.fail('unexpected transaction'),run:async(sql,args)=>{
  assert.match(sql,/^UPDATE promoter_codes/);
  writes.push(args);
  [row.image,row.qr_environment,row.qr_app_id]=args;
}}});
mock.module('../../hanjing-clinic-backend/wechatMiniToken.js',{namedExports:{getWechatMiniAccessToken:async()=> 'test-token'}});
const {promoterQr}=await import('../../hanjing-clinic-backend/backend-promoter-admin.js');
const {createReferralCommissions}=await import('../../hanjing-clinic-backend/backend-referrals.js');
process.env.WX_MINI_QRCODE_ENV='trial';
process.env.WX_MINI_APP_ID='regression-app';
const code='BP'+'b'.repeat(24);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNg+A8AAQIBAEK+vGgAAAAASUVORK5CYII=','base64');
const brokenData=Buffer.from(png);
brokenData.fill(0,41,41+png.readUInt32BE(33));
assert.throws(()=>inflateSync(brokenData.subarray(41,41+png.readUInt32BE(33))),{code:'Z_DATA_ERROR'});

function qrFixture(t, responses, image=null, appId='regression-app') {
  row={code,image,qr_environment:'trial',qr_app_id:appId};
  writes=[];
  return t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(JSON.parse(options.body).scene,'ref='+code);
    assert.ok(responses.length,'unexpected upstream request');
    return new Response(responses.shift());
  });
}
for (const [name, bytes] of [
  ['PNG signature only',png.subarray(0,8)], ['PNG missing IEND',png.subarray(0,-12)],
  ['PNG interrupted inside IDAT',png.subarray(0,44)], ['JPEG signature only',Buffer.from('ffd8ff','hex')],
  ['JPEG without frame and scan',Buffer.from('ffd8ffd9','hex')], ['PNG with undecodable IDAT',brokenData]
]) {
  test(`FLOW-21 rejects ${name} without caching`,async t=>{
    qrFixture(t,[bytes]);
    const [result]=await Promise.allSettled([promoterQr(8)]);
    assert.deepEqual({status:result.status,code:result.reason?.statusCode,writes:writes.length},{status:'rejected',code:503,writes:0});
  });
}
for (const [name, cache, appId] of [
  ['old truncated PNG',png.subarray(0,-12),'regression-app'],
  ['old truncated JPEG',Buffer.from('ffd8ff','hex'),'regression-app'],
  ['valid cache from a different app',png,'previous-app']
]) {
  test(`FLOW-21 refreshes ${name} after upstream recovery`, async t=>{
    const fetch=qrFixture(t,[png.subarray(0,8),png],cache,appId);
    await assert.rejects(promoterQr(8),{statusCode:503});
    assert.deepEqual(row.image,cache);
    assert.equal(writes.length,0);
    const refreshed=await promoterQr(8);
    assert.deepEqual(writes,[[png,'trial','regression-app',code]]);
    assert.deepEqual(refreshed,{code,image:'data:image/png;base64,'+png.toString('base64')});
    assert.deepEqual(await promoterQr(8),refreshed);
    assert.equal(fetch.mock.callCount(),2);
  });
}


const settings=Object.entries({distribution_settle_days:'0',enable_distribution:'true',min_withdraw:'1',withdraw_fee_rate:'0'}).map(([key_name,key_value])=>({key_name,key_value}));
const referrer={id:2};
for (const [name, total, lines, expectedAmount, expectedLineAmounts] of [
  ['original unequal remainders',1999999989,[[999999991,1,100],[999999999,1,0]],999999991,[999999991]],
  ['large equal remainders favor earlier line',1999999999,[[1000000000,1,100],[1000000000,1,100]],1999999999,[1000000000,999999999]],
  ['quantity and fractional rate',1999999999,[[500000000,2,12.34],[1000000000,1,0]],123400000,[1000000000]],
  ['regular-size mixed order',9999,[[5000,1,20],[5000,1,0]],1000,[5000]]
]) {
  test(`FLOW-18 ${name}`,async()=>{
    const order={id:1,pay_at:'paid',pay_amount:total,referral_promoter_id:2,appointment_id:3};
    const items=lines.map(([price,quantity,rate],index)=>({id:index+1,price,quantity,backend_rate_x_snapshot:rate,backend_referral_enabled_snapshot:rate?1:0}));
    const ledger=[];
    const conn={async execute(sql,args){
      if(sql.includes('system_settings'))return [settings];
      if(sql.includes('FROM orders'))return [[order]];
      if(sql.includes('FROM order_items'))return [items];
      if(sql.startsWith('SELECT * FROM distributors'))return [[referrer]];
      if(sql.includes('COUNT(DISTINCT order_id)'))return [[{n:1}]];
      if(sql.startsWith('SELECT'))return [[]];
      if(sql.startsWith('INSERT INTO distribution_orders'))ledger.push(args);
      return [[]];
    }};
    await createReferralCommissions(conn,order,4);
    assert.equal(ledger.length,1);
    assert.deepEqual(ledger[0].slice(3,7),[total,expectedAmount,3,'referral_new']);
    assert.deepEqual(JSON.parse(ledger[0][7]).map(line=>line.paidAmount),expectedLineAmounts);
  });
}

test('FLOW-21 refreshes a cache with undecodable PNG data',async t=>{
  const fetch=qrFixture(t,[png],brokenData);
  const actual=await promoterQr(8);
  assert.deepEqual({fetches:fetch.mock.callCount(),writes:writes.length,image:actual.image},{
    fetches:1,writes:1,image:'data:image/png;base64,'+png.toString('base64')
  });
});

test('FLOW-21 keeps undecodable cache out of the response until a valid replacement is saved',async t=>{
  const fetch=qrFixture(t,[brokenData,png],brokenData);

  await assert.rejects(promoterQr(8),{statusCode:503});
  assert.equal(fetch.mock.callCount(),1);
  assert.deepEqual(writes,[]);
  assert.deepEqual(row.image,brokenData);

  const validImage={code,image:'data:image/png;base64,'+png.toString('base64')};
  assert.deepEqual(await promoterQr(8),validImage);
  assert.deepEqual(writes,[[png,'trial','regression-app',code]]);
  assert.deepEqual(row.image,png);

  assert.deepEqual(await promoterQr(8),validImage);
  assert.equal(fetch.mock.callCount(),2);
  assert.equal(writes.length,1);
});
