import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from '@vue/compiler-dom';
import { pageHead } from '../src/ui.js';
parse(pageHead('社区', '说明', '<a href="#/home">首页</a>'));
assert(!pageHead('社区').includes('breadcrumb'));
const version = await (await fetch('http://127.0.0.1:9337/json/version')).json();
assert(version['User-Agent'].includes('HeadlessChrome'));
async function connect(url) {
  const ws = new WebSocket(url), pending = new Map(); let id = 0;
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const d = JSON.parse(e.data); if(d.id) { const p=pending.get(d.id); pending.delete(d.id); d.error ? p.reject(Error(d.error.message)) : p.resolve(d.result); } };
  return { ws, send: (method, params={}) => new Promise((resolve,reject) => {const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));}) };
}
const browser = await connect(version.webSocketDebuggerUrl);
const {targetId} = await browser.send('Target.createTarget',{url:'about:blank'});
const tabs = await (await fetch('http://127.0.0.1:9337/json/list')).json();
const tab = await connect(tabs.find(t=>t.id===targetId).webSocketDebuggerUrl);
const ev = async expression => {const r=await tab.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
try {
 for(const width of [1440,1920,390]) {
 await tab.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 await tab.send('Page.navigate',{url:'http://127.0.0.1:3003/?banner='+width+'#/home'});
 for(let n=0;n<100&&!await ev('!!document.querySelector(".hc-type-banner img")');n++)await new Promise(r=>setTimeout(r,100));
 assert.equal(await ev('document.querySelector(".hc-type-banner").getBoundingClientRect().height'),48);
 assert.equal(await ev('document.querySelectorAll(".hc-type-word").length'),5);
 assert(Math.abs(await ev('document.querySelector(".hc-type-banner img").getBoundingClientRect().width')-Math.min(680,width-32)*.6)<.1);
 assert.equal(await ev('document.querySelectorAll("[data-carousel-pause]").length'),0);
 assert.equal(await ev('document.querySelectorAll(".hc-type-banner a,.hc-type-banner button").length'),0);
 const first=await ev('document.querySelector(".hc-carousel-images .is-active").src');
 await new Promise(r=>setTimeout(r,4700));
 assert.notEqual(await ev('document.querySelector(".hc-carousel-images .is-active").src'),first);
 await ev('document.querySelector(".hc-type-banner").scrollIntoView();window.scrollBy(0,-100)');
 await new Promise(r=>setTimeout(r,800));
 assert(await ev('document.querySelector(".hc-type-banner img").naturalWidth>0'));
 assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
 const shot=await tab.send('Page.captureScreenshot',{format:'png'});
 fs.writeFileSync('/tmp/hanjing-pc-banner-height-'+width+'.png',Buffer.from(shot.data,'base64'));
 console.log(width+': image, no navigation, no play button, autoplay passed');
 }
}finally{tab.ws.close();await browser.send('Target.closeTarget',{targetId});browser.ws.close();}
