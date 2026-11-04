import assert from 'node:assert/strict';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import { appointmentNumberSchema, nextAppointmentNumber } from '../../hanjing-clinic-backend/appointment-number.js';
const schema='hanjing_test_numbers_'+Date.now();
const control=await mysql.createConnection({host:'127.0.0.1',user:'root',password:process.env.TEST_DB_PASSWORD});
let pool;
try {
 await control.query('CREATE DATABASE '+schema);
 pool=mysql.createPool({host:'127.0.0.1',user:'root',password:process.env.TEST_DB_PASSWORD,database:schema,connectionLimit:12});
 await pool.query(appointmentNumberSchema);
 const allocate=async(date,rollback=false)=>{const conn=await pool.getConnection();try {await conn.beginTransaction();const no=await nextAppointmentNumber(conn,date);if(rollback)await conn.rollback();else await conn.commit();return no;}catch(e){await conn.rollback();throw e;}finally{conn.release();}};
 const numbers=await Promise.all(Array.from({length:60},()=>allocate('2026-11-04')));
 assert.equal(new Set(numbers).size,60);assert.equal(numbers.sort()[0],'AP202611040001');assert.equal(numbers.sort().at(-1),'AP202611040060');
 assert.equal(await allocate('2026-11-05'),'AP202611050001');
 assert.equal(await allocate('2026-11-04',true),'AP202611040061');assert.equal(await allocate('2026-11-04'),'AP202611040061');
 await pool.execute('UPDATE appointment_number_sequences SET last_number=9999 WHERE appointment_date=?',['2026-11-04']);
 assert.equal(await allocate('2026-11-04'),'AP2026110410000');
 await assert.rejects(allocate('2026-02-30'),/预约日期无效/);
 console.log('PASS: 60 concurrent allocations, independent dates, rollback, 10000 expansion, invalid date');
}finally{if(pool)await pool.end();await control.query('DROP DATABASE '+schema);await control.end();}
