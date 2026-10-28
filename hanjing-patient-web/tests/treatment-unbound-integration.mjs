// Explicit local integration: unique disposable user + patient, cleaned by exact IDs.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
if(process.env.PC_RUN_LOCAL_INTEGRATION!=='1')throw Error('Set PC_RUN_LOCAL_INTEGRATION=1 to create disposable local test data');
if(!['127.0.0.1','localhost'].includes(process.env.DB_HOST || ''))throw Error('Only a local database is permitted');
const {run,get,closePool}=await import('../../hanjing-clinic-backend/db.js');
const {hashPassword,encryptPII}=await import('../../hanjing-clinic-backend/helpers.js');
let userId,patientId,token;const mark='pc_unbound_'+crypto.randomBytes(8).toString('hex'),phone='199'+crypto.randomInt(10000000,99999999),password='Pc!'+crypto.randomBytes(16).toString('hex');const checks=[];
const api=async(path,method='GET',data)=>{const res=await fetch('http://127.0.0.1:3003/api/v1'+path,{method,headers:{'content-type':'application/json',Authorization:'Bearer '+token},body:data?JSON.stringify(data):undefined});const body=await res.json();assert.ok(res.ok&&body.code===0,path+': '+body.message);return body.data!==undefined?body.data:body};
try{
 assert.equal(await get('SELECT id FROM users WHERE phone IN (?,?)',[phone,encryptPII(phone)]),null);
 userId=(await run('INSERT INTO users (openid,nickname,phone,password_hash,points) VALUES (?,?,?,?,0)',[mark,mark,encryptPII(phone),hashPassword(password)])).id;
 token=(await api('/auth/password-login','POST',{phone,password})).access_token;
 patientId=(await api('/user/family-members','POST',{name:mark,relation:'self',gender:1,birthday:'1990-01-01'})).id;
 const before=await get('SELECT COUNT(*) AS n FROM patient_devices WHERE patient_id=?',[patientId]);assert.equal(Number(before.n),0);checks.push('no device binding');
 assert.equal(await api('/treatment/record?patientId='+patientId),null);checks.push('no treatment record');
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await api('/treatment/wearing','POST',{patientId,date,wearDuration:6,painScore:0,comfort:5,painLocations:[],note:mark});
 let rows=await api('/treatment/wearing-records?patientId='+patientId);assert.ok(rows.some(r=>r.date===date&&r.wearDuration===6&&r.painScore===0));checks.push('unbound checkin persisted and readable');
 await api('/treatment/wearing','POST',{patientId,date,wearDuration:8,painScore:3,comfort:3,painLocations:['上颌左关节痛'],note:mark});
 rows=await api('/treatment/wearing-records?patientId='+patientId);assert.equal(rows.filter(r=>r.date===date).length,1);assert.equal(rows[0].wearDuration,8);assert.deepEqual(rows[0].painLocations,['上颌左关节痛']);checks.push('same-day update preserves one record and pain locations');
 const log=await get('SELECT patient_device_id,treatment_id FROM wearing_logs WHERE patient_id=? AND date=? AND source=?',[patientId,date,'mini_program_checkin']);assert.equal(log.patient_device_id,null);assert.equal(log.treatment_id,null);checks.push('device and treatment foreign keys remain null');
 const summary=await api('/treatment/wearing-summary?patientId='+patientId);assert.equal(summary.weekWorn,1);assert.equal(summary.weekAvg,8);checks.push('unbound record contributes to summary');
 assert.equal(Number((await get('SELECT COUNT(*) AS n FROM patient_devices WHERE patient_id=?',[patientId])).n),0);assert.equal(await api('/treatment/record?patientId='+patientId),null);checks.push('checkin does not fabricate device or treatment');
 console.log(JSON.stringify({passed:checks.length,checks}));
}finally{
 if(patientId){await run('DELETE FROM wearing_logs WHERE patient_id=?',[patientId]);await run('DELETE FROM user_patient_links WHERE patient_id=?',[patientId]);await run('DELETE FROM patients WHERE id=?',[patientId])}
 if(userId){await run('DELETE FROM user_patient_links WHERE user_id=?',[userId]);await run('DELETE FROM users WHERE id=? AND openid=?',[userId,mark])}
 await closePool();console.log('Disposable local records cleaned');
}
