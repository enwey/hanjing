import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const output=resolve('tests/mini-program/artifacts/notification-center');await mkdir(output,{recursive:true});
const css=await readFile('mp-weixin-rewrite/pages/profile/notifications/index.wxss','utf8');
// Render the production classes/layout with explicit fixtures; not a native WeChat renderer.
const fixtures=[['预约','预约已改期','测试就诊人，兴康明诊所，医生，2026-11-06 14:00-14:30。'],['报告','鼾声分析报告已生成','本次录音分析已完成，点击查看报告。'],['订单','商品已发货','订单 SP261106001 已发货，请查看物流信息。'],['诊疗','治疗方案已更新','治疗设备：阻鼾器。当前前移量：1mm。下次复诊日期：2026-11-20。请按医嘱执行。']];
const shell=body=>`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,'Microsoft Yahei',sans-serif}button{border:0;cursor:pointer}view,scroll-view,hj-navbar{display:block}hj-navbar{padding:20px;text-align:center;background:white;font-size:17px;font-weight:600}scroll-view{overflow-x:auto}${css}</style>${body}`;
await writeFile(join(output,'list.html'),shell(`<div class="page"><hj-navbar>消息通知</hj-navbar><div class="top-bar">4 条未读<button class="read-all">全部已读</button></div><scroll-view class="categories"><div class="category-row">${['全部','预约','诊疗','报告','订单','社区','推广','系统'].map((v,i)=>`<div class="category ${i?'':'selected'}">${v}</div>`).join('')}</div></scroll-view><div class="page-content">${fixtures.map(([kind,title,content])=>`<div class="noti-card unread"><div class="noti-icon">${kind}</div><div class="noti-body"><div class="noti-heading"><span class="noti-title">${title}</span><div class="noti-dot"></div></div><span class="noti-content">${content}</span><div class="noti-footer"><span>2026-11-06 12:30</span><span class="detail-link">查看详情 ›</span></div></div></div>`).join('')}<div class="list-footer">上拉加载更多</div></div></div>`));
await writeFile(join(output,'detail.html'),shell(`<div class="page"><hj-navbar>通知详情</hj-navbar><div class="detail-card"><span class="detail-title">预约已改期</span><span class="detail-time">2026-11-06 12:30</span><span class="detail-content">${fixtures[0][2]}</span><button class="detail-action" style="width:100%;padding:12px;border-radius:8px">查看业务详情</button></div></div>`));
const profile=await mkdtemp(join(tmpdir(),'notification-preview-'));const port=9463;let ws,browser;
try{
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<80;i++){try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0;const calls=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=calls.get(m.id);calls.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{calls.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});await send('Page.enable');
 const results=[];
 for(const width of [320,390])for(const page of ['list','detail']){
 await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'file:///'+join(output,page+'.html').replaceAll('\\','/')});await new Promise(r=>setTimeout(r,300));
 const r=await send('Runtime.evaluate',{expression:`({width:document.documentElement.scrollWidth,viewport:innerWidth,cards:[...document.querySelectorAll('.noti-card,.detail-card')].map(e=>({x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,height:e.getBoundingClientRect().height})),text:document.body.innerText})`,returnByValue:true});const value=r.result.value;assert.ok(value.width<=width);assert.ok(value.cards.every(c=>c.x>=0&&c.right<=width&&c.height>0));assert.ok(value.text.includes('预约已改期'));
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));results.push({width,page,passed:true});
 }await writeFile(join(output,'visual.json'),JSON.stringify({method:'Chrome headless production WXSS layout preview; not native WeChat',results},null,2));console.log('PASS 4 responsive layout previews');
}finally{if(ws)ws.close();if(browser){browser.kill();await new Promise(r=>setTimeout(r,300));}if(profile.startsWith(tmpdir()+sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
