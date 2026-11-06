import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';
const output=resolve('tests/mini-program/artifacts/gender-unset');await mkdir(output,{recursive:true});
const css=(await readFile('mp-weixin-rewrite/pages/profile/settings/personal-info/index.wxss','utf8')).replace(/([\d.]+)rpx/g,(_,n)=>Number(n)/2+'px').replaceAll('.data-v-acab1652:root',':root');
for(const page of ['view','edit'])await writeFile(join(output,page+'.html'),`<!doctype html><meta charset="utf-8"><style>view{display:block}body{margin:0;font-family:Arial,'Microsoft Yahei'}${css}</style><view class="page data-v-acab1652"><view class="form-row data-v-acab1652"><text class="form-label data-v-acab1652">性别</text>${page==='view'?'<text class="form-value data-v-acab1652">未设置</text>':'<view class="form-chips data-v-acab1652"><view class="chip data-v-acab1652">男</view><view class="chip data-v-acab1652">女</view></view>'}</view><view class="form-row data-v-acab1652"><text class="form-label data-v-acab1652">生日</text><text class="form-value data-v-acab1652">${page==='view'?'未设置':'请选择生日'}</text></view></view>`);
const profile=await mkdtemp(join(tmpdir(),'notification-preview-'));const port=9463;let ws,browser;
try{
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 for(let i=0;i<80;i++){try{await fetch(`http://127.0.0.1:${port}/json/version`);break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let id=0;const calls=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=calls.get(m.id);calls.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{calls.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});await send('Page.enable');
 const results=[];
 for(const width of [320,390])for(const page of ['view','edit']){
 await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'file:///'+join(output,page+'.html').replaceAll('\\','/')});await new Promise(r=>setTimeout(r,300));
 const r=await send('Runtime.evaluate',{expression:`({width:document.documentElement.scrollWidth,viewport:innerWidth,cards:[...document.querySelectorAll('.form-row')].map(e=>({x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,height:e.getBoundingClientRect().height})),text:document.body.innerText})`,returnByValue:true});const value=r.result.value;assert.ok(value.width<=width);assert.ok(value.cards.every(c=>c.x>=0&&c.right<=width&&c.height>0));assert.ok(value.text.includes(page==='view'?'未设置':'请选择生日'));
 if(page==='edit'){const active=await send('Runtime.evaluate',{expression:"document.querySelectorAll('.chip.active').length",returnByValue:true});assert.equal(active.result.value,0);}
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,`${page}-${width}.png`),Buffer.from(shot.data,'base64'));results.push({width,page,passed:true});
 }await writeFile(join(output,'visual.json'),JSON.stringify({method:'Chrome headless production WXSS layout preview; not native WeChat',results},null,2));console.log('PASS 4 responsive layout previews');
}finally{if(ws)ws.close();if(browser){browser.kill();await new Promise(r=>setTimeout(r,300));}if(profile.startsWith(tmpdir()+sep))await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300});}
