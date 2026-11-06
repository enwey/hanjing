import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/admin/artifacts/gender-unset');await mkdir(output,{recursive:true});
const fixture=join(root,'gender-unset-preview.html');
const entry=`<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module">
import {createApp,h} from 'vue';
import {createRouter,createMemoryHistory} from 'vue-router';
import TDesign from 'tdesign-vue-next';
import '/node_modules/tdesign-vue-next/es/style/index.css';
import '/src/styles/global.css';
import Create from '/src/views/appointment/create.vue';
import AppIcon from '/src/components/AppIcon.vue';
import request from '/src/utils/request';
localStorage.setItem('user_info',JSON.stringify({role:'super_admin'}));
localStorage.setItem('appt_list_active_tab','all');
window.requests=[];
request.defaults.adapter=async config=>{
 window.requests.push({method:config.method,url:config.url});let data=[];
 if(config.url.includes('/patients?search='))data=[{id:1,name:'手机号检索患者',phone:'138****5678',gender:0,age:30}];
 return {data:{code:200,data},status:200,statusText:'OK',headers:{},config};
};
const Component=Create;
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/appointment/detail/:id',component:Component},{path:'/appointment',component:Component}]});
await router.push('/appointment');await router.isReady();
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
await send('Page.navigate',{url:'http://127.0.0.1:5198/gender-unset-preview.html'});
for(let i=0;i<100;i++){if(await evaluate("!!document.querySelector('.patient-picker-select input')"))break;await new Promise(r=>setTimeout(r,150))}
await evaluate("(()=>{const input=document.querySelector('.patient-picker-select input');input.focus();input.click();input.value='13800005678';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
for(let i=0;i<50;i++){if((await evaluate('document.body.innerText')).includes('手机号检索患者'))break;await new Promise(r=>setTimeout(r,100))}
assert.ok((await evaluate('document.body.innerText')).includes('手机号检索患者'));
assert.ok((await evaluate('document.body.innerText')).includes('138****5678'));
assert.ok((await evaluate('window.requests')).some(r=>r.url.includes('search=13800005678')));
await evaluate("[...document.querySelectorAll('.t-select-option')].find(e=>e.textContent.includes('手机号检索患者')).click()");await new Promise(r=>setTimeout(r,300));assert.ok((await evaluate('document.body.innerText')).includes('未设置'));
const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'search.png'),Buffer.from(shot.data,'base64'));
outcomes.push({case:'完整手机号远程搜索，脱敏选项不被二次过滤',result:'passed'});console.log('PASS masked remote patient option remains visible');
await writeFile(join(output,'preview.json'),JSON.stringify({outcomes,scope:'Actual Vue components with mocked business API; no real patient operations'},null,2));
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
