import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
const require=createRequire(new URL('../../hanjing-clinic-backend/package.json',import.meta.url));
const mysql=require('mysql2/promise'),express=require('express'),jwt=require('jsonwebtoken');
const schema='hanjing_test_community_'+Date.now(),results=[];
const credentials={host:'127.0.0.1',user:process.env.TEST_DB_USER||'root',password:process.env.TEST_DB_PASSWORD||'root'};
const control=await mysql.createConnection(credentials);let db,server;
async function check(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',actual:e.message});}}
await control.query('CREATE DATABASE `'+schema+'`');
try{
 Object.assign(process.env,{DB_HOST:credentials.host,DB_PORT:'3306',DB_USER:credentials.user,DB_PASSWORD:credentials.password,DB_NAME:schema,JWT_SECRET:randomBytes(48).toString('hex')});
 db=await import('../../hanjing-clinic-backend/db.js');await db.initDB();
 await db.run("INSERT INTO users(id,openid,nickname) VALUES(1,'COMM-TEST-1','Owner'),(2,'COMM-TEST-2','Actor')");
 const {JWT_SECRET}=await import('../../hanjing-clinic-backend/helpers.js');
 const app=express();app.use(express.json(),(await import('../../hanjing-clinic-backend/routes/client.js')).default);
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const token=jwt.sign({id:2,openid:'COMM-TEST-2'},JWT_SECRET,{expiresIn:'5m'});
 const api=async(path,body,auth=true)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/community${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});return {status:r.status,body:await r.json()};};
 let id,comment;
 await check('publish and public detail work',async()=>{const r=await api('/posts',{title:'Test post',content:'Ordinary test content',tags:['睡眠科普']});assert.equal(r.status,200);id=r.body.data.id;assert.equal((await api('/posts/'+id,undefined,false)).status,200);});
 await check('unauthenticated write rejected',async()=>assert.equal((await api('/posts',{title:'Test',content:'Test'},false)).status,401));
 await check('COMM-05 whitespace title/content rejected',async()=>assert.equal((await api('/posts',{title:'   ',content:'   '})).status,400));
 await check('COMM-05 non-string title rejected',async()=>assert.equal((await api('/posts',{title:{text:'invalid'},content:'Test'})).status,400));
 await check('COMM-05 title beyond UI limit rejected',async()=>assert.equal((await api('/posts',{title:'a'.repeat(41),content:'Test'})).status,400));
 await check('COMM-06 whitespace comment rejected',async()=>assert.equal((await api('/posts/'+id+'/comment',{content:'   '})).status,400));
 await check('COMM-06 comment beyond UI limit rejected',async()=>assert.equal((await api('/posts/'+id+'/comment',{content:'a'.repeat(501)})).status,400));
 await check('ordinary comment accepted',async()=>{const r=await api('/posts/'+id+'/comment',{content:'Ordinary comment'});assert.equal(r.status,200);comment=r.body.data.id;});
 await check('duplicate post like remains single row',async()=>{await api('/posts/'+id+'/like',{isLiked:true});await api('/posts/'+id+'/like',{isLiked:true});assert.equal((await db.get('SELECT COUNT(*) AS n FROM community_post_likes WHERE post_id=?',[id])).n,1);});
 await check('cross-post parent reply rejected',async()=>{const r=await api('/posts',{title:'Another',content:'Another post'});assert.equal((await api('/posts/'+r.body.data.id+'/comment',{content:'reply',parentId:comment})).status,400);});
 await check('pending post hidden from public detail and post likes',async()=>{await db.run("UPDATE community_posts SET status='pending' WHERE id=?",[id]);assert.equal((await api('/posts/'+id,undefined,false)).status,404);assert.equal((await api('/posts/'+id+'/like',{isLiked:true})).status,404);});
 await check('COMM-07 approved comment on pending post cannot be liked',async()=>{const r=await api('/comments/'+comment+'/like',{isLiked:true});assert.equal(r.status,404);});
 await check('COMM-08 ordinary account cannot classify its post as expert',async()=>{const r=await api('/posts',{title:'Ordinary account',content:'Not an expert',tags:['专家']});assert.ok(r.status===400 || !r.body.data.tags.includes('专家'),'patient role accepted expert category');});
}finally{
 if(server)await new Promise(resolve=>server.close(resolve));if(db)await db.closePool();
 assert.match(schema,/^hanjing_test_community_\d+$/);await control.query('DROP DATABASE `'+schema+'`');
 const [rows]=await control.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[schema]);await control.end();
 results.push({name:'temporary database cleaned',status:rows.length?'FAIL':'PASS'});
 console.log(JSON.stringify({scope:'real HTTP/MySQL isolated database, signed test identities; no WeChat/device',schema,total:results.length,passed:results.filter(x=>x.status==='PASS').length,results},null,2));
 if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}
