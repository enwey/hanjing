import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/admin/artifacts/order-payment-operator');await mkdir(output,{recursive:true});
const fixture=join(root,'order-payment-operator-preview.html');
const entry=`<!doctype html><meta charset="utf-8"><style>body{margin:0}#app{padding:24px;max-width:1400px;margin:auto}</style><div id="app"></div><script type="module">
import {createApp} from 'vue';import {createRouter,createMemoryHistory} from 'vue-router';import TDesign from 'tdesign-vue-next';import '/node_modules/tdesign-vue-next/es/style/index.css';import '/src/styles/global.css';import Detail from '/src/views/order/detail.vue';import AppIcon from '/src/components/AppIcon.vue';import request from '/src/utils/request';
localStorage.setItem('user_info',JSON.stringify({role_code:'super_admin'}));const mode=new URL(location.href).searchParams.get('mode') || 'refunded';
request.defaults.adapter=async config=>{let row={id:1,order_no:'OD202611070001',status:'refunded',type:'product',pay_method:'cash',pay_amount:7000,total_amount:7000,discount_amount:0,created_at:'2026-11-07 08:00:00',updated_at:'2026-11-07 10:00:00',pay_at:'2026-11-07 09:00:00',collected_by_name:'前台张女士',collected_by_admin_id:1,collection_source:'admin',refunded_by_name:'退款工作人员',refunded_by_admin_id:2,refund_requested_at:'2026-11-07 10:00:00',refund_at:'2026-11-07 10:01:00',user_name:'张女士',user_phone:'13800000000',shipping_address:{store_name:'龙岗总店'},items:[],commissions:[]};
if(mode==='legacy')row.type='appointment_deposit';
if(mode==='wechat')Object.assign(row,{status:'refunding',pay_method:'wechat',collection_source:'patient_wechat',collected_by_admin_id:null,collected_by_name:null,refund_at:null,wechat_refund_no:'HJR1'});
if(mode==='history'||mode==='history-receipt')Object.assign(row,{collection_source:null,collected_by_admin_id:null,collected_by_name:null,refunded_by_name:null,refunded_by_admin_id:null,refund_requested_at:null});
if(mode==='history-receipt')row.shipping_address.offline_refund={actor_id:123,registered_at:'2026-11-07 10:00:00'};
return {data:{code:200,data:row},status:200,statusText:'OK',headers:{},config}};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/order/detail/:id',component:Detail}]});await router.push('/order/detail/1');const app=createApp(Detail);app.use(router);app.use(TDesign);app.component('AppIcon',AppIcon);app.directive('permission',{});app.mount('#app');
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
for(const [mode,text] of [['refunded','退款工作人员'],['legacy','退款工作人员'],['wechat','患者微信支付（自动确认）'],['history','历史未记录'],['history-receipt','账号 #123']]){
 await send('Page.navigate',{url:'http://127.0.0.1:5198/order-payment-operator-preview.html?mode='+mode});
 for(let i=0;i<100;i++){if((await evaluate('document.body.innerText')).includes(text))break;await new Promise(r=>setTimeout(r,150))}
 const body=await evaluate('document.body.innerText');assert.ok(body.includes(text),body);assert.ok(body.includes('收款与退款记录')&&body.includes('退款操作时间'));if(mode==='refunded')assert.ok(body.includes('前台张女士'));
 const bounds=await evaluate(`(()=>{const p=document.querySelector('.payment-operator-panel');const r=p.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,items:[...p.querySelectorAll('.info-value')].map(x=>({scroll:x.scrollWidth,width:x.clientWidth}))}})()`);assert.ok(bounds.left>=0&&bounds.right<=bounds.width);assert.ok(bounds.items.every(x=>x.scroll<=x.width));
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,mode+'.png'),Buffer.from(shot.data,'base64'));outcomes.push({mode,status:'passed',bounds});
}console.log(JSON.stringify(outcomes));
await writeFile(join(output,'preview.json'),JSON.stringify({outcomes,scope:'Actual Vue components with mocked business API; no real patient operations'},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
