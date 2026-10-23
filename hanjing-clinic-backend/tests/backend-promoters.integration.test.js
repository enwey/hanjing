import { test } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';

test('independent backend promoters and paid referral accounting', async t => {
  const schema='hanjing_test_backend_promoters_'+Date.now();
  const admin=await mysql.createConnection({host:'127.0.0.1',port:3306,user:process.env.TEST_DB_USER||'root',password:process.env.TEST_DB_PASSWORD||'root'});
  let db,server;
  await admin.query('CREATE DATABASE '+schema);
  try {
    Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_NAME:schema,DB_USER:process.env.TEST_DB_USER||'root',DB_PASSWORD:process.env.TEST_DB_PASSWORD||'root'});
    db=await import('../db.js'); await db.initDB(); await db.initDB();
    await admin.query('USE '+schema);
    const helpers=await import('../helpers.js');
    const referrals=await import('../backend-referrals.js');
    const ledger=await import('../distribution-ledger.js');
    const {validateProduct}=await import('../product-validation.js');
    await admin.query("INSERT INTO system_settings(key_name,key_value) VALUES('distribution_settle_days','0'),('min_withdraw','1'),('withdraw_fee_rate','0'),('enable_distribution','true')");
    for(let i=1;i<=8;i++)await admin.query("INSERT INTO users(id,openid,nickname,password_hash,phone) VALUES(?,?,?, ?,?)",[i,'BP_TEST_'+i,'User '+i,helpers.hashPassword('MiniPass123'),'1380013800'+i]);
    await admin.query("INSERT INTO distributors(id,user_id,nickname,invite_code,source_type,status) VALUES(1,NULL,'Backend','BP000000000000000000000001','backend','active'),(2,2,'Mini','MINI2','mini','active'),(3,NULL,'Other backend','BP000000000000000000000003','backend','active')");
    await admin.query("INSERT INTO promoter_accounts(distributor_id,login_name,password_hash) VALUES(1,'backend-test',?),(3,'other-backend',?)",[helpers.hashPassword('Backend123'),helpers.hashPassword('Other1234')]);
    await admin.query("INSERT INTO promoter_codes(code,distributor_id) VALUES('BP000000000000000000000001',1),('BP000000000000000000000003',3)");
    await admin.query("INSERT INTO roles(id,name,code,status) VALUES(1,'Admin','super_admin','active')");
    await admin.query("INSERT INTO admin_users(id,username,password_hash,name,role_id,status) VALUES(1,'testadmin','unused','Admin',1,'online')");
    await admin.query("INSERT INTO stores(id,name,code,address) VALUES(1,'Test','TEST','Test')");
    await admin.query("INSERT INTO doctors(id,name,title,specialty) VALUES(1,'Test doctor','Test','Test')");
    await admin.query("INSERT INTO doctor_schedules(id,doctor_id,store_id,date,period,start_time,end_time) VALUES(1,1,1,'2026-10-23','morning','09:00','12:00')");
    await admin.query("INSERT INTO products(id,name,category,image_url,price,stock,is_distribution,commission_rate_level1,commission_rate_level2,backend_referral_enabled,backend_rate_x,backend_rate_y) VALUES(1,'Device','device','/test.png',10000,100,1,10,5,1,20,8),(2,'Ordinary','service','/test.png',10000,100,1,10,5,0,0,0)");
    const app=express();app.use(express.json());app.use((await import('../routes/promoter.js')).default);
    (await import('../backend-promoter-admin.js')).registerBackendPromoterAdmin(app);
    app.use((await import('../routes/admin.js')).default);
    app.use((err,req,res,next)=>res.status(err.statusCode||500).json({message:err.message}));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
    const api=async(path,token,body,method=body?'POST':'GET')=>{
      const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{Authorization:'Bearer '+(token||''),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
      return {status:r.status,body:await r.json()};
    };
    const adminToken=jwt.sign({id:1,role:'super_admin',token_version:0},helpers.JWT_SECRET);
    let token;
    let sequence=0;
    const order=async(user,product=1,appointment=null,paid=10000)=>{
      return db.transaction(async conn=>{
        if(!appointment){
          const [p]=await conn.execute("INSERT INTO patients(user_id,name,relation,patient_no) VALUES(?,'Test','self',?)",[user,'BP-P'+(++sequence)]);
          const [a]=await conn.execute("INSERT INTO appointments(appointment_no,user_id,patient_id,store_id,doctor_id,schedule_id,appointment_date,appointment_time) VALUES(?,?,?,1,1,1,'2026-10-23','09:00')",['A'+Date.now()+Math.random(),user,p.insertId]);
          appointment=a.insertId;
          await referrals.attachAppointmentReferral(conn,appointment,'BP000000000000000000000001');
        }
        const [o]=await conn.execute("INSERT INTO orders(order_no,user_id,total_amount,pay_amount,appointment_id,status,pay_method,pay_at) VALUES(?,?,10000,?,?,'completed','cash',NOW())",['O'+Date.now()+Math.random(),user,paid,appointment]);
        await conn.execute("INSERT INTO order_items(order_id,product_id,product_name,price,quantity,is_distribution_snapshot,commission_rate_level1_snapshot,commission_rate_level2_snapshot) VALUES(?,?,'Test',10000,1,1,10,5)",[o.insertId,product]);
        await referrals.snapshotReferralOrder(conn,o.insertId,appointment);
        return (await conn.execute('SELECT * FROM orders WHERE id=?',[o.insertId]))[0][0];
      });
    };
    const pay=o=>db.transaction(conn=>referrals.createReferralCommissions(conn,o,o.user_id));
    const rows=async sql=>(await admin.query(sql))[0];
    await t.test('backend login is independent; mini passwords and legacy tokens are rejected',async()=>{
      const login=await api('/api/promoter/login',null,{account:'backend-test',password:'Backend123'});assert.equal(login.status,200);token=login.body.data.token;
      assert.equal((await api('/api/promoter/me',token)).status,200);
      assert.equal((await api('/api/promoter/login',null,{account:'13800138002',password:'MiniPass123'})).status,401);
      assert.equal((await api('/api/promoter/me',jwt.sign({scope:'promoter',promoter_id:1},helpers.JWT_SECRET))).status,401);
      assert.equal((await api('/api/promoter/patients/1',token)).status,403);
    });
    let first;
    await t.test('scan/appointment do not bind; X snapshots bind at payment exactly once',async()=>{
      first=await order(1);
      assert.equal((await rows('SELECT * FROM distribution_relationships WHERE child_user_id=1')).length,0);
      await admin.query('UPDATE products SET backend_rate_x=30 WHERE id=1');
      // Payment callbacks hold the pre-update order object; DB payment state is authoritative.
      await pay({...first,pay_at:null});await pay(first);
      const commissions=await rows('SELECT * FROM distribution_orders WHERE order_id='+first.id);
      assert.equal(commissions.length,1);assert.equal(commissions[0].commission_kind,'referral_new');assert.equal(commissions[0].commission_amount,2000);
      assert.equal((await rows('SELECT * FROM distribution_relationships WHERE child_user_id=1 AND level=1'))[0].parent_distributor_id,1);
    });
    await t.test('same appointment cannot earn another referral bonus; later order earns normal tier',async()=>{
      const later=await order(1,1,first.appointment_id);await pay(later);
      const list=await rows('SELECT * FROM distribution_orders WHERE order_id='+later.id);
      assert.equal(list.length,1);assert.equal(list[0].commission_kind,'tier');assert.equal(list[0].commission_amount,1000);
    });
    await t.test('Y preserves existing parent and stacks existing tier commission',async()=>{
      await admin.query('INSERT INTO distribution_relationships(parent_user_id,child_user_id,level) VALUES(2,3,1)');
      const o=await order(3);await pay(o);
      const list=await rows('SELECT * FROM distribution_orders WHERE order_id='+o.id+' ORDER BY commission_level');
      assert.deepEqual(list.map(r=>[r.distributor_id,r.commission_kind,r.commission_amount]),[[2,'tier',1000],[1,'referral_existing',800]]);
      assert.equal((await rows('SELECT * FROM distribution_relationships WHERE child_user_id=3 AND level=1'))[0].parent_user_id,2);
    });
    await t.test('nonqualifying item never binds or pays X; disabled codes are rejected',async()=>{
      const o=await order(4,2);await pay(o);
      assert.equal((await rows('SELECT * FROM distribution_relationships WHERE child_user_id=4')).length,0);
      assert.equal((await rows('SELECT * FROM distribution_orders WHERE order_id='+o.id)).length,0);
      await assert.rejects(db.transaction(conn=>referrals.attachAppointmentReferral(conn,o.appointment_id,'invalid')));
    });
    await t.test('zero X still converts; parallel payments bind one parent and allocate cents safely',async()=>{
      await admin.query('UPDATE products SET backend_rate_x=0 WHERE id=1');
      const zero=await order(5);await pay(zero);
      assert.equal((await rows('SELECT * FROM distribution_relationships WHERE child_user_id=5 AND level=1')).length,1);
      const a=await order(6),b=await order(6);await Promise.all([pay(a),pay(b)]);
      assert.equal((await rows('SELECT * FROM distribution_relationships WHERE child_user_id=6 AND level=1')).length,1);
      assert.equal((await rows("SELECT COUNT(*) n FROM orders WHERE user_id=6 AND referral_mode='new'"))[0].n,1);
      assert.ok(validateProduct({name:'a',price:100,stock:1,backend_referral_enabled:1,backend_rate_y:90,commission_rate_level1:20}));
    });
    await t.test('backend parent receives second tier through mini promoter descendants',async()=>{
      await admin.query('INSERT INTO distribution_relationships(parent_distributor_id,child_user_id,level) VALUES(3,2,1)');
      const o=await order(3,2);await pay(o);
      const list=await rows('SELECT * FROM distribution_orders WHERE order_id='+o.id+' ORDER BY commission_level');
      assert.deepEqual(list.map(r=>[r.distributor_id,r.commission_amount]),[[2,1000],[3,500]]);
    });
    await t.test('full refund reverses X and leaves relationship intact',async()=>{
      const {registerOfflineRefund}=await import('../refunds.js');
      await registerOfflineRefund(first.id,1,{amount:10000,method:'cash',reference:'TEST-REFUND',confirmed:true,refunded_at:new Date().toISOString()});
      assert.equal((await rows('SELECT status FROM distribution_orders WHERE order_id='+first.id))[0].status,'refunded');
      assert.equal((await rows('SELECT * FROM distribution_relationships WHERE child_user_id=1 AND level=1')).length,1);
    });
    await t.test('backend balances settle and withdraw without any mini user identity',async()=>{
      await ledger.settleCommissions(null,1);
      const response=await api('/api/promoter/withdraws',token,{amount:100,bankName:'Test bank',accountName:'Test',account:'1234567890123456'});
      assert.equal(response.status,200,JSON.stringify(response.body));
      const w=(await rows('SELECT * FROM withdraw_records WHERE distributor_id=1'))[0];
      assert.equal(w.user_id,null);assert.ok(!w.account_info.includes('1234567890123456'));
      await ledger.reviewWithdrawal(w.id,true,'');await ledger.confirmWithdrawalPaid(w.id,'TEST-PAYOUT-001');
      assert.equal((await api('/api/promoter/dashboard',token)).body.data.summary.reconciliationRequired,false);
    });
    await t.test('reset password invalidates previous session',async()=>{
      const reset=await api('/api/admin/distribution/promoters/1/password',adminToken,{password:'Changed123'},'PUT');
      assert.equal(reset.status,200,JSON.stringify(reset.body));
      assert.equal((await api('/api/promoter/me',token)).status,401);
      assert.equal((await api('/api/promoter/login',null,{account:'backend-test',password:'Changed123'})).status,200);
    });
    await t.test('admin creation, random QR scene, cache, duplicate account and unified list',async()=>{
      const nativeFetch=globalThis.fetch;
      const env={id:process.env.WX_MINI_APP_ID,secret:process.env.WX_MINI_APP_SECRET};
      process.env.WX_MINI_APP_ID='test-app';process.env.WX_MINI_APP_SECRET='test-secret';
      let wxCalls=0;
      globalThis.fetch=async(url,options)=>{
        if(String(url).startsWith('https://api.weixin.qq.com/')){
          wxCalls++;
          if(String(url).includes('stable_token'))return new Response(JSON.stringify({access_token:'fixture-token',expires_in:7200}),{status:200});
          const body=JSON.parse(options.body);
          assert.match(body.scene,/^ref=BP[a-f0-9]{24}$/);assert.equal(body.page,'pages/index/index');
          return new Response(Buffer.from([137,80,78,71,13,10,26,10]),{status:200});
        }
        return nativeFetch(url,options);
      };
      try{
        const body={nickname:'Created',phone:'',avatar_url:'http://localhost:5005/uploads/admin/images/promoter-avatar/test-avatar.png',login_name:'created-account',password:'Created123'};
        const created=await api('/api/admin/distribution/promoters',adminToken,body);
        assert.equal(created.status,200,JSON.stringify(created.body));assert.match(created.body.data.qr.image,/^data:image\/png;base64,/);
        const id=created.body.data.id;const stored=(await rows('SELECT user_id,contact_phone,avatar_url FROM distributors WHERE id='+id))[0];
        assert.equal(stored.user_id,null);assert.equal(stored.contact_phone,null);assert.equal(stored.avatar_url,'/uploads/admin/images/promoter-avatar/test-avatar.png');
        assert.equal((await api('/api/admin/distribution/promoters/'+id+'/qr',adminToken)).status,200);assert.equal(wxCalls,2);
        const session=await api('/api/promoter/login',null,{account:body.login_name,password:body.password});
        assert.equal(session.status,200);
        assert.equal((await api('/api/admin/distribution/promoters/'+id+'/status',adminToken,{status:'disabled'},'PUT')).status,200);
        assert.equal((await api('/api/promoter/me',session.body.data.token)).status,401);
        await assert.rejects(db.transaction(conn=>referrals.attachAppointmentReferral(conn,first.appointment_id,created.body.data.qr.code)),{referralInvalid:true});
        assert.equal((await api('/api/admin/distribution/promoters/'+id+'/status',adminToken,{status:'active'},'PUT')).status,200);
        assert.equal((await api('/api/promoter/me',session.body.data.token)).status,401);
        assert.equal((await api('/api/admin/distribution/promoters',adminToken,body)).status,409);
        const list=(await api('/api/admin/distribution/promoters',adminToken)).body.data;
        assert.ok(list.some(r=>r.source_type==='backend'));assert.ok(list.some(r=>r.source_type==='mini'));
        assert.equal((await rows('SELECT COUNT(*) n FROM users'))[0].n,8);
      }finally{
        globalThis.fetch=nativeFetch;
        if(env.id===undefined)delete process.env.WX_MINI_APP_ID;else process.env.WX_MINI_APP_ID=env.id;
        if(env.secret===undefined)delete process.env.WX_MINI_APP_SECRET;else process.env.WX_MINI_APP_SECRET=env.secret;
      }
    });
    await t.test('cashier API and verified online payment both carry referral snapshots',async()=>{
      const edited=await api('/api/admin/products/1',adminToken,{status:'on',backend_referral_enabled:1,backend_rate_x:25,backend_rate_y:8},'PUT');
      assert.equal(edited.status,200,JSON.stringify(edited.body));
      const products=(await api('/api/admin/products',adminToken)).body.data;
      assert.equal(Number(products.find(p=>p.id===1).backend_rate_x),25);
      for(const [user,payment] of [[7,'cash'],[8,'wechat']]){
        const fixture=await order(user);
        const appointment=(await rows('SELECT * FROM appointments WHERE id='+fixture.appointment_id))[0];
        const created=await api('/api/admin/orders',adminToken,{patient_id:appointment.patient_id,appointment_id:appointment.id,store_id:1,items:[{product_id:1,quantity:1}],pay_amount:10000,pay_method:payment,payment_confirmed:true});
        assert.equal(created.status,200,JSON.stringify(created.body));
        const id=created.body.data.order_id;
        if(payment==='wechat'){
          assert.equal((await rows('SELECT * FROM distribution_orders WHERE order_id='+id)).length,0);
          const pending=(await rows('SELECT * FROM orders WHERE id='+id))[0];
          const {finalizePaidProductOrder}=await import('../routes/client.js');
          const receipt={trade_state:'SUCCESS',out_trade_no:pending.order_no,amount:{currency:'CNY',total:10000},transaction_id:'FIXTURE-ONLINE-'+id};
          await db.transaction(conn=>finalizePaidProductOrder(conn,pending,receipt));
          await db.transaction(conn=>finalizePaidProductOrder(conn,pending,receipt));
        }
        const commissions=await rows('SELECT * FROM distribution_orders WHERE order_id='+id);
        assert.deepEqual(commissions.map(c=>[c.commission_kind,c.commission_amount]),[['referral_new',2500]]);
        const detail=await api('/api/admin/appointments/'+appointment.id,adminToken);
        assert.equal(detail.body.data.referral_promoter_name,'Backend');
      }
    });
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    if(db)await db.closePool();
    assert.match(schema,/^hanjing_test_backend_promoters_[0-9]+$/);
    await admin.query('DROP DATABASE '+schema);await admin.end();
  }
});
