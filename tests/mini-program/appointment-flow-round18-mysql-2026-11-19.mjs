import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';

const dir=path.dirname(fileURLToPath(import.meta.url));
const fixture=path.join(dir,'appointment-flow-round15-2026-11-19.cjs');
const output=path.join(dir,process.env.APPOINTMENT_ROUND17_OUTPUT || 'artifacts/appointment-flow-round18-2026-11-19');
fs.mkdirSync(output,{recursive:true});
const env=JSON.parse(execFileSync('docker',['inspect','hanjing-mysql'],{encoding:'utf8'}))[0].Config.Env;
const password=env.find(x=>x.startsWith('MYSQL_ROOT_PASSWORD='))?.slice('MYSQL_ROOT_PASSWORD='.length);
assert.ok(password);
const schema='appt_test_'+randomBytes(8).toString('hex');
const config={host:'127.0.0.1',user:'root',password};
const admin=await mysql.createConnection(config);
let pool,created=false;
try{
  await admin.query('CREATE DATABASE '+schema);created=true;
  pool=mysql.createPool({...config,database:schema,connectionLimit:6});
  await pool.query("CREATE TABLE appointments(id VARCHAR(20) PRIMARY KEY,user_id INT,status VARCHAR(24),appointment_no VARCHAR(64)) ENGINE=InnoDB");
  await pool.query("CREATE TABLE orders(id INT PRIMARY KEY,appointment_id VARCHAR(20)) ENGINE=InnoDB");
  await pool.query("CREATE TABLE appointment_charges(id INT AUTO_INCREMENT PRIMARY KEY,appointment_id VARCHAR(20),charge_no VARCHAR(64) UNIQUE,status VARCHAR(24) DEFAULT 'pending',payment_method VARCHAR(24),consult_fee INT,deposit_amount INT,prepay_lease_until DATETIME(6)) ENGINE=InnoDB");
  await pool.query("INSERT INTO appointments VALUES ('a',1,'pending_payment','legacy-a')");
  await pool.query("INSERT INTO appointment_charges(appointment_id,charge_no,payment_method,consult_fee,deposit_amount) VALUES ('a','charge-a','wechat',3000,5000)");
  const db={
    async transaction(fn){const conn=await pool.getConnection();try{await conn.beginTransaction();const value=await fn(conn);await conn.commit();return value;}catch(e){await conn.rollback();throw e;}finally{conn.release();}},
    async run(sql,args){const [result]=await pool.execute(sql,args);return {changes:result.affectedRows};},
    async get(sql,args){const [rows]=await pool.execute(sql,args);return rows[0];},
  };

  await pool.query("ALTER TABLE appointments ADD updated_at DATETIME");
  await pool.query("ALTER TABLE orders ADD pay_at DATETIME");
  await pool.query("ALTER TABLE appointment_charges ADD paid_at DATETIME, ADD provider_transaction_id VARCHAR(64) UNIQUE, ADD payment_reference VARCHAR(128), ADD credited INT, ADD collected_by_admin_id INT, ADD collected_by_name VARCHAR(60), ADD collection_source VARCHAR(40)");
  const no='legacy-a';
  await pool.query("DELETE FROM appointment_charges");
  await pool.query("ALTER TABLE orders MODIFY id INT AUTO_INCREMENT, ADD order_no VARCHAR(64), ADD user_id INT, ADD type VARCHAR(40), ADD total_amount INT, ADD discount_amount INT, ADD coupon_id INT, ADD pay_amount INT, ADD pay_method VARCHAR(20), ADD status VARCHAR(30), ADD wechat_transaction_id VARCHAR(64), ADD wechat_prepay_id VARCHAR(64), ADD collection_source VARCHAR(40), ADD shipping_address TEXT");
  await pool.query("CREATE TABLE payment_claims(id VARCHAR(64) PRIMARY KEY) ENGINE=InnoDB");
  const root=path.join(dir,'../../hanjing-clinic-backend');
  const source=fs.readFileSync(path.join(root,'routes/client.js'),'utf8');
  const charges=fs.readFileSync(path.join(root,'appointment-charges.js'),'utf8');
  const slice=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)+a.length)).replaceAll('export async','async');
  const logic=slice(source,'export async function finalizePaidAppointment','export async function finalizePaidProductOrder')+slice(charges,'export async function readChargeOperator','export async function prepareCharge')
    +slice(charges,'async function insertRefund','export async function queueCancelledChargeRefunds')
    +slice(source,'async function queryAppointmentOrderBeforePay','const appointmentPrepayFlights')
    +slice(source,"app.post('/api/v1/appointments/:id/confirm-pay'","// 获取预约配置公开信息 API");
  const payment={out_trade_no:no,trade_state:'SUCCESS',transaction_id:'test-wx-id',amount:{total:8000,currency:'CNY'}};
  const results=[];
  const gate=()=>{let release;const wait=new Promise(r=>release=r);return {wait,release};};
  for(const mode of ['both-seen-pending','callback-between-reads','callback-already-committed','confirm-first','repeat-confirm-and-callback']){
    await pool.query("UPDATE appointments SET status='pending_payment'");
    await pool.query('DELETE FROM orders');await pool.query('DELETE FROM payment_claims');
    let settlements=0,notices=0;
    const reached=gate(),resume=gate();
    function instance(confirm){
      const routes={};
      vm.runInNewContext(logic,{...db,Buffer,crypto:{randomBytes},getAppointmentPayAmount:async()=>8000,writeNotification:async()=>{notices++;},claimWechatOrderPayment:(conn,id)=>conn.execute("INSERT INTO payment_claims VALUES (?)",[id]), console:{error(){}},authenticateWxToken(){},
        app:{post(url,...args){routes[url.split('/').at(-1)]=args.at(-1);}},
        get:async(sql,args)=>{
          if(confirm&&mode==='callback-between-reads'&&sql.includes("status='pending'")){reached.release();await resume.wait;}
          return db.get(sql,args);
        },
        queryOrderByOutTradeNo:async order=>{
          if(order!==no)throw Object.assign(Error('不存在'),{statusCode:404,data:{code:'ORDER_NOT_EXIST'}});
          if(confirm&&mode==='both-seen-pending'){reached.release();await resume.wait;}
          return payment;
        },
        verifyWechatPayCallback:async()=>true,serviceDecryptWechatPayResource:async()=>payment,
        businessError:(message,statusCode)=>Object.assign(Error(message),{statusCode}),
        online:()=>true,chargeAmount:()=>8000,appointmentFeeSnapshot:()=>({consult_fee:3000,deposit_amount:5000}),
        syncUserMembership:async()=>{settlements++;},notifyBusiness:async()=>{notices++;},orderCoversAppointmentFees:()=>false,
        assertAppointmentFeesPaid:async conn=>{const [[r]]=await conn.query("SELECT COUNT(*) AS n FROM orders WHERE status='paid'");assert.equal(r.n,1);},
      });
      return async action=>{
        const response={statusCode:200,status(n){this.statusCode=n;return this;},json(body){this.body=body;}};
        await routes[action]({params:{id:'a'},user:{id:1},body:{resource:{}}},response);
        return {status:response.statusCode,body:response.body};
      };
    }
    const confirm=instance(true),callback=instance(false);
    let responses;
    if(mode==='confirm-first'){responses=[await confirm('confirm-pay'),await callback('pay-callback')];}else if(mode==='callback-already-committed'){
      responses=[await callback('pay-callback'),await confirm('confirm-pay')];
    }else if(mode==='repeat-confirm-and-callback'){
      responses=await Promise.all([confirm('confirm-pay'),callback('pay-callback'),callback('pay-callback'),confirm('confirm-pay')]);
    }else{
      const c=confirm('confirm-pay');await reached.wait;
      const w=await callback('pay-callback');resume.release();responses=[w,await c];
    }
    const row=await db.get("SELECT status FROM appointments WHERE id='a'");
    const records=await db.get("SELECT COUNT(*) AS n FROM orders WHERE status='paid' AND wechat_transaction_id='test-wx-id' AND pay_at IS NOT NULL");
    const orders=await db.get("SELECT COUNT(*) AS n FROM orders");
    results.push({mode,responses,status:row.status,records:records.n,legacyOrders:orders.n,settlements,notices,
      passed:responses.every(r=>r.status===200)&&row.status==='pending'&&records.n===1&&orders.n===1&&settlements===1&&notices===1});
  }
  fs.writeFileSync(path.join(output,'mysql.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));process.exitCode=results.some(r=>!r.passed)?1:0;
}finally{
  if(pool)await pool.end();
  if(created)await admin.query('DROP DATABASE '+schema);
  await admin.end();
}
