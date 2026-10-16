import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export async function runAccountDisplayTests({t,db,api,root,staff,helpers}) {
  const token=jwt.sign({id:9100,role:'launch_staff'},helpers.JWT_SECRET);
  await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id,status) VALUES(9100,'f4-password','unused','Password',1001,'online')");
  for (const legacy of [false,true]) await t.test(`F4 password change verifies ${legacy?'legacy SHA256':'salted PBKDF2'} and login uses the new password`,async()=>{
    const old='Old-pass-123', next='New-pass-456';
    const original=legacy?crypto.createHash('sha256').update(old).digest('hex'):helpers.hashPassword(old);
    await db.run('UPDATE admin_users SET password_hash=? WHERE id=9100',[original]);
    const change=(body)=>api('/change-password',body,token,'PUT');
    assert.equal((await change({oldPassword:'incorrect',newPassword:next})).status,400);
    assert.equal((await db.get('SELECT password_hash FROM admin_users WHERE id=9100')).password_hash,original);
    assert.equal((await change({oldPassword:old,newPassword:next})).status,200);
    const stored=(await db.get('SELECT password_hash FROM admin_users WHERE id=9100')).password_hash;
    assert.match(stored,/^pbkdf2\$/);assert.notEqual(stored,original);assert.ok(helpers.verifyPassword(next,stored));
    assert.equal(helpers.verifyPassword(old,stored),false);
    assert.equal((await api('/login',{username:'f4-password',password:next},root)).status,200);
    assert.equal((await api('/login',{username:'f4-password',password:old},root)).status,400);
  });
  await t.test('F4 password validation rejects malformed and short input without changing the hash',async()=>{
    const original=helpers.hashPassword('Old-pass-123');
    await db.run('UPDATE admin_users SET password_hash=? WHERE id=9100',[original]);
    for(const body of [{oldPassword:[],newPassword:'Valid-pass-123'},{oldPassword:'Old-pass-123',newPassword:{}},{oldPassword:'Old-pass-123',newPassword:'12345'},{oldPassword:'Old-pass-123',newPassword:' '.repeat(8)},{oldPassword:'Old-pass-123',newPassword:'x'.repeat(1025)}]) {
      assert.equal((await api('/change-password',body,token,'PUT')).status,400);
    }
    assert.equal((await db.get('SELECT password_hash FROM admin_users WHERE id=9100')).password_hash,original);
  });
  await t.test('F4 concurrent password changes cannot overwrite a change using the old password',async()=>{
    await db.run('UPDATE admin_users SET password_hash=? WHERE id=9100',[helpers.hashPassword('Old-pass-123')]);
    const passwords=['First-pass-123','Second-pass-456'];
    const results=await Promise.all(passwords.map(newPassword=>api('/change-password',{oldPassword:'Old-pass-123',newPassword},token,'PUT')));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
    const stored=(await db.get('SELECT password_hash FROM admin_users WHERE id=9100')).password_hash;
    assert.ok(helpers.verifyPassword(passwords[results.findIndex(r=>r.status===200)],stored));
  });
  await t.test('F4 no reviews is null while actual ratings preserve their measured average',async()=>{
    await db.run("INSERT INTO doctors(id,name,title,specialty) VALUES(9100,'Unrated','Doctor','Sleep')");
    let d=(await api('/doctors',undefined,root)).body.data.find(d=>Number(d.id)===9100);
    assert.equal(d.review_count,0);assert.equal(d.rating,null);assert.equal(d.positive_rate,null);
    await db.run("INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status) VALUES(9400,'F4-RATING',1,1,1,9100,1,'2099-10-16','10:00','arrived')");
    await db.run('INSERT INTO appointment_evaluations(appointment_id,doctor_id,user_id,rating) VALUES(9400,9100,1,3.5)');
    d=(await api('/doctors',undefined,root)).body.data.find(d=>Number(d.id)===9100);
    assert.equal(d.review_count,1);assert.equal(d.rating,3.5);assert.equal(d.positive_rate,0);
  });
  await t.test('F4 patient totals include all attributed receipts, actual refunds and only authorized stores',async()=>{
    await db.run("INSERT INTO permissions(role_id,permission_resource) VALUES(1001,'appointment:view')");
    await db.run("INSERT INTO patients(id,user_id,name,relation,patient_no) VALUES(9100,1,'F4 Patient','self','F4-P1'),(9101,1,'F4 Family','child','F4-P2')");
    for(let i=0;i<55;i++) await db.run("INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status,consult_fee) VALUES(?,?,1,9100,1,1,1,'2099-10-16','10:00','arrived',500000)",[9100+i,'F4-A'+i]);
    await db.run("INSERT INTO appointments(id,appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time,status) VALUES(9200,'F4-FOREIGN',1,9100,2,1,1,'2099-10-16','10:00','arrived'),(9300,'F4-FAMILY',1,9101,1,1,1,'2099-10-16','10:00','arrived')");
    const orders=[
      [1,9100,1000,'paid',true,false,null], [1,9100,700,'refunded',true,true,null],
      [1,9100,300,'refund_pending',true,false,null], [1,9100,400,'paid',false,false,null],
      [1,9300,8000,'paid',true,false,null], [1,9200,9000,'paid',true,false,null],
      [1,null,500,'paid',true,false,{patient_id:9100,store_id:1}], [1,null,9999,'paid',true,false,null],
      [1,9154,20000,'paid',true,false,null], [2,9100,8888,'paid',true,false,null]
    ];
    for(const [i,[owner,appt,amount,status,paid,refunded,context]] of orders.entries()) await db.run(
      `INSERT INTO orders(order_no,user_id,appointment_id,total_amount,discount_amount,pay_amount,status,pay_at,refund_at,cashier_context,shipping_address)
       VALUES(?,?,?,999999,500,?,?,${paid?'CURRENT_TIMESTAMP':'NULL'},${refunded?'CURRENT_TIMESTAMP':'NULL'},?,?)`,
      ['F4-O'+i,owner,appt,amount,status,context?JSON.stringify(context):null,JSON.stringify({storeId:1})]);
    const load=token=>api('/appointments/9100?include_patient_summary=1',undefined,token);
    const scoped=await load(staff);assert.equal(scoped.status,200);
    assert.deepEqual(scoped.body.data.patient_summary,{visit_count:55,receipts:22500,refunds:700,net_receipts:21800});
    const all=await load(root);assert.equal(all.status,200);
    assert.deepEqual(all.body.data.patient_summary,{visit_count:56,receipts:31500,refunds:700,net_receipts:30800});
    assert.equal((await api('/appointments/9200?include_patient_summary=1',undefined,staff)).status,404);
  });
}
