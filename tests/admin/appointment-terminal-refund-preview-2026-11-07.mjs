import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/admin/artifacts/appointment-terminal-refund-2026-11-07');await mkdir(output,{recursive:true});
const fixture=join(root,'appointment-terminal-refund-preview.html');
const entry=`<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module">
import {createApp} from 'vue';import TDesign from 'tdesign-vue-next';import '/node_modules/tdesign-vue-next/es/style/index.css';import '/src/styles/global.css';import Dialog from '/src/components/AppointmentTerminalDialog.vue';import request from '/src/utils/request';
localStorage.setItem('user_info',JSON.stringify({role:'super_admin'}));window.requests=[];window.method='cash';
request.defaults.adapter=async config=>{window.requests.push({method:config.method,data:config.data});return {data:{code:200,data:config.method==='get'?{appointment:{id:1,patient_name:'张女士',appointment_no:'AP2611060021'},charges:[{id:1,status:'paid',payment_method:window.method,consult_fee:2000,deposit_amount:5000}]}:{refund_errors:[]}},status:200,statusText:'OK',headers:{},config}};
const app=createApp(Dialog);app.use(TDesign);window.dialog=app.mount('#app');await window.dialog.open(1,'cancelled');
</script>`;
await writeFile(fixture,entry);
const profile=await mkdtemp(join(tmpdir(),'queue-call-'));let vite,browser,ws;
try{
const viteModule=(await import('../../hanjing-clinic-管理后台源码-20260607/node_modules/vite/dist/node/index.js'));
vite=await viteModule.createServer({root,configFile:join(root,'vite.config.ts'),server:{host:'127.0.0.1',port:5198,open:false}});await vite.listen();
browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9469',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:9469/json/version');break}catch{}await new Promise(r=>setTimeout(r,100));}
const target=await(await fetch('http://127.0.0.1:9469/json/new?about:blank',{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0;const calls=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.method==='Runtime.exceptionThrown')console.error(JSON.stringify(m.params));if(m.method==='Log.entryAdded')console.error(JSON.stringify(m.params));if(m.id){const p=calls.get(m.id);calls.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{calls.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value};

const outcomes=[];
await send('Page.navigate',{url:'http://127.0.0.1:5198/appointment-terminal-refund-preview.html'});
for(let i=0;i<100;i++){if((await evaluate('document.body.innerText')).includes('已将现金'))break;await new Promise(r=>setTimeout(r,150))}
await new Promise(r=>setTimeout(r,600));
assert.ok((await evaluate('document.body.innerText')).includes('¥70.00'));
const click=async text=>evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.getBoundingClientRect().height>0 && b.textContent.trim()==='+JSON.stringify(text)+');if(!b)return false;b.click();return true})()');
assert.ok(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="确认并退款").disabled'));
assert.ok(!(await evaluate('document.body.innerText')).includes('无需退款'));
let shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'cash.png'),Buffer.from(shot.data,'base64'));
await evaluate('document.querySelector("input[type=checkbox]").click()');assert.ok(await click('确认并退款'));await new Promise(r=>setTimeout(r,250));assert.ok(await evaluate('window.requests.some(r=>r.method==="put" && JSON.parse(r.data).offline_confirmed===true)'));outcomes.push({case:'现金取消确认勾选',status:'passed'});
await evaluate('window.dialog.open(1,"no_show","waive")');await new Promise(r=>setTimeout(r,250));assert.ok((await evaluate('document.body.innerText')).includes('不会发起退款请求'));shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'waive.png'),Buffer.from(shot.data,'base64'));assert.ok(await click('确认无需退款'));await new Promise(r=>setTimeout(r,200));assert.ok(await evaluate('window.requests.some(r=>r.method==="put" && JSON.parse(r.data).refund_action==="waive")'));outcomes.push({case:'未到诊无需退款确认',status:'passed'});
await evaluate('window.method="wechat";window.dialog.open(1,"cancelled")');await new Promise(r=>setTimeout(r,250));assert.ok((await evaluate('document.body.innerText')).includes('原路退回'));assert.equal(await evaluate('[...document.querySelectorAll("input[type=checkbox]")].filter(e=>e.getBoundingClientRect().height>0).length'),0);shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'wechat.png'),Buffer.from(shot.data,'base64'));assert.ok(await click('确认并退款'));outcomes.push({case:'微信原路退款确认',status:'passed'});
console.log(JSON.stringify(outcomes));
await writeFile(join(output,'preview.json'),JSON.stringify({outcomes,scope:'Actual Vue components with mocked business API; no real patient operations'},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
