import assert from 'node:assert/strict';

export async function runPaymentIntegrityTests({ t, db, control, api, wxApi, root, staff, admin, clientRoutes, refunds, createFeeAppointment, feeBill, bill }) {
  const { syncUserMembership } = await import('../membership.js');
  const { readStoreReport } = await import('../operations-report.js');
  await db.run('UPDATE products SET stock=100 WHERE id=1');
  const payment = (trade, amount, id) => ({trade_state:'SUCCESS',out_trade_no:trade,transaction_id:id,amount:{currency:'CNY',total:amount}});
  await t.test('F2 mini payment then cashier callback records duplicate money for refund without fulfillment', async () => {
    const id = await createFeeAppointment();
    const body = feeBill(id,'wechat_native');
    body.items.push({product_id:1,price:10000,quantity:1}); body.pay_amount += 10000;
    const stock = (await db.get('SELECT stock FROM products WHERE id=1')).stock;
    const created = await api('/orders',body);
    assert.equal(created.status,200,JSON.stringify(created));
    assert.equal((await wxApi(`/appointments/${id}/pay`)).status,409);
    const spentBefore = (await syncUserMembership(1)).total_spent;
    const appt = await db.get('SELECT * FROM appointments WHERE id=?',[id]);
    await db.transaction(conn => clientRoutes.finalizePaidAppointment(conn,appt,1,payment(appt.appointment_no,7000,'F2-MINI-'+id)));
    const paid = payment(created.body.data.order_no,17000,'F2-CASHIER-'+id);
    await admin.finalizeAdminPaidOrder({id:created.body.data.order_id},paid);
    await admin.finalizeAdminPaidOrder({id:created.body.data.order_id},paid);
    const duplicate = await db.get('SELECT * FROM orders WHERE id=?',[created.body.data.order_id]);
    assert.equal(duplicate.status,'refund_pending'); assert.ok(duplicate.pay_at);
    assert.equal((await syncUserMembership(1)).total_spent,spentBefore+7000);
    assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock,stock);
    assert.equal((await db.get('SELECT COUNT(*) n FROM distribution_orders WHERE order_id=?',[duplicate.id])).n,0);
    assert.equal((await db.get('SELECT COUNT(*) n FROM fulfillment_cases WHERE order_id=?',[duplicate.id])).n,0);
    await assert.rejects(refunds.reviewRefund(duplicate.id,false,1000),{statusCode:409});
    await refunds.reviewRefund(duplicate.id,true,1000,{missing:async()=>[],create:async()=>({status:'PROCESSING'})});
    await refunds.completeRefund({status:'SUCCESS',out_refund_no:'HJR'+duplicate.id,out_trade_no:duplicate.order_no,refund_id:'F2-R-'+id,success_time:new Date().toISOString(),amount:{currency:'CNY',total:17000,refund:17000}});
    assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock,stock);
  });
  await t.test('F2 callback competition recognizes fees only once in either order', async () => {
    for (const mode of ['cashier-first','parallel']) {
      const id=await createFeeAppointment();
      const created=await api('/orders',feeBill(id,'wechat_native'));
      assert.equal(created.status,200);
      const appt=await db.get('SELECT * FROM appointments WHERE id=?',[id]);
      const cashier=()=>admin.finalizeAdminPaidOrder({id:created.body.data.order_id},payment(created.body.data.order_no,7000,'F2-C-'+id));
      const mini=()=>db.transaction(conn=>clientRoutes.finalizePaidAppointment(conn,appt,1,payment(appt.appointment_no,7000,'F2-M-'+id)));
      if(mode==='parallel')await Promise.all([cashier(),mini()]);else{await cashier();await mini();}
      const rows=await db.query('SELECT status FROM orders WHERE appointment_id=?',[id]);
      assert.equal(rows.filter(row=>row.status==='paid').length,1);
      assert.equal(rows.filter(row=>row.status==='refund_pending').length,1);
    }
  });
  const manual = (amount=10000, reference='F2-BANK-REF') => ({amount,method:'bank',refunded_at:new Date().toISOString(),reference,evidence:'',confirmed:true});
  const create = async (method='cash') => {
    const response=await api('/orders',{...bill,pay_method:method});
    assert.equal(response.status,200,JSON.stringify(response));
    if (['cash','bank'].includes(method)) assert.ok(new Date(response.body.data.receipt.payAt).getTime()<=Date.now());
    return response.body.data.order_id;
  };
  await t.test('F2 manual refund requires active superadmin, real receipt, confirmation, exact amount and evidence', async () => {
    const id=await create(); const path=`/orders/${id}/offline-refund`;
    assert.equal((await api(path,manual(),staff)).status,403);
    for(const patch of [{confirmed:false},{amount:9999},{amount:10001},{amount:0},{reference:'',evidence:''},{refunded_at:'bad'},{refunded_at:'2000-01-01T00:00:00Z'},{refunded_at:'2099-01-01T00:00:00Z'},{method:'wechat'}]) {
      assert.equal((await api(path,{...manual(),...patch},root)).status,400,JSON.stringify(patch));
    }
    assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[id])).status,'paid');
    const pending=await create('wechat_native');
    assert.equal((await api(`/orders/${pending}/offline-refund`,manual(),root)).status,409);
    await db.run("UPDATE orders SET shipping_address='[]' WHERE id=?",[id]);
    assert.equal((await api(path,manual(),root)).status,409);
    assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[id])).status,'paid');
    await db.run("UPDATE orders SET shipping_address='{}' WHERE id=?",[id]);
  });
  await t.test('F2 offline refund is atomic, retry-safe and reverses stock and commissions once', async () => {
    const id=await create('bank'); const data=manual(10000,'F2-ATOMIC-'+id);
    const stock=(await db.get('SELECT stock FROM products WHERE id=1')).stock;
    const spentBefore=(await syncUserMembership(1)).total_spent;
    const reportBefore=await readStoreReport({role:'super_admin'}, {year:new Date().getFullYear(),store_id:1});
    const path=`/orders/${id}/offline-refund`;
    await control.query("CREATE TRIGGER f2_refund_failure BEFORE INSERT ON audit_logs FOR EACH ROW BEGIN IF NEW.action='register_offline_refund' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='F2 audit failure'; END IF; END");
    try {
      assert.equal((await api(path,data,root)).status,500);
      assert.equal((await db.get('SELECT status FROM orders WHERE id=?',[id])).status,'paid');
      assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock,stock);
    } finally { await control.query('DROP TRIGGER f2_refund_failure'); }
    const responses=await Promise.all([api(path,data,root),api(path,data,root)]);
    assert.deepEqual(responses.map(r=>r.status),[200,200],JSON.stringify(responses));
    const row=await db.get('SELECT * FROM orders WHERE id=?',[id]);
    assert.equal(row.status,'refunded');assert.ok(row.refund_at);assert.equal(row.wechat_refund_id,null);
    const address=typeof row.shipping_address==='string'?JSON.parse(row.shipping_address):row.shipping_address;
    assert.equal(address.offline_refund.actor_id,1000); assert.equal(address.offline_refund.reference,data.reference);
    assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock,stock+1);
    assert.equal((await db.get("SELECT COUNT(*) n FROM distribution_orders WHERE order_id=? AND status!='refunded'",[id])).n,0);
    assert.equal((await db.get("SELECT COUNT(*) n FROM audit_logs WHERE target_id=? AND action='register_offline_refund'",[String(id)])).n,1);
    assert.equal((await api(path,{...data,reference:'DIFFERENT'},root)).status,409);
    assert.equal((await syncUserMembership(1)).total_spent,spentBefore-10000);
    const reportAfter=await readStoreReport({role:'super_admin'}, {year:new Date().getFullYear(),store_id:1});
    const sum=(report,key)=>report.months.reduce((total,row)=>total+row[key],0);
    assert.equal(sum(reportAfter,'refunds')-sum(reportBefore,'refunds'),10000);
    assert.equal(sum(reportAfter,'receipts'),sum(reportBefore,'receipts'));
  });
  await t.test('F2 delivered cash refunds accept a voucher but never assume device return', async () => {
    const id=await create(); await db.run("UPDATE orders SET status='completed' WHERE id=?",[id]);
    const stock=(await db.get('SELECT stock FROM products WHERE id=1')).stock;
    const r=await api(`/orders/${id}/offline-refund`,{...manual(10000,''),method:'cash',evidence:'Signed cash receipt REF-2026-001 in finance archive'},root);
    assert.equal(r.status,200,JSON.stringify(r));
    assert.equal((await db.get('SELECT stock FROM products WHERE id=1')).stock,stock);
  });
}
