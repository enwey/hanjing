/** Standalone prototype self-checks. Requires an isolated headless Chrome on port 9337. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const {parse}=require(path.join(root,'hanjing-clinic-管理后台源码-20260607/node_modules/@vue/compiler-dom'));
const app=JSON.parse(fs.readFileSync(path.join(root,'mp-weixin-rewrite/app.json'),'utf8'));
const expected=[...app.pages,...app.subpackages.flatMap(s=>s.pages.map(p=>s.root+'/'+p))].sort();
const targets=await(await fetch('http://127.0.0.1:9337/json/list')).json();
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let seq=0;const pending=new Map(),runtimeErrors=[];
ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.method==='Runtime.exceptionThrown')runtimeErrors.push(d.params.exceptionDetails.text);if(d.id){pending.get(d.id)?.(d);pending.delete(d.id);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timeout=setTimeout(()=>reject(Error('CDP timeout: '+method)),15000);pending.set(id,r=>{clearTimeout(timeout);if(r.error)reject(Error(JSON.stringify(r.error)));else resolve(r.result)});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const checks=[];const check=(label,pass,detail='')=>{checks.push({label,pass,detail});if(!pass)console.error('FAIL',label,detail);};
await send('Page.enable');await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1536,height:1100,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:pathToFileURL(path.join(root,'UI/PC端全页面设计稿_平铺版.html')).href});
await new Promise(r=>setTimeout(r,700));
const pages=await evaluate('PAGES');
check('59 route coverage',JSON.stringify(pages.map(p=>p.route).sort())===JSON.stringify(expected));
const sourceTitles=expected.map(route=>{const source=fs.readFileSync(path.join(root,'mp-weixin-rewrite',route+'.wxml'),'utf8');return {route,title:source.match(/<hj-navbar[^>]*title="([^"{}]+)"/)?.[1]};}).filter(p=>p.title);
check('Page titles match mini source',sourceTitles.every(p=>pages.find(v=>v.route===p.route)?.title===p.title));
check('Default guest home',await evaluate("!state.loggedIn && !document.querySelector('#stage').textContent.includes('林晓') && !document.querySelector('#stage').textContent.includes('平均佩戴') && document.querySelector('.hero-editorial')!==null"));
check('No sidebar or route chrome',await evaluate("getComputedStyle(document.querySelector('.catalog')).display==='none' && !document.querySelector('.board-meta') && !document.querySelector('[data-mode=routes]')"));
check('Guest private page protection',await evaluate("[...PRIVATE_PAGES].every(id=>{go(id);return !!document.querySelector('.guest-invitation')&&!document.querySelector('#stage').textContent.includes('328.00')})"));
await evaluate('state.loggedIn=true');
const snapshots=await evaluate("PAGES.map(p=>{state.filter='全部';return {id:p.id,html:shell(p)}})");
for(const s of snapshots){const errors=[];parse(s.html,{onError:e=>errors.push(e.message)});check('HTML '+s.id,errors.length===0,errors.join('; '));}
const entryErrors=[];parse(fs.readFileSync(path.join(root,'UI/PC端全页面设计稿_平铺版.html'),'utf8'),{onError:e=>entryErrors.push(e.message)});
check('Entry HTML tag structure',entryErrors.length===0,entryErrors.join('; '));
for(const width of [1536,1280,1024]){
await send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
const layouts=await evaluate("PAGES.map(p=>{go(p.id);const app=document.querySelector('.app');const header=document.querySelector('.app-header');return {id:p.id,ok:document.documentElement.scrollWidth<=innerWidth&&app.scrollWidth<=app.clientWidth+2&&header.scrollWidth<=header.clientWidth+2}})");
check('All 59 page widths '+width,layouts.every(x=>x.ok),layouts.filter(x=>!x.ok).map(x=>x.id).join(','));
}
const interactions=await evaluate('('+function(){
const click=s=>{const n=document.querySelector(s);if(!n)throw Error('missing '+s);n.click()};
go('stores');click('[data-store="兴康明诊所 · 深圳"]');click('[data-doctor="陈医生"]');click('[data-date="10月29日 周四"]');click('[data-time="10:00–10:30"]');click('[data-go="confirm"]');click('[data-member="林爸爸"]');click('[data-go="success"]');
const appointment=state.page==='success'&&document.querySelector('#stage').textContent.includes('陈医生')&&document.querySelector('#stage').textContent.includes('深圳');
go('questionnaire');click('[data-action="submit-assessment"]');const guard=state.page==='questionnaire';for(let i=0;i<8;i++)click('[data-answer="'+i+':1"]');click('[data-action="submit-assessment"]');const score=state.page==='assessment-result'&&document.querySelector('.score-circle strong').textContent==='8';
state.loggedIn=false;go('profile');click('[data-go="login"]');click('[data-action="login"]');const loginGuard=state.page==='login';document.querySelector('#agreement-check').checked=true;click('[data-action="login"]');const login=state.page==='profile'&&state.loggedIn;
go('products');click('[data-filter="配件耗材"]');const productFilter=document.querySelectorAll('.product-card').length===1;
state.mode='gallery';render();const gallery=document.querySelectorAll('.thumbnail').length===59;
state.mode='preview';go('home');click('[data-action="logout"]');const logout=!state.loggedIn&&state.page==='home'&&!document.querySelector('#stage').textContent.includes('林晓');
return {appointment,guard,score,loginGuard,login,productFilter,gallery,logout};
}.toString()+')()');
for(const [label,pass] of Object.entries(interactions))check('Interaction '+label,pass);
const fidelity=await evaluate('('+function(){
const click=s=>document.querySelector(s).click();const text=()=>document.querySelector('.app-body').textContent;
state.loggedIn=true;go('community-tab');const tabs=[...document.querySelectorAll('[data-filter]')].map(x=>x.textContent).join(',')==='热门,最新,专家';const noCourse=!text().includes('课程')&&!document.querySelector('.app-body [data-go="live"]');
click('[data-filter="专家"]');const experts=document.querySelectorAll('.post').length===2&&!text().includes('林晓');click('[data-filter="最新"]');const latest=[...document.querySelectorAll('.post-title-link')].map(x=>x.textContent);const latestOrder=latest[0].includes('常见问题')&&latest[1].includes('佩戴记录');
click('[data-post="p2"]');const post=text().includes('分享我的佩戴记录')&&!!document.querySelector('[data-favorite]')&&!!document.querySelector('[data-action="report-post"]');click('[data-favorite="p2"]');const favorite=document.querySelector('[data-favorite]').textContent==='已收藏';click('[data-action="reply"]');const reply=document.querySelector('[name="comment"]').placeholder==='回复 @鼾友';
go('publish');const form=document.querySelector('[data-form="publish"]');const limits=form.querySelector('[name="title"]').maxLength===40&&form.querySelector('textarea').maxLength===1000&&!form.querySelector('[type="file"]');const tags=[...form.querySelectorAll('[name="tags"]')];tags.slice(0,4).forEach(t=>t.click());const maxTags=form.querySelectorAll('[name="tags"]:checked').length===3;
const categories=[...form.querySelectorAll('select option')].map(x=>x.textContent).join(',')==='睡眠科普,治疗知识,设备介绍,患者故事,阻鼾器配戴,科普问答';
go('live');const liveTabs=[...document.querySelectorAll('[data-filter]')].map(x=>x.textContent).join(',')==='全部,直播中,预告,回放';go('playback');const liveDetail=text().includes('微信直播间ID')&&text().includes('直播好物')&&!document.querySelector('.video-placeholder');
go('products');click('[data-filter="配件耗材"]');click('[data-product="1"]');const productDetail=text().includes('阻鼾器清洁套装');
go('orders');const orderTabs=[...document.querySelectorAll('[data-filter]')].map(x=>x.textContent).join(',')==='全部,待付款,待取货,待发货,已发货,已完成';click('[data-order="已发货"]');const shipping=text().includes('确认收货')&&text().includes('运单号');
go('maintenance');const maintenance=text().includes('费用：')&&text().includes('清洁')&&!text().includes('日常护理');go('feedback');const feedback=text().includes('回复')&&text().includes('4 / 5')&&text().includes('提交反馈');
go('withdraw');const bank=text().includes('微信零钱（未开通）')&&text().includes('开户银行')&&text().includes('银行卡号');go('add-member');const memberFields=text().includes('所属诊所')&&text().includes('与本人关系')&&text().includes('病历号')&&!document.querySelector('input[maxlength="18"]').required;
return {tabs,noCourse,experts,latestOrder,post,favorite,reply,limits,maxTags,categories,liveTabs,liveDetail,productDetail,orderTabs,shipping,maintenance,feedback,bank,memberFields};
}.toString()+')()');
for(const [label,pass] of Object.entries(fidelity))check('Mini parity '+label,pass);
const filterTemplates=await evaluate("['医疗器械','配件耗材','服务套餐'].map(f=>{state.filter=f;return {filter:f,html:commerce('products')}})");
for(const f of filterTemplates){const errors=[];parse(f.html,{onError:e=>errors.push(e.message)});check('Filter markup '+f.filter,errors.length===0,errors.join('; '));}
await send('Emulation.setDeviceMetricsOverride',{width:1536,height:1100,deviceScaleFactor:1,mobile:false});
for(const id of ['home','stores','treatment','products','recording','distribution','community-tab','post','publish','maintenance','live']){
await evaluate("state.member='林晓';state.store='兴康明诊所 · 深圳';state.doctor='王医生';state.date='10月28日 周三';state.time='09:00–09:30';$('#toast').style.display='none';go('"+id+"')");await new Promise(r=>setTimeout(r,100));
check('Images '+id,await evaluate('[...document.images].every(i=>i.complete&&i.naturalWidth>0)'));
const image=await send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync('/tmp/hanjing-pc-'+id+'.png',Buffer.from(image.data,'base64'));
}
await evaluate("state.mode='gallery';render()");
const image=await send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync('/tmp/hanjing-pc-gallery.png',Buffer.from(image.data,'base64'));
check('No runtime errors',runtimeErrors.length===0,runtimeErrors.join(';'));
await evaluate("go('home')");
ws.close();
console.log(JSON.stringify({passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass),total:checks.length},null,2));
if(checks.some(x=>!x.pass))process.exitCode=1;
