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
    await tab.send('Page.navigate',{url:'http://127.0.0.1:3003/?navcheck='+width+'#/home'});
    for(let n=0;n<100 && !await ev('!!document.querySelector(".hc-header")');n++) await new Promise(r=>setTimeout(r,100));
    await ev('window.scrollTo(0,600)');
    await new Promise(r=>setTimeout(r,300));
    const info=await ev('(()=>{const h=document.querySelector(".hc-header"),r=h.getBoundingClientRect();return {top:r.top,scroll:scrollY,position:getComputedStyle(h).position,hit:h.contains(document.elementFromPoint(r.x+20,r.y+20)),overflow:document.documentElement.scrollWidth>innerWidth}})()');
    assert(info.scroll>0);assert.equal(info.top,0);assert.equal(info.position,'sticky');assert(info.hit);assert(!info.overflow);
    const shot=await tab.send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync('/tmp/hanjing-pc-sticky-'+width+'.png',Buffer.from(shot.data,'base64'));
    await ev('[...document.querySelectorAll(".top-nav a")].find(a=>a.textContent.trim()==="社区").click()');
    for(let n=0;n<100 && !await ev('!!document.querySelector(".pc-page-head h1")');n++) await new Promise(r=>setTimeout(r,100));
    assert.equal(await ev('document.querySelector(".pc-page-head h1").textContent'),'社区');
    assert.equal(await ev('document.querySelectorAll(".breadcrumb").length'),0);
    console.log(width+': sticky, visible, no horizontal overflow, navigation and breadcrumb removal passed');
  }
} finally {tab.ws.close();await browser.send('Target.closeTarget',{targetId});browser.ws.close();}
