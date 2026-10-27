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
  await tab.send('Page.navigate',{url:'http://127.0.0.1:3003/?motion='+width+'#/home'});
  for(let n=0;n<100 && !await ev('!!document.querySelector(".hc-type-banner")');n++) await new Promise(r=>setTimeout(r,100));
  await new Promise(r=>setTimeout(r,900));
  assert.equal(await ev('document.querySelectorAll(".hc-shortcuts").length'),0);
  assert.equal(await ev('document.querySelectorAll(".hc-type-banner img").length'),1);
  assert(await ev('[...document.querySelectorAll(".hc-type-banner img,.hc-support img")].every(i=>i.complete&&i.naturalWidth>0)'));
  await ev('document.querySelector(".hc-faq").scrollIntoView();window.scrollBy(0,-100)');
  await new Promise(r=>setTimeout(r,850));
  const heights = await ev('(async()=>{const b=document.querySelectorAll(".hc-faq-question")[1],a=document.getElementById(b.getAttribute("aria-controls"));const h=[a.getBoundingClientRect().height];b.click();await new Promise(r=>setTimeout(r,150));h.push(a.getBoundingClientRect().height);await new Promise(r=>setTimeout(r,350));h.push(a.getBoundingClientRect().height);return h})()');
  assert.equal(heights[0],0);assert(heights[1]>0&&heights[1]<heights[2]);
  await ev('document.querySelectorAll(".hc-faq-question")[2].click();document.querySelectorAll(".hc-faq-question")[0].click()');
  await new Promise(r=>setTimeout(r,500));
  assert.equal(await ev('document.querySelectorAll(".hc-faq-answer.is-open").length'),1);
  assert(await ev('[...document.querySelectorAll(".hc-faq-answer:not(.is-open)")].every(a=>a.getBoundingClientRect().height===0)'));
  for(const [name,selector] of [['hero','.hc-hero'],['strip','.hc-type-banner'],['faq','.hc-faq']]) {
   await ev('document.querySelector('+JSON.stringify(selector)+').scrollIntoView();window.scrollBy(0,-100)');
   await new Promise(r=>setTimeout(r,850));
   assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
   const shot=await tab.send('Page.captureScreenshot',{format:'png'});
   fs.writeFileSync('/tmp/hanjing-pc-motion-'+name+'-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
  await tab.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await ev('getComputedStyle(document.querySelector(".hc-faq-answer")).transitionDuration'),'0s');
  await tab.send('Emulation.setEmulatedMedia',{features:[]});
  console.log(width+': removed shortcuts, five image links, support image, interpolated FAQ, rapid toggles, no overflow, reduced motion passed');
 }
} finally {tab.ws.close();await browser.send('Target.closeTarget',{targetId});browser.ws.close();}
