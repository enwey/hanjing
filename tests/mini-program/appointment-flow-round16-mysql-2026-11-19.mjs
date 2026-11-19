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
const output=path.join(dir,'artifacts/appointment-flow-round16-2026-11-19');
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
  const code=fs.readFileSync(fixture,'utf8').replace(/\r\n/g,'\n').split('(async()=>{\n  for(const [name')[0];
  const module={exports:{}};
  vm.runInNewContext(code.replace(/    transaction\(fn\)[\s\S]*?    appointmentFeeSnapshot:/,
    '    ...db,\n    appointmentFeeSnapshot:').replace('reference:()=>`charge-${seq+1}`','reference:()=>randomBytes(12).toString("hex")')
    +'\nmodule.exports={backend,open,create,tick};',
    {module,require:createRequire(fixture),__dirname:dir,Buffer,console,structuredClone,queueMicrotask,setImmediate,setTimeout,clearTimeout,process,db,randomBytes});
  const {backend,open,create,tick}=module.exports;
  const server=backend('closed-cross-instance');
  const snapshot=async()=>(await pool.query('SELECT charge_no,status,prepay_lease_until IS NOT NULL AS leased FROM appointment_charges ORDER BY id'))[0];
  async function pair(){
    const callbacks=[];
    const a=await open(server,create(),'list',callbacks);
    const b=await open({...server,request:server.instance()},create(),'detail',callbacks);
    const both=Promise.all([a(),b()]);
    const deadline=Date.now()+5000;
    while(!callbacks.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));
    for(const cb of callbacks)cb.fail({errMsg:'requestPayment:fail cancel'});
    await Promise.race([both,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('payment pair timed out')),5000);timer.unref();})]);
    assert.equal(callbacks.length,1);
  }
  await pair();
  const closed=await snapshot();
  assert.deepEqual(closed.map(x=>x.status),['cancelled','pending']);
  assert.equal(closed[1].leased,1);assert.deepEqual(Array.from(server.calls.builds),[closed[1].charge_no]);assert.equal(server.calls.native.length,1);
  await pairBlocked();
  async function pairBlocked(){
    const requests=await Promise.allSettled([server.instance()('pay'),server.instance()('pay')]);
    assert.ok(requests.every(x=>x.status==='rejected'&&x.reason.statusCode===409));
    assert.equal(server.calls.builds.length,1);
  }
  await pool.query("UPDATE appointment_charges SET prepay_lease_until=UTC_TIMESTAMP(6) WHERE status='pending'");
  server.advance(120,'NOTPAY');const before=server.calls.queries.length;
  await pair();
  const expired=await snapshot();
  assert.deepEqual(expired,closed);
  assert.deepEqual(Array.from(server.calls.builds),[closed[1].charge_no,closed[1].charge_no]);assert.equal(server.calls.native.length,2);
  assert.equal(server.calls.queries.slice(before).filter(x=>x===closed[1].charge_no).length,2);
  const result={closed,expired,calls:server.calls,version:(await admin.query('SELECT VERSION() AS version'))[0][0].version};
  fs.writeFileSync(path.join(output,'mysql.json'),JSON.stringify(result,null,2));
  console.log('PASS: closed order concurrency, active lease rejection, expired lease concurrency');
}finally{
  if(pool)await pool.end();
  if(created)await admin.query('DROP DATABASE '+schema);
  await admin.end();
}
