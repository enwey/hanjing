import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

async function load(name) {
  const source=fs.readFileSync(new URL(`../src/utils/${name}.ts`,import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  return import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
}
const {createCheckoutLifecycle,settleCashierAppointment}=await load('checkoutLifecycle');
const {createCashierSession}=await load('checkoutProducts');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

test('checkout identity, order binding, close/reopen and route changes invalidate old work',()=>{
  let subject='routeA:patient1';const flow=createCheckoutLifecycle(()=>subject);
  const a=flow.begin();assert.equal(flow.bindOrder(a,11),true);
  assert.throws(()=>flow.bindOrder(a,12));
  flow.invalidate();assert.equal(flow.isCurrent(a),false);
  const b=flow.begin();assert.equal(flow.isCurrent(a),false);assert.equal(flow.isCurrent(b),true);
  subject='routeB:patient2';assert.equal(flow.isCurrent(b),false);flow.invalidate();
});

test('a slow poll never overlaps and closing suppresses its completion',async()=>{
  const flow=createCheckoutLifecycle(()=> 'A'), token=flow.begin(), gate=deferred();let calls=0,rendered=0;
  flow.poll(token,async current=>{calls++;await gate.promise;if(current())rendered++;},5);
  await pause(40);assert.equal(calls,1);
  flow.invalidate();gate.resolve();await pause(20);assert.equal(rendered,0);assert.equal(calls,1);
});

test('old completion cannot stop newer polling, even in the same appointment',async()=>{
  const flow=createCheckoutLifecycle(()=> 'A'), gate=deferred();let newer=0;
  flow.poll(flow.begin(),async current=>{await gate.promise;if(current())flow.stopPolling();},5);
  await pause(20);const newerToken=flow.begin();
  flow.poll(newerToken,async()=>{newer++;},5);gate.resolve();await pause(30);
  flow.invalidate();assert.ok(newer>=2);
});

test('restarting polling invalidates an in-flight poll in the same session',async()=>{
  const flow=createCheckoutLifecycle(()=> 'A'), token=flow.begin(), gate=deferred();let stale=0, fresh=0;
  flow.poll(token,async current=>{await gate.promise;if(current())stale++;},5);
  await pause(20);flow.poll(token,async()=>{fresh++;},5);gate.resolve();await pause(20);
  flow.invalidate();assert.equal(stale,0);assert.ok(fresh>0);
});

test('an old HTTP failure cannot reset the next cashier request id',async()=>{
  const gate=deferred(),calls=[];
  const session=createCashierSession({post:async(p,body)=>{calls.push(body);if(calls.length===1)return gate.promise;return{code:200};}});
  const old=session.submit({patient_id:1}).catch(()=>{});session.reset();
  await session.submit({patient_id:2});const requestId=calls[1].request_id;
  gate.reject({response:{status:400}});await old;await session.submit({patient_id:2});
  assert.equal(calls[2].request_id,requestId);assert.notEqual(calls[0].request_id,requestId);
});

test('settlement uses latest server state rather than a stale checked-in row',async()=>{
  const puts=[];const request={get:async()=>({code:200,data:{id:12,status:'completed'}}),put:async(...args)=>puts.push(args)};
  assert.equal(await settleCashierAppointment(request,12,()=>true),true);
  assert.deepEqual(puts,[['/api/admin/appointments/12',{status:'arrived'}]]);
});

test('settled/active bookings are not reverted, and terminal bookings are rejected',async()=>{
  let status='arrived',calls=0;
  const request={get:async()=>({code:200,data:{id:12,status}}),put:async()=>calls++};
  for(status of ['arrived','settled','pending','confirmed','checked_in','waiting','called'])assert.equal(await settleCashierAppointment(request,12,()=>true),true);
  assert.equal(calls,0);
  for(status of ['cancelled','no_show','refunding','refunded','invalid'])await assert.rejects(settleCashierAppointment(request,12,()=>true));
});

test('closing during the latest-state request prevents any settlement write',async()=>{
  const gate=deferred();let active=true,writes=0;
  const result=settleCashierAppointment({get:()=>gate.promise,put:async()=>writes++},12,()=>active);
  active=false;gate.resolve({code:200,data:{id:12,status:'completed'}});
  assert.equal(await result,false);assert.equal(writes,0);
});

test('closing during settlement suppresses completion and keeps the captured target',async()=>{
  const gate=deferred();let active=true,target;
  const result=settleCashierAppointment({get:async()=>({code:200,data:{id:12,status:'completed'}}),put:async p=>{target=p;await gate.promise;}},12,()=>active);
  await pause(0);active=false;gate.resolve();assert.equal(await result,false);assert.equal(target,'/api/admin/appointments/12');
});

test('settlement rejects mismatched identities and propagates concurrent server rejection',async()=>{
  await assert.rejects(settleCashierAppointment({get:async()=>({code:200,data:{id:13,status:'completed'}})},12,()=>true));
  await assert.rejects(settleCashierAppointment({get:async()=>({code:200,data:{id:12,status:'completed'}}),put:async()=>{throw new Error('already cancelled');}},12,()=>true),/already cancelled/);
});
