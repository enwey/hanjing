import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/admin/artifacts/appointment-cashier-separation');await mkdir(output,{recursive:true});
const fixture=join(root,'appointment-cashier-separation-preview.html');
const entry=`<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module">
import {createApp,h} from 'vue';
import {createRouter,createMemoryHistory} from 'vue-router';
import TDesign from 'tdesign-vue-next';
import '/node_modules/tdesign-vue-next/es/style/index.css';
import '/src/styles/global.css';
import Index from '/src/views/appointment/index.vue';
import Detail from '/src/views/appointment/detail.vue';
import Workbench from '/src/views/appointment/workbench.vue';
import Queue from '/src/views/appointment/queue.vue';
import AppIcon from '/src/components/AppIcon.vue';
import request from '/src/utils/request';
localStorage.setItem('user_info',JSON.stringify({role:'super_admin'}));
localStorage.setItem('appt_list_active_tab','all');
window.requests=[];
const appt={id:1,patient_id:1,patient_name:'本次就诊患者',patient_age:30,patient_gender:1,patient_phone:'138****0000',doctor_id:1,doctor_name:'测试医生',store_id:1,store_name:'测试门店',appointment_time:'09:00-09:30',appointment_date:'2026-11-06',symptom_desc:'打鼾',status:'checked_in',type:'first',consult_fee:0,deposit_amount:0};
const rows=[appt,{...appt,id:2,patient_name:'已完成患者',status:'completed'}];
request.defaults.adapter=async config=>{
 window.requests.push({method:config.method,url:config.url});let data=[];const url=config.url;
 if(config.method==='put'){appt.status='completed';}
 else if(url.includes('options/stores'))data=[{id:1,name:'测试门店'}];
 else if(url.includes('options/doctors'))data=[{id:1,name:'测试医生',store_name:'测试门店'}];
 else if(url.includes('options/schedules'))data=[{doctor_id:1,doctor_name:'测试医生',store_name:'测试门店'}];
 else if(url==='/api/admin/appointments'||url.includes('appointments?'))data=config.params?.page?{list:rows,total:2,counts:{all:2,completed:rows.filter(r=>r.status==='completed').length,checked_in:rows.filter(r=>r.status==='checked_in').length}}:rows;
 else if(url==='/api/admin/appointments/1')data=appt;
 else if(url==='/api/admin/appointments/2')data=rows[1];
 else if(url.includes('options/products'))data=[];
 return {data:{code:200,data},status:200,statusText:'OK',headers:{},config};
};
const which=location.search.slice(1);const Component={index:Index,detail:Detail,workbench:Workbench,queue:Queue}[which];
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/appointment/detail/:id',component:Component},{path:'/appointment',component:Component}]});
await router.push(which==='detail'?'/appointment/detail/1':'/appointment?checkout_id=2');await router.isReady();
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
const outcomes=[];
for(const page of ['index','detail','workbench','queue']) {
 await send('Page.navigate',{url:'http://127.0.0.1:5198/appointment-cashier-separation-preview.html?'+page});
 for(let i=0;i<100;i++){if((await evaluate('document.body.innerText')).includes('本次就诊患者'))break;await new Promise(r=>setTimeout(r,150))}
 await new Promise(r=>setTimeout(r,700));
 const dialogs=()=>evaluate("[...document.querySelectorAll('.t-dialog')].filter(e=>e.getBoundingClientRect().height>0).length");
 assert.equal(await dialogs(),0,page+' unexpectedly opens cashier');
 if(['index','detail'].includes(page)) {
  assert.equal(await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='诊疗完成');if(!b)return false;b.click();return true})()"),true,page+' complete button');
  await new Promise(r=>setTimeout(r,500));assert.equal(await dialogs(),0,page+' opens cashier after completion');
  assert.ok((await evaluate('document.body.innerText')).includes('已完成'));
 }
 if(page==='workbench') {
  assert.equal(await evaluate("(()=>{const e=[...document.querySelectorAll('.pane-tab')].find(e=>e.textContent.includes('今日已诊'));if(!e)return false;e.click();return true})()"),true);
  await new Promise(r=>setTimeout(r,300));assert.ok((await evaluate('document.body.innerText')).includes('已完成患者'));
 }
 const text=await evaluate('document.body.innerText');assert.ok(!text.includes('收费结算')&&!text.includes('收银结算')&&!text.includes('结算完成'),page+' still ties settlement to appointment');
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,page+'.png'),Buffer.from(shot.data,'base64'));
 outcomes.push({page,result:'passed',visibleDialogs:await dialogs()});console.log('PASS '+page+' completion state, no automatic cashier or completed-state settlement button');
}
await writeFile(join(output,'preview.json'),JSON.stringify({outcomes,scope:'Actual Vue components with mocked business API; no real patient operations'},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
