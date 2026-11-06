import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const output=resolve('tests/mini-program/artifacts/notification-family-im');await mkdir(output,{recursive:true});
const css=(await readFile('mp-weixin-rewrite/pages/profile/online-service/index.wxss','utf8')).replace(/([\d.]+)rpx/g,(_,n)=>Number(n)/2+'px');
const shell=body=>`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,'Microsoft Yahei',sans-serif}input{border:0;font-family:inherit}view,hj-navbar{display:block}hj-navbar{padding:20px;text-align:center;background:white;font-size:17px;font-weight:600;flex-shrink:0}.chat-area{overflow-y:auto}${css}</style>${body}`;
const banner='<hj-navbar>在线客服</hj-navbar><div class="service-banner"><span class="service-banner__patient">就诊人：测试家属</span><span class="service-banner__text">如需预约、改约或咨询治疗问题，可直接留言</span></div>';
const input='<div class="input-bar data-v-72504f8b"><div class="upload-action" aria-label="上传图片" style="padding:5px 7.5px 5px 5px;display:flex;align-items:center;justify-content:center;font-size:22px;color:#6b7280">📷</div><input class="chat-input data-v-72504f8b" placeholder="输入您的问题..."><div class="btn-send data-v-72504f8b"><text class="data-v-72504f8b">发送</text></div></div>';
await writeFile(join(output,'family.html'),shell(`<div class="page data-v-72504f8b">${banner}<div class="chat-area data-v-72504f8b"><div class="chat-list data-v-72504f8b"><div class="chat-msg assistant data-v-72504f8b"><div class="msg-bubble assistant data-v-72504f8b"><span class="msg-text data-v-72504f8b">这是测试家属的服务回复。长内容应自然换行，并清楚显示当前就诊人。</span><span class="msg-time data-v-72504f8b">14:30</span></div></div><div class="chat-msg user data-v-72504f8b"><div class="msg-bubble user data-v-72504f8b"><span class="msg-text data-v-72504f8b">收到，谢谢。</span><span class="msg-time data-v-72504f8b">14:31</span></div></div></div></div>${input}</div>`));
await writeFile(join(output,'revoked.html'),shell(`<div class="page data-v-72504f8b">${banner}<div class="conversation-error">该会话已不存在或您无权访问</div><div class="chat-area data-v-72504f8b"></div></div>`));
const profile=await mkdtemp(join(tmpdir(),'family-im-preview-'));const port=9469;let ws,browser;
try{
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<80;i++){try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0;const calls=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=calls.get(m.id);calls.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{calls.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});await send('Page.enable');const results=[];
 for(const width of [320,390])for(const page of ['family','revoked']){
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'file:///'+join(output,page+'.html').replaceAll('\\','/')});await new Promise(r=>setTimeout(r,300));
  const r=await send('Runtime.evaluate',{expression:`({width:document.documentElement.scrollWidth,viewport:innerWidth,fields:[...document.querySelectorAll('.service-banner,.conversation-error,.chat-msg')].map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,height:e.getBoundingClientRect().height})),buttons:[...document.querySelectorAll('button')].map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,height:e.getBoundingClientRect().height}))})`,returnByValue:true});const value=r.result.value;assert.ok(value.width<=width);assert.ok(value.fields.every(c=>c.left>=0&&c.right<=width&&c.height>0));assert.ok(value.fields.length>0);
  const controls=await send('Runtime.evaluate',{expression:`(()=>{const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};return {bar:rect('.input-bar'),upload:rect('.upload-action'),input:rect('.chat-input'),send:rect('.btn-send'),chat:rect('.chat-area'),height:document.documentElement.scrollHeight};})()`,returnByValue:true});
  const c=controls.result.value;
  assert.ok(c.height<=844,'page must remain in viewport');
  if(page==='family'){
    assert.ok(c.bar && c.upload && c.input && c.send,'full input controls rendered');
    assert.ok(c.bar.bottom<=844 && c.bar.top>=0,'input bar within screen');
    assert.ok(c.upload.left>=0 && c.send.right<=width,'controls within horizontal bounds');
    assert.ok(c.upload.right<=c.input.left && c.input.right<=c.send.left,'input controls do not overlap');
    assert.ok(c.input.width>=100 && c.chat.bottom<=c.bar.top,'input readable and chat does not overlap bar');
  }else assert.equal(c.bar,null,'revoked conversation must hide input controls');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(output,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));results.push({width,page,passed:true});
 }await writeFile(join(output,'visual.json'),JSON.stringify({method:'Isolated Chrome headless production WXSS preview, synthetic content; not native WeChat',results},null,2));console.log('PASS 4 detail responsive previews');
}finally{if(ws)ws.close();if(browser){browser.kill();await new Promise(r=>setTimeout(r,300));}if(profile.startsWith(tmpdir()+sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
