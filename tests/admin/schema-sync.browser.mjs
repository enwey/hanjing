import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const port=9368, base=process.env.ADMIN_TEST_URL || 'http://127.0.0.1:3000';
const profile=await mkdtemp(join(tmpdir(),'hanjing-schema-ui-'));
const browser=spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let ws;
try {
  for(let i=0;i<300;i++){try{if((await fetch(`http://127.0.0.1:${port}/json/version`)).ok)break;}catch{}await sleep(200);}
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
  let id=0;const pending=new Map(),exceptions=[],calls=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const me={id:1,name:'管理员',role_code:'super_admin',permissions:['database:view','database:sync','dashboard:view']};
  const plan={database:'隔离预览数据库',tableCount:1,planToken:'a'.repeat(64),unmanagedTables:[],changes:[{table:'users',action:'drop_column',name:'obsolete_field',before:'`obsolete_field` varchar(40) DEFAULT NULL'},{table:'users',action:'modify_column',name:'nickname',before:'`nickname` varchar(180) NOT NULL',after:'`nickname` varchar(100) NOT NULL'}]};
  ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);else if(m.method==='Fetch.requestPaused'){
    const {request,requestId}=m.params;const path=new URL(request.url).pathname;let data=[];
    if(path.endsWith('/me'))data=me;
    else if(path.endsWith('/database/schema'))data={database:plan.database,tables:[]};
    else if(path.endsWith('/database/temporary-cleanup'))data={groups:[]};
    else if(path.endsWith('/database/sync')){const body=JSON.parse(request.postData||'{}');calls.push(body);data=body.preview?plan:{...plan,success:true,backupDatabase:'hj_schema_backup_0123456789abcdef0123456789abcdef',syncedAt:new Date().toISOString()};}
    else if(request.method!=='GET'){exceptions.push('unexpected mutation '+path);}
    send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({code:200,data})).toString('base64')}).catch(e=>exceptions.push(e.message));
  }});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  await send('Page.enable');await send('Runtime.enable');
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/*',requestStage:'Request'}]});
  const auth='test.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test';
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('auth_token',${JSON.stringify(auth)});localStorage.setItem('user_info',${JSON.stringify(JSON.stringify(me))});`});
  for(const width of [1440,768]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:base+'/database-tools'});
    for(let i=0;i<100;i++){await sleep(150);if(await evaluate("document.body.innerText.includes('预览并同步结构')"))break;}
    assert.ok(await evaluate("document.body.innerText.includes('预览并同步结构')"));
    await evaluate("[...document.querySelectorAll('button')].find(e=>e.innerText.includes('预览并同步结构')).click()");
    await sleep(500);
    assert.ok(await evaluate("document.body.innerText.includes('删除字段 · users.obsolete_field')"));
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(e=>e.innerText==='按代码同步').disabled"),true);
    const bounds=await evaluate("(()=>{const e=[...document.querySelectorAll('.t-dialog')].find(e=>e.innerText.includes('数据库结构自检与同步确认'));const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}})()");
    assert.ok(bounds.left>=0 && bounds.right<=bounds.width && bounds.top>=0 && bounds.bottom<=bounds.height,JSON.stringify(bounds));
    const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),`hanjing-schema-sync-${width}.png`),Buffer.from(shot.data,'base64'));
    await evaluate("[...document.querySelectorAll('.t-checkbox')].find(e=>e.innerText.includes('已停止业务写入')).click()");
    await sleep(100);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(e=>e.innerText==='按代码同步').disabled"),false);
    await evaluate("[...document.querySelectorAll('button')].find(e=>e.innerText==='按代码同步').click()");
    await sleep(400);
    assert.ok(await evaluate("document.body.innerText.includes('hj_schema_backup_0123456789abcdef0123456789abcdef')"));
    console.log('PASS preview/deletion warning/confirmation/backup result at width',width);
  }
  assert.deepEqual(calls,[{preview:true},{planToken:plan.planToken},{preview:true},{planToken:plan.planToken}]);
  assert.deepEqual(exceptions,[]);
}finally{ws?.close();browser.kill();await sleep(600);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
