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
  for (const width of [1440,390]) {
    await tab.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await tab.send('Page.navigate',{url:'http://127.0.0.1:3003/?footer='+width+'#/home'});
    for(let n=0;n<100 && !await ev('!!document.querySelector(".consumer-footer")');n++) await new Promise(r=>setTimeout(r,100));
    await ev('window.scrollTo(0,document.body.scrollHeight)');
    await new Promise(r=>setTimeout(r,400));
    assert.equal(await ev('document.querySelectorAll(".consumer-footer > div").length'),4);
    assert.equal(await ev('document.querySelectorAll(".consumer-footer a").length'),5);
    assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
    const shot=await tab.send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync('/tmp/hanjing-pc-footer-'+width+'.png',Buffer.from(shot.data,'base64'));
    await ev('[...document.querySelectorAll(".consumer-footer a")].find(a=>a.textContent==="隐私政策").click()');
    for(let n=0;n<100 && !await ev('!!document.querySelector(".pc-legal")');n++) await new Promise(r=>setTimeout(r,100));
    assert(await ev('document.querySelector(".pc-legal").textContent.includes("您的权利")'));
    console.log(width+': footer columns, links, no overflow, privacy navigation passed');
  }
} finally {tab.ws.close();await browser.send('Target.closeTarget',{targetId});browser.ws.close();}
