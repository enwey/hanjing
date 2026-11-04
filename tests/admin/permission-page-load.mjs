import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const base='http://localhost:3000',port=9357;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let browser,profile,ws;
try {
 const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:process.env.TEST_ADMIN_USER,password:process.env.TEST_ADMIN_PASSWORD})});
 assert.equal(login.status,200);const auth=(await login.json()).data;
 const me=await (await fetch(base+'/api/admin/me',{headers:{Authorization:'Bearer '+auth.token}})).json();
 const appointments=await (await fetch(base+'/api/admin/appointments?page=1&pageSize=1',{headers:{Authorization:'Bearer '+auth.token}})).json();
 const first=appointments.data.list?.[0] || appointments.data[0];
 profile=await mkdtemp(join(tmpdir(),'hanjing-permission-ui-'));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let n=0;n<60;n++){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)break;}catch{}await sleep(200);}
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 let id=0,pending=new Map(),responses=[],exceptions=[];
 ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Network.responseReceived'&&m.params.response.url.includes('/api/admin/'))responses.push({url:new URL(m.params.response.url).pathname,status:m.params.response.status});else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 await send('Page.enable');await send('Network.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.origin===${JSON.stringify(base)}){localStorage.setItem('auth_token',${JSON.stringify(auth.token)});localStorage.setItem('user_info',${JSON.stringify(JSON.stringify(me.data))});}`});
 const paths=['/appointment','/queue','/workbench','/patient','/doctor'];
 if(first){paths.push('/appointment/detail/'+first.id,'/patient/detail/'+first.patient_id,'/doctor/schedule/'+first.doctor_id,'/appointment/emr/'+first.id);}
 for(const path of paths){
  responses=[];exceptions=[];await send('Page.navigate',{url:base+path});
  for(let i=0;i<60;i++){await sleep(200);if(await evaluate(`document.readyState==='complete' && document.querySelector('#app')?.textContent?.length>100`))break;}
  await sleep(1800);
  const errors=responses.filter(r=>r.status>=400);
  const deniedText=await evaluate("document.body.innerText.includes('没有此操作的权限') || document.body.innerText.includes('获取商品列表失败')");
  assert.deepEqual(errors,[],path+': '+JSON.stringify(errors));assert.equal(deniedText,false,path);assert.deepEqual(exceptions,[],path);
  assert.ok(responses.length>0,path+' no API calls');
  console.log('PASS '+path+' '+responses.length+' API responses, no denied requests or runtime errors');
  if(path==='/appointment'){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'hanjing-permission-appointment.png'),Buffer.from(shot.data,'base64'));}
 }
} finally {
 if(ws)ws.close();if(browser){browser.kill();await sleep(700);}
 if(profile && resolve(profile).startsWith(resolve(tmpdir())+sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});
}
