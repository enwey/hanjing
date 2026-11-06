import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/admin/artifacts/queue-call');await mkdir(output,{recursive:true});
const fixture=join(root,'queue-call-preview.html');
const entry=`<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module">
import {createApp,h} from '/node_modules/.vite/deps/vue.js';
import {createRouter,createMemoryHistory} from '/node_modules/.vite/deps/vue-router.js';
import TDesign from '/node_modules/.vite/deps/tdesign-vue-next.js';
import '/node_modules/tdesign-vue-next/es/style/index.css';
import '/src/styles/global.css';
import Queue from '/src/views/appointment/queue.vue';
import Workbench from '/src/views/appointment/workbench.vue';
import AppIcon from '/src/components/AppIcon.vue';
import request from '/src/utils/request';
localStorage.setItem('user_info',JSON.stringify({role:'super_admin'}));
window.calls=[]; window.voiceCount=0;
window.speechSynthesis.speak=()=>window.voiceCount++;
const rows=['confirmed','called','checked_in'].map((status,i)=>({id:i+1,patient_id:i+1,patient_name:['候诊患者','已叫患者','接诊患者'][i],patient_phone:'138****0000',doctor_id:1,doctor_name:'测试医生',store_id:1,store_name:'测试门店',appointment_time:'09:00-09:30',appointment_no:'AP'+i,status,patient_age:30,type:'first'}));
request.defaults.adapter=async config=>{
 let data=[]; const url=config.url;
 if(config.method==='put') {const body=JSON.parse(config.data);window.calls.push({url,body});const row=rows.find(r=>url.endsWith('/'+r.id));if(row.status!=='checked_in')row.status=body.status;}
 else if(url.includes('options/stores'))data=[{id:1,name:'测试门店'}];
 else if(url.includes('options/doctors'))data=[{id:1,name:'测试医生',store_name:'测试门店'}];
 else if(url.includes('options/schedules'))data=[{doctor_id:1,doctor_name:'测试医生',store_name:'测试门店'}];
 else if(url.includes('appointments?'))data=rows;
 else if(url.startsWith('/api/admin/appointments/'))data=rows.find(r=>url.endsWith('/'+r.id));
 return {data:{code:200,data},status:200,statusText:'OK',headers:{},config};
};
const Component=location.search.includes('workbench')?Workbench:Queue;
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Component}]});
const app=createApp(Component);app.use(TDesign);app.use(router);app.component('AppIcon',AppIcon);app.directive('permission',{});app.directive('resizable',{});app.mount('#app');
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
for(const page of ['queue','workbench']) {
 await send('Page.navigate',{url:'http://127.0.0.1:5198/queue-call-preview.html?'+page});
 for(let i=0;i<100;i++){if((await evaluate('document.body.innerText')).includes('候诊患者'))break;await new Promise(r=>setTimeout(r,200))}
 await new Promise(r=>setTimeout(r,600));
 const labels=await evaluate("[...document.querySelectorAll('button')].map(b=>b.textContent.trim())");console.log(page,await evaluate('document.body.innerText'),labels);assert.equal(labels.filter(x=>x==='叫号').length,3);
 await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='叫号')[1].click()");await new Promise(r=>setTimeout(r,600));
 assert.equal(await evaluate('window.calls[0].body.status'),'called');
 assert.equal(await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='叫号').length"),3);
 const bounds=await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='叫号').map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,scroll:b.scrollWidth,client:b.clientWidth}})");assert.ok(bounds.every(r=>r.left>=0&&r.right<=1440&&r.scroll<=r.client+1));
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,page+'.png'),Buffer.from(shot.data,'base64'));
 console.log('PASS actual '+page+' Vue template, called request and 3 unclipped call buttons');
}
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
