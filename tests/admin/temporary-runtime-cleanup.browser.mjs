import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const base='http://localhost:3000',port=9358;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function verifyCleanupPreview({conn,api}) {
let browser,profile,ws;
const [saved]=await conn.query('SELECT permission_resource FROM permissions WHERE role_id=2');
try {
 profile=await mkdtemp(join(tmpdir(),'hanjing-permission-ui-'));
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let n=0;n<60;n++){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)break;}catch{}await sleep(200);}
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 let id=0,pending=new Map(),responses=[],exceptions=[];
 ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Fetch.requestPaused'){ const request=m.params.request; const url=new URL(request.url); (async()=>{if(request.method!=='GET'&&!url.pathname.endsWith('/preview'))throw Error('Unexpected mutation '+request.method);const result=await api(url.pathname.replace('/api/admin/','')+url.search);await send('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:result.status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(result.body)).toString('base64')});})().catch(e=>{exceptions.push(e.message);send('Fetch.failRequest',{requestId:m.params.requestId,errorReason:'Failed'});});}else if(m.method==='Network.responseReceived'&&m.params.response.url.includes('/api/admin/'))responses.push({url:new URL(m.params.response.url).pathname,status:m.params.response.status});else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 await send('Page.enable');await send('Network.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/admin/*',requestStage:'Request'}]});

 const me=await api('me');
 const auth='test.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('auth_token',${JSON.stringify(auth)});localStorage.setItem('user_info',${JSON.stringify(JSON.stringify(me.body.data))});`});
 for(const route of ['/database-tools']) {
 const width=1440;
 await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+route});
 for(let i=0;i<80;i++){await sleep(150);if(await evaluate("document.body.innerText.includes('管理员')"))break;}
 await sleep(1800);
 const result=await evaluate(`({text:document.body.innerText,path:location.pathname,rows:document.querySelectorAll('.permission-table tbody tr').length})`);
 await evaluate("document.querySelector('.cleanup-panel').scrollIntoView()");
 assert.equal(await evaluate("document.querySelectorAll('.cleanup-option').length"),12);
 const menuLabels=await evaluate("Array.from(document.querySelectorAll('.cleanup-option strong')).map(e=>e.innerText)");
 for(const name of ['商品管理','商品分类','科普文章','内容分类'])assert.ok(menuLabels.includes(name));
 assert.deepEqual(menuLabels.slice(0,4),['预约管理','患者管理','接诊工作台','订单管理']);
 const menuShot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),'hanjing-cleanup-menus.png'),Buffer.from(menuShot.data,'base64'));
 await evaluate("document.querySelector('.cleanup-option input').click()");
 await evaluate("document.querySelector('.cleanup-actions button').click()");
 await sleep(700);
 assert.ok(await evaluate("document.body.innerText.includes('确认清理运行数据')"));
 assert.ok(await evaluate("document.querySelector('.cleanup-selection').innerText.includes('预约管理')"));
 assert.equal(await evaluate("document.querySelector('.cleanup-dialog-actions .btn-danger').disabled"),true);
 await evaluate("(()=>{const e=document.querySelector('.cleanup-confirm-label input');e.value='确认清理';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await sleep(100);
 assert.equal(await evaluate("document.querySelector('.cleanup-dialog-actions .btn-danger').disabled"),false);
 assert.deepEqual(exceptions,[]);
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),`hanjing-cleanup-${route.replaceAll('/','_').replaceAll('?','_').replaceAll('&','_')}.png`),Buffer.from(shot.data,'base64'));
 console.log('PASS cleanup selection, preview and confirmation UI: '+route);

 }
} finally {
 await conn.query('DELETE FROM permissions WHERE role_id=2');
 for(const row of saved)await conn.query('INSERT INTO permissions(role_id,permission_resource) VALUES(2,?)',[row.permission_resource]);
 if(ws)ws.close();if(browser){browser.kill();await sleep(700);}
 if(profile && resolve(profile).startsWith(resolve(tmpdir())+sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});
}

}

const catalog=JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../../hanjing-clinic-backend/admin-permission-catalog.json',import.meta.url),'utf8'));
const fixtures=[{id:1,code:'super_admin',name:'超级管理员',members_count:1,permissions:['dashboard:view']},{id:2,name:'门店店长',members_count:1,permissions:[...catalog.find(g=>g.module==='appointment').actions.map(a=>a.code),'live:view','banner:view','doctor:view','patient:view','patient:edit','store:view']},{id:3,name:'就诊医生',members_count:1,permissions:['appointment:view','appointment:receive','patient:view','patient:phone:view','medical_record:view','medical_record:edit','schedule:view','schedule:edit','doctor:view']}];
const {groups}=await import('../../hanjing-clinic-backend/temporary-runtime-cleanup/index.js');
await verifyCleanupPreview({conn:{query:async()=>[[]]},api:async path=>({status:200,body:{code:200,data:
path==='me'?{id:1,name:'管理员',role_code:'super_admin',permissions:[]}:
path==='database/temporary-cleanup'?{groups}:
path==='database/temporary-cleanup/preview'?{database:'隔离测试数据库',token:'mock',total:42,tables:[{table:'patients',label:'患者档案',count:10},{table:'appointments',label:'预约',count:20},{table:'orders',label:'订单（含支付退款信息）',count:12}],updates:[{table:'users',label:'保留患者登录账号，解除本人档案关联',count:10}]}:
path==='database/schema'?{database:'隔离测试数据库',tables:[]}:
path.startsWith('notifications')?{}:[]}})});
