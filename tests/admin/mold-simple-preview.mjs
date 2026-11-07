import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/admin/artifacts/mold-simple');await mkdir(output,{recursive:true});
const fixture=join(root,'mold-simple-preview.html');
const entry=`<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module">
import {createApp} from 'vue';import {createRouter,createMemoryHistory} from 'vue-router';import TDesign from 'tdesign-vue-next';import '/node_modules/tdesign-vue-next/es/style/index.css';import '/src/styles/global.css';import Dialog from '/src/views/fulfillment/MoldDialog.vue';import request from '/src/utils/request';import Factory from '/src/views/fulfillment/FactoryBatches.vue';import {exportManifest} from '/src/views/fulfillment/delivery';
const batch={id:1,batch_no:'FM-TEST',factory_name:'测试工厂',status:'draft',items:[{id:1,fulfillment_case_id:1,status:'pending',snapshot:{case_id:1,patient_ref:'P001',technician_name:'张技师',mold:{mold_no:'KM-TEST',taken_date:'2026-11-07',description:'口模完整。\\n按处方制作。',parameters:[]},products:[],devices:[],files:[]}}]};window.batch=batch;window.exportManifest=exportManifest;
request.defaults.adapter=async config=>{if(config.method==='post')window.saved=JSON.parse(config.data);if(config.url.includes('/batches'))return {data:{code:200,data:config.url.endsWith('/1')?batch:[],pagination:{total:0}},status:200,statusText:'OK',headers:{},config};return {data:{code:200,data:{editable:true,profile:{revision:0,details:{description:'口模完整，咬合清晰。\\n按医生处方制作，边缘打磨圆滑。'}},clinical:{medical_record:{prescription:'定制阻鼾器，按测量结果制作。'},treatments:[]},files:[]}},status:200,statusText:'OK',headers:{},config}};
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{template:'<div />'}}]});await router.push('/');const isBatch=location.search.includes('batch');const app=createApp(isBatch?Factory:Dialog);app.use(router);app.use(TDesign);app.directive('permission',{});window.dialog=app.mount('#app');if(isBatch)await window.dialog.openDetail(1);else await window.dialog.open({id:1});
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


const outcomes=[];await send('Page.navigate',{url:'http://127.0.0.1:5198/mold-simple-preview.html'});
for(let i=0;i<100;i++){if((await evaluate('document.body.innerText')).includes('确认取模完成'))break;await new Promise(r=>setTimeout(r,150))}
assert.equal(await evaluate('document.querySelectorAll("textarea").length'),1);assert.equal(await evaluate('document.querySelectorAll("input:not([type=hidden]),select").length'),0);
await new Promise(r=>setTimeout(r,500));const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'mold.png'),Buffer.from(shot.data,'base64'));
await evaluate(`document.querySelector('textarea').value='新的取模说明';document.querySelector('textarea').dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('button')].find(x=>x.innerText==='确认取模完成').click()`);await new Promise(r=>setTimeout(r,500));const payload=await evaluate('window.saved');assert.equal(payload.complete,true);assert.deepEqual(payload.details,{description:'新的取模说明'});outcomes.push({mode:'single-textarea-and-save',status:'passed'});
await send('Page.navigate',{url:'http://127.0.0.1:5198/mold-simple-preview.html?batch'});
for(let i=0;i<100;i++){if((await evaluate('document.body.innerText')).includes('张技师'))break;await new Promise(r=>setTimeout(r,150))}
assert.ok((await evaluate('document.body.innerText')).includes('按处方制作。'));await new Promise(r=>setTimeout(r,500));const batchShot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'batch.png'),Buffer.from(batchShot.data,'base64'));
const csv=await evaluate(`(async()=>{let blob;URL.createObjectURL=b=>{blob=b;return 'blob:mock'};HTMLAnchorElement.prototype.click=function(){};window.exportManifest(window.batch);return await blob.text()})()`);assert.ok(csv.includes('按处方制作。'));outcomes.push({mode:'batch-preview-and-export',status:'passed'});
console.log(JSON.stringify(outcomes));
await writeFile(join(output,'preview.json'),JSON.stringify({outcomes,scope:'Actual Vue components with mocked business API; no real patient operations'},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
