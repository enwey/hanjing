import {readFile,writeFile,rm,mkdtemp,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const root=resolve('hanjing-clinic-管理后台源码-20260607');
const output=resolve('tests/mini-program/artifacts/notification-center');await mkdir(output,{recursive:true});
const fixture=join(root,'notification-moderation-preview.html');
const entry=`<!doctype html><meta charset="utf-8"><div id="app"></div><script type="module">
import {createApp,h} from '/node_modules/.vite/deps/vue.js';
import {createRouter,createMemoryHistory} from '/node_modules/.vite/deps/vue-router.js';
import TDesign from '/node_modules/.vite/deps/tdesign-vue-next.js';
import '/node_modules/tdesign-vue-next/es/style/index.css';
import '/src/styles/global.css';
import Component from '/src/views/content/index.vue';
import AppIcon from '/src/components/AppIcon.vue';
import Backend from '/src/views/distribution/BackendPromoterActions.vue';
import request from '/src/utils/request';
localStorage.setItem('user_info',JSON.stringify({role:'super_admin'}));
const post={id:1,title:'通知审核测试文章',nickname:'测试用户',tags:'[]',status:'pending',created_at:'2026-11-06'};
request.defaults.adapter=async config=>({data:{code:200,data:config.url.includes('/reports')?{list:[{id:1,title:post.title,reason:'信息不准确',status:'pending'}],total:1}:config.url.includes('categories')?[]:[post]},status:200,statusText:'OK',headers:{},config});
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:Component}]});
const app=createApp({render:()=>h('div',[h(Backend,{promoterId:'1',status:'active'}),h(Component)])});app.use(TDesign);app.use(router);app.component('AppIcon',AppIcon);app.directive('permission',{});app.directive('resizable',{});app.mount('#app');
</script>`;
await writeFile(fixture,entry);
const profile=await mkdtemp(join(tmpdir(),'notice-moderation-'));let vite,browser,ws;
try{
const viteModule=(await import('../../hanjing-clinic-管理后台源码-20260607/node_modules/vite/dist/node/index.js'));
vite=await viteModule.createServer({root,configFile:join(root,'vite.config.ts'),server:{host:'127.0.0.1',port:5198,open:false}});await vite.listen();
browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9469',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:9469/json/version');break}catch{}await new Promise(r=>setTimeout(r,100));}
const target=await(await fetch('http://127.0.0.1:9469/json/new?about:blank',{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0;const calls=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=calls.get(m.id);calls.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{calls.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:5198/notification-moderation-preview.html'});
const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
for(let i=0;i<100;i++){if((await evaluate('document.body.innerText')).includes('通知审核测试文章'))break;await new Promise(r=>setTimeout(r,300))}
const click=async label=>{assert.equal(await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!b)return false;b.click();return true})()`),true,label);await new Promise(r=>setTimeout(r,400))};
const capture=async(name,label)=>{const data=await evaluate(`({text:document.body.innerText,boxes:[...document.querySelectorAll('.t-dialog')].filter(e=>e.getBoundingClientRect().height>0).map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})})`);assert.ok(data.text.includes(label));assert.ok(data.boxes.every(r=>r.left>=0&&r.right<=1366&&r.top>=0&&r.bottom<=900));const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(shot.data,'base64'))};
await click('停用');await capture('moderation-promoter-status','停用原因');await click('取消');await click('拒绝');await capture('moderation-reject','拒绝原因');await click('取消');await click('举报处理');await capture('moderation-reports','举报原因');await click('处理');await capture('moderation-resolve','处理说明');console.log('PASS actual Vue/TDesign moderation dialogs with isolated API fixtures');
}catch(e){console.error(e);process.exitCode=1}finally{ws?.close();browser?.kill();await vite?.close();await rm(fixture,{force:true});await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}
