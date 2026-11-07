import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/admin/artifacts/delivery-simplified');await mkdir(output,{recursive:true});
const fixture=join(root,'delivery-simplified-preview.html');
const entry=`<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module">
import {createApp} from 'vue';import {createRouter,createMemoryHistory} from 'vue-router';import TDesign from 'tdesign-vue-next';import '/node_modules/tdesign-vue-next/es/style/index.css';import '/src/styles/global.css';import Factory from '/src/views/fulfillment/FactoryBatches.vue';import Delivery from '/src/views/fulfillment/index.vue';import After from '/src/views/after-sales/index.vue';import AppIcon from '/src/components/AppIcon.vue';import request from '/src/utils/request';
const mode=new URL(location.href).searchParams.get('mode')||'batch';window.calls=[];
const batch={id:1,batch_no:'FM-TEST',factory_name:'测试工厂',status:'exported',items:[1,2].map(id=>({id,fulfillment_case_id:id,status:'awaiting_return',snapshot:{case_id:id,patient_name:id===1?'张女士':'李先生',patient_ref:'P00'+id,technician_name:'张技师',mold:{mold_no:'KM-'+id,taken_date:'2026-11-07',description:'口模完整。\\n按处方制作。'},products:[{product_name:'定制阻鼾器',quantity:1}],devices:[],files:[]}}))};
const cases=[{id:1,patient_name:'张女士',patient_no:'P001',patient_gender:'女',order_status:'paid',pay_amount:7000,status:'device_received',order_id:1,order_no:'OD001',technician_id:1,technician_name:'张技师',device_product_names:'定制阻鼾器',devices:[],prescription:'按方案佩戴'}];
request.defaults.adapter=async config=>{window.calls.push({url:config.url,method:config.method,data:config.data});let data=[];const url=config.url;
if(url.endsWith('/batches/1'))data=batch;
else if(url.endsWith('/batches'))data=[{...batch,item_count:2,returned_count:0}];
else if(url.endsWith('/receipts')){const ids=JSON.parse(config.data).case_ids;batch.items.filter(i=>ids.includes(i.fulfillment_case_id)).forEach(i=>i.status='returned');data={confirmed:ids.length}}
else if(url.endsWith('/detail'))data={items:[{product_id:1,product_name:'定制阻鼾器',category:'device'}]};
else if(url.endsWith('/cases'))data=cases;
else if(url.endsWith('/technicians'))data=[{id:1,name:'张技师'}];
else if(url.endsWith('/fitting'))data={after_sales_ticket_id:1};
else if(url.endsWith('/after-sales-tickets'))data=[{id:1,patient_name:'张女士',fulfillment_case_id:1,patient_device_id:1,issue_type:'微调复查',description:'定制阻鼾器，初始下颌前移量4mm',assigned_technician_id:1,technician_name:'张技师',next_service_date:'2026-11-21',status:'assigned',updated_at:'2026-11-07 10:00:00'}];
return {data:{code:200,data,pagination:{total:data.length||0}},status:200,statusText:'OK',headers:{},config}};
URL.createObjectURL=b=>{window.downloadBlob=b;return 'blob:mock'};HTMLAnchorElement.prototype.click=function(){window.downloadName=this.download};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{template:'<div />'}}]});await router.push('/');const app=createApp(mode==='batch'?Factory:mode==='after'?After:Delivery);app.use(router);app.use(TDesign);app.component('AppIcon',AppIcon);app.directive('permission',{});app.directive('resizable',{});window.component=app.mount('#app');if(mode==='batch')await window.component.openDetail(1);
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
async function navigate(mode,text){await send('Page.navigate',{url:'http://127.0.0.1:5198/delivery-simplified-preview.html?mode='+mode});for(let i=0;i<150;i++){if((await evaluate('document.body.innerText')).includes(text))break;await new Promise(r=>setTimeout(r,100))}assert.ok((await evaluate('document.body.innerText')).includes(text));await new Promise(r=>setTimeout(r,500))}
async function click(text){await evaluate(`[...document.querySelectorAll('button')].filter(x=>x.innerText.trim()===${JSON.stringify(text)}).at(-1).click()`);await new Promise(r=>setTimeout(r,500))}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'))}
await navigate('batch','李先生');let body=await evaluate('document.body.innerText');for(const removed of ['确认寄出','制作 / 恢复制作','工厂签收','登记异常'])assert.ok(!body.includes(removed));await shot('batch');
await click('下载 Excel 清单');for(let i=0;i<100;i++){if(await evaluate('!!window.downloadBlob'))break;await new Promise(r=>setTimeout(r,100))}
assert.ok((await evaluate('window.downloadName')).endsWith('.xlsx'));const base64=await evaluate(`(async()=>{const a=new Uint8Array(await window.downloadBlob.arrayBuffer());let s='';for(const x of a)s+=String.fromCharCode(x);return btoa(s)})()`);await writeFile(join(output,'manifest.xlsx'),Buffer.from(base64,'base64'));outcomes.push({name:'batch-and-xlsx',status:'passed'});
await evaluate(`document.querySelector('.select-all input').click()`);await new Promise(r=>setTimeout(r,100));await click('确认所选回货（2）');await click('确认回货');assert.ok((await evaluate('window.calls')).some(c=>c.url.endsWith('/receipts')&&JSON.parse(c.data).case_ids.length===2));outcomes.push({name:'multi-return-confirmation',status:'passed'});
await navigate('delivery','确认试戴');await click('确认试戴');assert.ok((await evaluate('document.body.innerText')).includes('下次微调复查日期'));await shot('fitting');const vals=await evaluate(`[...document.querySelectorAll('.form input')].map(x=>({type:x.type,value:x.value}))`);assert.ok(vals.some(x=>x.type==='date'&&x.value));outcomes.push({name:'fitting-parameters-and-date',status:'passed'});
await navigate('after','2026-11-21');await shot('after-sales');assert.ok((await evaluate('document.body.innerText')).includes('微调复查'));outcomes.push({name:'after-sales-next-date',status:'passed'});
console.log(JSON.stringify(outcomes));
await writeFile(join(output,'preview.json'),JSON.stringify({outcomes,scope:'Actual Vue components with mocked business API; no real patient operations'},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
