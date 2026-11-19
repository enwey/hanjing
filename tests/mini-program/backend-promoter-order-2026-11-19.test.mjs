import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizePaidProductOrder } from '../../hanjing-clinic-backend/routes/client.js';

const pending={id:1,order_no:'fixture-order',status:'pending',pay_amount:9000,pay_at:null};
const payment={trade_state:'SUCCESS',out_trade_no:pending.order_no,amount:{currency:'CNY',total:9000},transaction_id:'fixture-payment'};
function fixture(row) {
  const connection={async execute(sql,args) {
    assert.deepEqual(args,[1]);
    if(sql.startsWith('SELECT appointment_id'))return [[{appointment_id:null}]];
    assert.match(sql,/^SELECT \* FROM orders .*FOR UPDATE/);
    return [[row]];
  }};
  return payload=>finalizePaidProductOrder(connection,pending,payload);
}
for (const [name,payload,row,statusCode] of [
  ['order disappeared',payment,null,404],
  ['empty payment',null,pending,409],
  ['non-success trade',{...payment,trade_state:'NOTPAY'},pending,409],
  ['different order number',{...payment,out_trade_no:'different'},pending,409],
  ['different currency',{...payment,amount:{total:9000,currency:'USD'}},pending,409],
  ['underpayment',{...payment,amount:{total:8999,currency:'CNY'}},pending,409],
  ['overpayment',{...payment,amount:{total:9001,currency:'CNY'}},pending,409],
  ['empty transaction ID',{...payment,transaction_id:''},pending,409],
  ['different payment for an already paid order',payment,{...pending,pay_at:'paid',status:'paid',wechat_transaction_id:'other'},409]
]) {
  test(`order ${name} stops before any write`,async()=>{
    await assert.rejects(fixture(row)(payload),{statusCode});
  });
}
test('identical payment on an already paid order is idempotent',async()=>{
  assert.equal(await fixture({...pending,pay_at:'paid',status:'paid',wechat_transaction_id:payment.transaction_id})(payment),false);
});
