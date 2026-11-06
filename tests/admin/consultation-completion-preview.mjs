import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/admin/artifacts/consultation-completion');await mkdir(output,{recursive:true});
const fixture=join(root,'consultation-completion-preview.html');
const entry=`<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module">
import {createApp,h} from 'vue';
import {createRouter,createMemoryHistory} from 'vue-router';
import TDesign from 'tdesign-vue-next';
import '/node_modules/tdesign-vue-next/es/style/index.css';
import '/src/styles/global.css';
import Component from '/src/views/appointment/emr.vue';
import AppIcon from '/src/components/AppIcon.vue';
import request from '/src/utils/request';
localStorage.setItem('user_info',JSON.stringify({role:'super_admin'}));
window.saved=[];
const appt={id:1,patient_id:1,patient_name:'测试患者',patient_age:30,patient_gender:1,patient_phone:'138****0000',doctor_id:1,doctor_name:'测试医生',store_id:1,store_name:'测试门店',appointment_time:'09:00-09:30',appointment_date:'2026-11-06',symptom_desc:'打鼾',status:'checked_in',type:'first'};
request.defaults.adapter=async config=>{if(config.method==='post'){window.saved.push({url:config.url,body:config.data});await new Promise(r=>setTimeout(r,1000));}return {data:{code:200,data:config.url==='/api/admin/appointments/1'?appt:config.url.endsWith('/treatment')?null:[]},status:200,statusText:'OK',headers:{},config}};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/appointment/emr/:id',component:Component},{path:'/appointment',component:{template:'<div>已完成预约列表</div>'}}]});
await router.push('/appointment/emr/1');await router.isReady();
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
await send('Page.navigate',{url:'http://127.0.0.1:5198/consultation-completion-preview.html'});
for(let i=0;i<100;i++){if((await evaluate('document.body.innerText')).includes('测试患者'))break;await new Promise(r=>setTimeout(r,200))}
const inspect=()=>evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('保存并结束就诊')||b.textContent.includes('提交中'));if(!b)return null;const r=b.getBoundingClientRect(),s=getComputedStyle(b);return {x:r.x,y:r.y,width:r.width,height:r.height,bg:s.backgroundColor,color:s.color,opacity:s.opacity,disabled:b.disabled}})()`);
const normal=await inspect();assert.ok(normal&&normal.width>0);assert.notEqual(normal.bg,'rgba(0, 0, 0, 0)');
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:normal.x+normal.width/2,y:normal.y+normal.height/2});await new Promise(r=>setTimeout(r,300));
const hover=await inspect();assert.equal(hover.bg,'rgb(42, 82, 212)');assert.equal(hover.color,'rgb(255, 255, 255)');assert.equal(hover.width,normal.width);
let shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'emr-hover.png'),Buffer.from(shot.data,'base64'));
await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('保存并结束就诊')).click()");await new Promise(r=>setTimeout(r,100));const busy=await inspect();assert.equal(busy.disabled,true);assert.notEqual(busy.bg,'rgba(0, 0, 0, 0)');
shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'emr-submitting.png'),Buffer.from(shot.data,'base64'));
await new Promise(r=>setTimeout(r,1200));assert.equal(await evaluate('window.saved[0].url'),'/api/admin/appointments/1/complete-consultation');
await writeFile(join(output,'preview.json'),JSON.stringify({normal,hover,busy,result:'passed',scope:'Actual Vue/TDesign page with mocked API, silent headless browser'},null,2));console.log('PASS EMR normal/hover/submitting styles and complete-consultation action');
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
