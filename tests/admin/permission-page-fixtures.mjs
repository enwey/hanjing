import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const base='http://localhost:3000',port=9358;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function verifyPermissionPages({conn,api}) {
let browser,profile,ws;
const [saved]=await conn.query('SELECT permission_resource FROM permissions WHERE role_id=2');
try {
 profile=await mkdtemp(join(tmpdir(),'hanjing-permission-ui-'));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let n=0;n<60;n++){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)break;}catch{}await sleep(200);}
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 let id=0,pending=new Map(),responses=[],exceptions=[];
 ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Fetch.requestPaused'){ const request=m.params.request; const url=new URL(request.url); (async()=>{if(request.method!=='GET')throw Error('Unexpected mutation '+request.method);const result=await api(url.pathname.replace('/api/admin/','')+url.search);await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:result.status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(result.body)).toString('base64')});})().catch(e=>{exceptions.push(e.message);send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'Failed'});});}else if(m.method==='Network.responseReceived'&&m.params.response.url.includes('/api/admin/'))responses.push({url:new URL(m.params.response.url).pathname,status:m.params.response.status});else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 await send('Page.enable');await send('Network.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/admin/*',requestStage:'Request'}]});
 const cases=[
  {permissions:['appointment:view'],paths:['/appointment','/queue','/appointment/detail/1']},
  {permissions:['appointment:view','appointment:edit'],paths:['/workbench']},
  {permissions:['patient:view'],paths:['/patient','/patient/detail/1']},
  {permissions:['schedule:view'],paths:['/doctor','/doctor/schedule/1']},
  {permissions:['order:view'],paths:['/order','/fulfillment','/after-sales','/order/detail/1','/order/refund']},
  {permissions:['content:view'],paths:['/content','/live']},
  {permissions:['content:view','content:edit'],paths:['/content/edit']},
  {permissions:['distribution:view'],paths:['/distribution','/promoter']},
  {permissions:['store:view'],paths:['/store','/store/report/1']},
  {permissions:['audit_log:view'],paths:['/log','/mini-program-log']}
 ];
 let injection;
 for(const item of cases){
  await conn.query('DELETE FROM permissions WHERE role_id=2');
  for(const permission of item.permissions)await conn.query('INSERT INTO permissions(role_id,permission_resource) VALUES(2,?)',[permission]);
  const me=await api('me');assert.equal(me.status,200);
  const auth={token:'test.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test'};
  if(injection)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection});
  injection=(await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.origin===${JSON.stringify(base)}){localStorage.setItem('auth_token',${JSON.stringify(auth.token)});localStorage.setItem('user_info',${JSON.stringify(JSON.stringify(me.body.data))});}`})).identifier;
  const paths=item.paths;
 for(const path of paths){
  responses=[];exceptions=[];await send('Page.navigate',{url:base+path});
  for(let i=0;i<60;i++){await sleep(200);if(await evaluate(`document.readyState==='complete' && document.querySelector('#app')?.textContent?.length>100`))break;}
  await sleep(900);
  const errors=responses.filter(r=>r.status>=400);
  const deniedText=await evaluate("document.body.innerText.includes('没有此操作的权限') || document.body.innerText.includes('获取商品列表失败')");
  assert.deepEqual(errors,[],path+': '+JSON.stringify(errors));assert.equal(deniedText,false,path);assert.deepEqual(exceptions,[],path);
  assert.ok(responses.length>0,path+' no API calls');assert.equal(await evaluate('location.pathname'),path,'unexpected redirect');
  console.log('PASS '+path+' '+responses.length+' API responses, no denied requests or runtime errors');
  if(path==='/appointment'){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'hanjing-permission-appointment.png'),Buffer.from(shot.data,'base64'));}
 }
 }
} finally {
 await conn.query('DELETE FROM permissions WHERE role_id=2');
 for(const row of saved)await conn.query('INSERT INTO permissions(role_id,permission_resource) VALUES(2,?)',[row.permission_resource]);
 if(ws)ws.close();if(browser){browser.kill();await sleep(700);}
 if(profile && resolve(profile).startsWith(resolve(tmpdir())+sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});
}

}
