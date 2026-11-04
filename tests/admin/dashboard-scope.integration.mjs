// Read-only local integration: invokes real dashboard handlers and MySQL queries.
import assert from 'node:assert/strict';
import router from '../../hanjing-clinic-backend/routes/admin.js';
import { get, query, closePool } from '../../hanjing-clinic-backend/db.js';
async function call(path, user, range='month') {
 const route=router.stack.find(layer=>layer.route?.path===path).route;
 return new Promise((resolve,reject)=>{
  const res={statusCode:200,status(code){this.statusCode=code;return this},json(body){resolve({status:this.statusCode,body})}};
  route.stack.at(-1).handle({user,query:{range}},res,reject);
 });
}
try {
 const doctor=await get('SELECT id FROM doctors ORDER BY id LIMIT 1');
 const store=await get('SELECT id FROM stores ORDER BY id LIMIT 1');
 const cases=[
  {name:'self',user:{role:'doctor',doctor_id:doctor.id,store_ids:[]},where:'doctor_id=?',params:[doctor.id]},
  {name:'store',user:{role:'doctor',doctor_id:doctor.id,store_ids:[store.id],effective_data_scope:{type:'store',all_stores:false,store_ids:[store.id]}},where:'store_id=?',params:[store.id]},
  {name:'all',user:{role:'doctor',all_stores:true,store_ids:[],effective_data_scope:{type:'system'}},where:'1=1',params:[]},
  {name:'empty self',user:{role:'staff',store_ids:[]},where:'1=0',params:[]}
 ];
 for(const c of cases){
  for(const range of ['today','week','month']){
   const result=await call('/api/admin/dashboard/stats',c.user,range);
   assert.equal(result.status,200,c.name+' '+range);
   const dates={today:'appointment_date=CURDATE()',week:'YEARWEEK(appointment_date,1)=YEARWEEK(CURDATE(),1)',month:"appointment_date>=DATE_FORMAT(CURDATE(),'%Y-%m-01') AND appointment_date<DATE_ADD(LAST_DAY(CURDATE()),INTERVAL 1 DAY)"};
   const expected=await get(`SELECT COUNT(*) AS total FROM appointments WHERE ${dates[range]} AND ${c.where}`,c.params);
   assert.equal(Number(result.body.data.totalAppointments),Number(expected.total));
   if(c.name==='empty self') assert.equal(result.body.data.totalRevenue,0);
  }
  const lists=await call('/api/admin/dashboard/lists',c.user);assert.equal(lists.status,200);
  const expected=await query(`SELECT id FROM appointments WHERE appointment_date=CURDATE() AND ${c.where} ORDER BY appointment_time,id LIMIT 5`,c.params);
  assert.deepEqual(lists.body.data.appointments.map(x=>x.id),expected.map(x=>x.id));
  if(c.name==='empty self') assert.equal(lists.body.data.orders.length,0);
  console.log('PASS '+c.name+': 3 statistics ranges, scoped appointment list');
 }
} finally { await closePool(); }
