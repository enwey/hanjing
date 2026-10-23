import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
const require=createRequire(new URL('../../hanjing-clinic-backend/package.json',import.meta.url));
const mysql=require('mysql2/promise'),express=require('express'),jwt=require('jsonwebtoken');
const schema='hanjing_test_comm2_'+Date.now(),results=[];
const credentials={host:'127.0.0.1',user:process.env.TEST_DB_USER||'root',password:process.env.TEST_DB_PASSWORD||'root'};
const control=await mysql.createConnection(credentials);let db,server;
async function check(name,fn){try{await fn();results.push({name,status:'PASS'})}catch(e){results.push({name,status:'FAIL',actual:e.message})}}
await control.query('CREATE DATABASE `'+schema+'`');
try{
 Object.assign(process.env,{DB_HOST:credentials.host,DB_PORT:'3306',DB_USER:credentials.user,DB_PASSWORD:credentials.password,DB_NAME:schema,JWT_SECRET:randomBytes(48).toString('hex')});
 db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
 await db.run("INSERT INTO users(id,openid,nickname) VALUES(1,'COMM2','Tester')");
 await db.run("INSERT INTO community_posts(id,user_id,title,content,status) VALUES(1,1,'test','test','approved')");
 const {JWT_SECRET}=await import('../../hanjing-clinic-backend/helpers.js');
 const app=express();app.use(express.json(),(await import('../../hanjing-clinic-backend/routes/client.js')).default);
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const token=jwt.sign({id:1,openid:'COMM2'},JWT_SECRET,{expiresIn:'5m'});
 const api=async(action,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/community/posts/1/${action}`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});return {status:r.status,body:await r.json()};};
 await check('COMM-14 concurrent duplicate reports create at most one pending row',async()=>{
   const responses=await Promise.all(Array.from({length:16},()=>api('report',{reason:'其他原因'})));
   assert.ok(responses.every(x=>x.status===200));
   const row=await db.get("SELECT COUNT(*) AS n FROM community_reports WHERE user_id=1 AND post_id=1 AND status='pending'");
   assert.equal(row.n,1,'pending report rows='+row.n);
 });
 await check('COMM-15 whitespace report rejected',async()=>assert.equal((await api('report',{reason:'   '})).status,400));
 await check('COMM-15 overlength report rejected with 400',async()=>assert.equal((await api('report',{reason:'a'.repeat(101)})).status,400));
 await check('COMM-16 nonboolean like flag rejected',async()=>assert.equal((await api('like',{isLiked:'false'})).status,400));
 await check('COMM-16 nonboolean favorite flag rejected',async()=>assert.equal((await api('favorite',{isFavorited:'false'})).status,400));
 await check('concurrent true likes keep count aligned',async()=>{await Promise.all(Array.from({length:12},()=>api('like',{isLiked:true})));const row=await db.get('SELECT likes_count FROM community_posts WHERE id=1');const rel=await db.get('SELECT COUNT(*) AS n FROM community_post_likes WHERE post_id=1');assert.equal(row.likes_count,rel.n);assert.equal(rel.n,1);});
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.closePool();assert.match(schema,/^hanjing_test_comm2_\d+$/);await control.query('DROP DATABASE `'+schema+'`');const [left]=await control.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[schema]);await control.end();results.push({name:'test schema removed',status:left.length?'FAIL':'PASS'});
 console.log(JSON.stringify({schema,total:results.length,passed:results.filter(x=>x.status==='PASS').length,scope:'isolated real MySQL/HTTP, signed fixture identity',results},null,2));if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}
