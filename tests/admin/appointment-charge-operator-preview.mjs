import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/admin/artifacts/appointment-charge-operator');await mkdir(output,{recursive:true});
const fixture=join(root,'appointment-charge-operator-preview.html');
const entry=`<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module">
import {createApp} from 'vue';import {createRouter,createMemoryHistory} from 'vue-router';import TDesign from 'tdesign-vue-next';import '/node_modules/tdesign-vue-next/es/style/index.css';import '/src/styles/global.css';import Dialog from '/src/components/AppointmentChargeDialog.vue';import request from '/src/utils/request';
localStorage.setItem('user_info',JSON.stringify({role_code:'super_admin'}));window.mode='refunded';
request.defaults.adapter=async config=>{const base={id:1,charge_no:'AC202611070001',status:window.mode,payment_method:'cash',consult_fee:2000,deposit_amount:5000,paid_at:'2026-11-07 09:00:00',collected_by_name:'前台张女士',collected_by_admin_id:1,collection_source:'admin'};let charge={...base};
if(window.mode==='refunded')Object.assign(charge,{refund_status:'refunded',refunded_by_name:'退款工作人员',refunded_by_admin_id:2,refund_requested_at:'2026-11-07 10:00:00'});
if(window.mode==='refund_waived')Object.assign(charge,{waived_by_name:'门店李先生',waived_by_admin_id:3,waived_at:'2026-11-07 10:30:00'});
if(window.mode==='wechat')Object.assign(charge,{status:'paid',payment_method:'wechat',collection_source:'patient_wechat',collected_by_admin_id:null,collected_by_name:null});
if(window.mode==='history')Object.assign(charge,{status:'paid',collection_source:null,collected_by_admin_id:null,collected_by_name:null});
return {data:{code:200,data:{appointment:{id:1,consult_fee:2000,deposit_amount:5000,status:'no_show',patient_name:'张女士',appointment_no:'AP2611070001'},charges:[charge]}},status:200,statusText:'OK',headers:{},config}};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{template:'<div />'}}]});await router.push('/');const app=createApp(Dialog);app.use(router);app.use(TDesign);app.directive('permission',{});window.dialog=app.mount('#app');await window.dialog.open(1);
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


const outcomes=[];await send('Page.navigate',{url:'http://127.0.0.1:5198/appointment-charge-operator-preview.html'});
for(let i=0;i<100;i++){if((await evaluate('document.body.innerText')).includes('退款工作人员'))break;await new Promise(r=>setTimeout(r,150))}
for(const [mode,text] of [['refunded','退款工作人员'],['refund_waived','门店李先生'],['wechat','患者支付（小程序微信）'],['history','历史未记录']]){
 await evaluate('window.mode='+JSON.stringify(mode)+';window.dialog.open(1)');await new Promise(r=>setTimeout(r,500));const body=await evaluate('document.body.innerText');assert.ok(body.includes(text));if(mode==='refunded')assert.ok(body.includes('前台张女士')&&body.includes('2026-11-07 10:00:00'));if(mode==='refund_waived')assert.ok(body.includes('无需退款操作人'));const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,mode+'.png'),Buffer.from(shot.data,'base64'));outcomes.push({mode,status:'passed'});
}console.log(JSON.stringify(outcomes));
await writeFile(join(output,'preview.json'),JSON.stringify({outcomes,scope:'Actual Vue components with mocked business API; no real patient operations'},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
