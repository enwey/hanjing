import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import mysql from '../../hanjing-clinic-backend/node_modules/mysql2/promise.js';
import express from '../../hanjing-clinic-backend/node_modules/express/index.js';
import jwt from '../../hanjing-clinic-backend/node_modules/jsonwebtoken/index.js';

const env = JSON.parse(execFileSync('docker', ['inspect','hanjing-mysql'], {encoding:'utf8'}))[0].Config.Env;
const password = env.find(line => line.startsWith('MYSQL_ROOT_PASSWORD='))?.slice('MYSQL_ROOT_PASSWORD='.length);
assert.ok(password);
const schema = 'hanjing_test_mall_retry_' + Date.now();
const control = await mysql.createConnection({host:'127.0.0.1',user:'root',password});
const http = globalThis.fetch;
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const apiKey=randomBytes(16).toString('hex');
let created, db, server;
try {
  await control.query('CREATE DATABASE ' + schema);
  created = true;
  Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'3306',DB_USER:'root',DB_PASSWORD:password,DB_NAME:schema,
    NODE_ENV:'test', JWT_SECRET:randomBytes(48).toString('hex'),PII_ENCRYPTION_KEY:randomBytes(16).toString('hex'),
    WX_MINI_APP_ID:'fixture-app',WX_MINI_APP_SECRET:'fixture-secret',WECHAT_APP_ID:'fixture-app',
    WECHAT_PAY_MCH_ID:'fixture-merchant',WECHAT_PAY_SERIAL_NO:'fixture-serial',
    WECHAT_PAY_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}),
    WECHAT_PAY_PLATFORM_CERT:publicKey.export({type:'spki',format:'pem'}),
    WECHAT_PAY_API_V3_KEY:apiKey,WECHAT_PAY_NOTIFY_URL:'https://payments.example.invalid/api/v1/orders/pay-callback'});
  globalThis.fetch = async (url, options) => {
    const u = new URL(url);
    if (u.hostname === 'api.weixin.qq.com') {
      if (u.pathname === '/sns/jscode2session') {
        const code=u.searchParams.get('js_code');
        return Response.json({openid:code==='fixture'?'fixture-booking-user':'fixture-booking-'+code});
      }
      if (u.pathname === '/cgi-bin/stable_token') return Response.json({access_token:'fixture-token',expires_in:7200});
      if (u.pathname === '/wxa/business/getuserphonenumber') {
        const code=JSON.parse(options.body).code;
        return Response.json({errcode:0,phone_info:{purePhoneNumber:code==='fixture-phone'?'13800009101':'138000092'+code.slice(-2)}});
      }
    }
    throw Error('Unexpected upstream call');
  };
  db = await import('../../hanjing-clinic-backend/db.js');
  await db.initDB();
  await db.run("INSERT INTO roles(id,name,code,data_scope) VALUES(9000,'隔离管理员','super_admin',?)",[JSON.stringify({type:'system',all_stores:false,store_ids:[]})]);
  await db.run("INSERT INTO admin_users(id,username,password_hash,name,role_id) VALUES(9000,'fixture-admin','unused','隔离管理员',9000)");
  const admin = jwt.sign({id:9000,role:'super_admin',token_version:0},process.env.JWT_SECRET);
  const app = express();
  app.use('/api/v1/orders/pay-callback',express.raw({type:'application/json'}));
  app.use(express.json());
  app.use((await import('../../hanjing-clinic-backend/routes/promoter.js')).default);
  app.use((await import('../../hanjing-clinic-backend/routes/admin.js')).default);
  const client=await import('../../hanjing-clinic-backend/routes/client.js');
  app.use(client.default);
  // Match the production JSON error envelope without enabling its alerts.
  app.use((error,_req,res,_next)=>{
    const status=error.statusCode || error.status || 500;
    res.status(status).json({code:status,message:status>=500?'系统繁忙，请稍后再试':error.message || '请求失败'});
  });
  server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  async function call(path,body,token,method=body?'POST':'GET') {
    const r=await http('http://127.0.0.1:'+server.address().port+path,{method,
      headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    const json=await r.json();
    return {status:r.status,...json};
  }
  async function ok(path,body,token) {
    const r=await call(path,body,token);assert.equal(r.status,200,r.message);return r.data;
  }
  const store=await ok('/api/admin/stores',{name:'隔离门店',code:'LOST',address:'隔离地址'},admin);

  const login=await ok('/api/v1/auth/wx-login',{code:'fixture',phoneCode:'fixture-phone'});
  const token=login.access_token;
  const product=await ok('/api/admin/products',{name:'Mall fixture',category:'accessory',price:10000,status:'on',stock:20},admin);
  const body={requestId:'mall-regression-001',items:[{productId:product.id,quantity:1}],shippingAddress:{deliveryMethod:'pickup',storeId:store.id,contactName:'Fixture',phone:'13800009101'}};
  const [a,b]=await Promise.all([ok('/api/v1/orders',body,token),ok('/api/v1/orders',body,token)]);
  const later=await ok('/api/v1/orders',body,token);
  assert.equal(a.id,b.id);
  assert.equal(a.id,later.id);
  assert.equal(later.replayed,true);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM order_items WHERE product_id=?',[product.id])).n),1);
  assert.equal(Number((await db.get('SELECT stock FROM products WHERE id=?',[product.id])).stock),19);
  console.log('MySQL concurrent retry and later replay: one order item, stock reserved once');
} finally {
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  try { await db?.closePool(); if(created) await control.query('DROP DATABASE '+schema); }
  finally { await control.end(); }
}
