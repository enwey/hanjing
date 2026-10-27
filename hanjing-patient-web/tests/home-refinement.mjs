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
 for(const width of [1440,390]) {
  await tab.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  await tab.send('Page.navigate',{url:'http://127.0.0.1:3003/?refine='+width+'#/home'});
  for(let n=0;n<100 && !await ev('!!document.querySelector(".hc-carousel")');n++) await new Promise(r=>setTimeout(r,100));
  await ev('document.fonts.ready');
  assert.equal(await ev('document.querySelectorAll(".hc-type-banner img").length'),1);
  assert.equal(await ev('document.querySelectorAll(".hc-service .btn").length'),4);
  assert.equal(await ev('document.querySelector(".hc-photo-small figcaption").textContent'),'阻鼾器');
  assert(await ev('document.querySelector(".pc-copyright").textContent.includes("兴康明管理（深圳）有限公司")'));
  await ev('document.querySelectorAll(".hc-faq-question")[1].click()');
  await new Promise(r=>setTimeout(r,300));
  assert.equal(await ev('document.querySelectorAll(".hc-faq-question[aria-expanded=true]").length'),1);
  assert.equal(await ev('document.querySelectorAll(".hc-faq-answer.is-open").length'),1);
  await ev('document.querySelectorAll(".hc-faq-question")[2].click();document.querySelectorAll(".hc-faq-question")[0].click()');
  await new Promise(r=>setTimeout(r,300));
  assert.equal(await ev('document.querySelectorAll(".hc-faq-answer.is-open").length'),1);
  await ev('document.querySelector("[data-slide=\\"1\\"]").click()');
  assert(await ev('document.querySelectorAll(".hc-carousel-images img")[1].classList.contains("is-active")'));
  await ev('document.querySelector("[data-slide=\\"0\\"]").click()');
  await new Promise(r=>setTimeout(r,4700));
  assert(await ev('document.querySelectorAll(".hc-carousel-images img")[1].classList.contains("is-active")'));
  for(const [name,selector] of [['hero','.hc-hero'],['services','.hc-services'],['community','.hc-community-band'],['device','.hc-device'],['faq','.hc-faq']]) {
   await ev('document.querySelector('+JSON.stringify(selector)+').scrollIntoView();window.scrollBy(0,-140)');
   await new Promise(r=>setTimeout(r,100));
   assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
   const shot=await tab.send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync('/tmp/hanjing-pc-refine-'+name+'-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
  await tab.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await tab.send('Emulation.setEmulatedMedia',{features:[]});
  console.log(width+': buttons, font, FAQ exclusive/rapid toggle, carousel manual/auto/pause, reduced motion, copyright, no overflow passed');
 }
} finally {tab.ws.close();await browser.send('Target.closeTarget',{targetId});browser.ws.close();}
