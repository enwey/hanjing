import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/admin/artifacts/after-sales-adjustment');await mkdir(output,{recursive:true});
const fixture=join(root,'after-sales-adjustment-preview.html');
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
else if(url.endsWith('/after-sales-tickets'))data=[{id:1,patient_name:'张女士',fulfillment_case_id:1,patient_device_id:1,issue_type:'微调复查',description:'定制阻鼾器，初始下颌前移量4mm',assigned_technician_id:1,technician_name:'张技师',next_service_date:'2026-11-21',current_advancement:4.5,device_name_snapshot:'定制阻鼾器',status:'processing',updated_at:'2026-11-07 10:00:00'}];
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
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};


const outcomes=[];
async function navigate(mode,text){await send('Page.navigate',{url:'http://127.0.0.1:5198/after-sales-adjustment-preview.html?mode='+mode});for(let i=0;i<150;i++){if((await evaluate('document.body.innerText')).includes(text))break;await new Promise(r=>setTimeout(r,100))}assert.ok((await evaluate('document.body.innerText')).includes(text));await new Promise(r=>setTimeout(r,500))}
async function click(text){await evaluate(`[...document.querySelectorAll('button')].filter(x=>x.innerText.trim()===${JSON.stringify(text)}).at(-1).click()`);await new Promise(r=>setTimeout(r,500))}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(r.data,'base64'))}
await navigate('after','完成微调');await click('完成微调');await shot('complete-adjustment');
let body=await evaluate('document.body.innerText');for(const word of ['当前下颌前移量 4.5 mm','调整后下颌前移量','处理结果','继续复查','无需再复查','下次复查日期'])assert.ok(body.includes(word),word);
const bounds=await evaluate(`[...document.querySelectorAll('.t-dialog')].filter(x=>x.getBoundingClientRect().height>0).map(x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})`);assert.ok(bounds.every(r=>r.x>=0&&r.right<=1440&&r.y>=0&&r.bottom<=1100));outcomes.push({name:'完成微调弹窗字段与布局',status:'passed'});
await evaluate(`window.component.$.setupState.actionForm.resolution='调整后佩戴舒适';window.component.$.setupState.actionForm.advancement=5.25;window.component.$.setupState.actionForm.nextDate='2099-12-01'`);
await click('完成微调');let requests=await evaluate(`window.calls.filter(c=>c.method==='put')`);assert.equal(requests.length,1);let payload=JSON.parse(requests[0].data);assert.equal(payload.adjusted_advancement,5.25);assert.equal(payload.needs_follow_up,true);assert.equal(payload.next_adjust_date,'2099-12-01');assert.equal(payload.expected_advancement,4.5);outcomes.push({name:'继续复查提交参数及日期',status:'passed'});
await click('完成微调');await evaluate(`window.component.$.setupState.actionForm.resolution='无需再次复查';window.component.$.setupState.actionForm.followUp='none'`);await new Promise(r=>setTimeout(r,100));await shot('no-followup');body=await evaluate('document.body.innerText');assert.ok(!body.includes('下次复查日期'));await click('完成微调');requests=await evaluate(`window.calls.filter(c=>c.method==='put')`);payload=JSON.parse(requests.at(-1).data);assert.equal(payload.needs_follow_up,false);assert.equal(payload.next_adjust_date,null);outcomes.push({name:'无需复查隐藏日期并正确提交',status:'passed'});
await evaluate(`window.component.$.setupState.tickets[0].status='resolved';window.component.$.setupState.tickets[0].resolution='佩戴适应良好';window.component.$.setupState.tickets[0].adjustment_snapshot={before_advancement:4.5,adjusted_advancement:5.25,operator_name:'张技师',needs_follow_up:true,next_adjust_date:'2026-11-21',next_ticket_id:2}`);await new Promise(r=>setTimeout(r,100));await shot('history');body=await evaluate('document.body.innerText');assert.ok(body.includes('4.5 → 5.25 mm'));assert.ok(body.includes('工单 #2'));outcomes.push({name:'历史参数、技师及下一次工单显示',status:'passed'});
await evaluate(`window.component.$.setupState.tickets[0].status='processing'`);await new Promise(r=>setTimeout(r,100));await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await click('完成微调');await shot('compact-window');const compact=await evaluate(`[...document.querySelectorAll('.t-dialog')].filter(x=>x.getBoundingClientRect().height>0).map(x=>{const r=x.getBoundingClientRect();return {top:r.top,bottom:r.bottom}})`);assert.ok(compact.every(r=>r.top>=0&&r.bottom<=768));outcomes.push({name:'1366x768弹窗与底部按钮完整可见',status:'passed'});
console.log(JSON.stringify(outcomes));
await writeFile(join(output,'preview.json'),JSON.stringify({outcomes,scope:'Actual Vue components with mocked business API; no real patient operations'},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
