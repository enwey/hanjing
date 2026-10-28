import fs from 'node:fs';
import {
  fixtures,
  routeParams,
  appointment,
  order,
  post,
  assessments,
} from './fixtures.mjs';
import { titles } from '../src/pages.js';
const debug = process.env.PC_TEST_CDP || 'http://127.0.0.1:9338';
const base = process.env.PC_TEST_URL || 'http://127.0.0.1:3003';
const version = await (await fetch(debug + '/json/version')).json();
if (!version['User-Agent']?.includes('HeadlessChrome'))
  throw Error('Use an isolated headless Chrome, not the user browser');
function connect(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    let id = 0;
    const events = [];
    ws.onopen = () =>
      resolve({
        ws,
        events,
        send: (method, params = {}) =>
          new Promise((r, j) => {
            const n = ++id;
            pending.set(n, { r, j });
            ws.send(JSON.stringify({ id: n, method, params }));
          }),
      });
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.id) {
        const p = pending.get(d.id);
        pending.delete(d.id);
        d.error ? p.j(Error(d.error.message)) : p.r(d.result);
      } else events.push(d);
    };
  });
}
const browser = await connect(version.webSocketDebuggerUrl);
const { targetId } = await browser.send('Target.createTarget', {
  url: 'about:blank',
});
const tabs = await (await fetch(debug + '/json/list')).json();
const target = tabs.find((t) => t.id === targetId);
const tab = await connect(target.webSocketDebuggerUrl);
const send = tab.send,
  checks = [];
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression: '{\n' + expression + '\n}',
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails)
    throw Error(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text,
    );
  return r.result.value;
};
const check = (name, ok) => {
  checks.push({ name, ok: !!ok });
  if (!ok) console.error('FAIL', name);
};
const wait = async (expression, timeout = 7000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await ev(expression)) return;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw Error('Timed out: ' + expression);
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(
    '../tests/patient-web/artifacts/treatment-2026-10-28/' + name + '.png',
    Buffer.from(r.data, 'base64'),
  );
};
const go = async (page, params = {}) => {
  await ev(
    `location.hash=${JSON.stringify('#/' + page + (Object.keys(params).length ? '?' + new URLSearchParams(params) : ''))}`,
  );
  await new Promise((r) => setTimeout(r, 130));
  await wait(
    `!document.querySelector('.loading-state') && !!document.querySelector('#content')`,
  );
};

fs.mkdirSync('../tests/patient-web/artifacts/treatment-2026-10-28',{recursive:true});


try {
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/#/stores'});await wait(`!!document.querySelector('.clinic-store-card')`);check('store heading has no duplicate count row',await ev(`document.querySelector('h1').textContent==='请选择就诊门店'&&!document.querySelector('.clinic-section-heading')`));const cardRect=await ev(`const r=document.querySelector('.clinic-store-card').getBoundingClientRect();({left:r.left,top:r.top,width:r.width,height:r.height})`);
 for(const [label,x,y] of [['cover',cardRect.left+80,cardRect.top+80],['edge',cardRect.left+2,cardRect.top+cardRect.height/2],['body',cardRect.left+60,cardRect.top+cardRect.height-80]]){
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await new Promise(r=>setTimeout(r,250));
 const stable=await ev(`(async()=>{const values=[];for(let i=0;i<45;i++){await new Promise(requestAnimationFrame);const c=document.querySelector('.clinic-store-card');values.push(getComputedStyle(c).borderColor+'|'+c.getBoundingClientRect().width+'|'+c.matches(':hover'))}return new Set(values).size===1&&values[0].endsWith('true')})()`);check('stationary hover stable at '+label,stable);
 }
check('card hover leaves button color unchanged',await ev(`getComputedStyle(document.querySelector('.clinic-store-actions a.btn')).backgroundColor==='rgb(59, 107, 245)'&&!document.querySelector('.clinic-store-actions a.btn').matches(':hover')`));
 await shot('clinic-card-hover');
 const br=await ev(`const r=document.querySelector('.clinic-store-actions a.btn').getBoundingClientRect();({x:r.left+r.width/2,y:r.top+r.height/2})`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...br});await new Promise(r=>setTimeout(r,500));check('button hover changes only button color',await ev(`document.querySelector('.clinic-store-actions a.btn').matches(':hover')&&getComputedStyle(document.querySelector('.clinic-store-actions a.btn')).backgroundColor==='rgb(26, 53, 128)'`));
 await shot('clinic-stores-real');await ev(`document.querySelector('.clinic-store-actions a').click()`);await wait(`!!document.querySelector('.clinic-doctor-card')`);check('doctor heading has no duplicate count row',await ev(`document.querySelector('h1').textContent==='请选择医生'&&!document.querySelector('.clinic-section-heading')`));check('real store opens filtered doctor list',await ev(`location.hash.includes('storeId=')`));await shot('clinic-doctors-real');
 const data=structuredClone(fixtures);data['/stores']=[{...data['/stores'][0],doctorCount:1,isOpen:true},{...data['/stores'][0],id:10,name:'筹备门店',status:'prepare',isOpen:false},{...data['/stores'][0],id:12,name:'休息门店',isOpen:false,coverUrl:'/missing-store-test.jpg'}];
 await ev(`window.__fixture=${JSON.stringify(data)};window.__realFetch=fetch;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);return new Response(JSON.stringify({code:0,data:__fixture[u.pathname.slice(7)]??[]}))}`);
 await go('stores');check('status distinguishes open closed and preparing',await ev(`const t=document.querySelector('.clinic-store-grid').textContent;t.includes('营业中')&&t.includes('筹备中')&&t.includes('休息中')`));check('preparing store cannot book',await ev(`const c=document.querySelectorAll('.clinic-store-card')[1];!c.querySelector('a')&&c.querySelector('button').disabled`));await wait(`!document.querySelector('img[src="/missing-store-test.jpg"]')`);check('failed store cover leaves mini placeholder',await ev(`!!document.querySelectorAll('.clinic-store-placeholder')[2]`));
 await ev(`document.querySelector('.clinic-store-actions a').click()`);await wait(`!!document.querySelector('.clinic-doctor-card')`);check('doctor card keeps selected store',await ev(`document.querySelector('.clinic-doctor-card').getAttribute('href').includes('storeId=9')`));await ev(`document.querySelector('.clinic-doctor-card').click()`);await wait(`!!document.querySelector('.clinic-doctor-detail')`);check('doctor detail preserves booking params and real intro',await ev(`document.querySelector('.clinic-doctor-booking a').getAttribute('href').includes('storeId=9&doctorId=11')&&document.querySelector('.clinic-doctor-sections').textContent.includes('仅供隔离自动化测试')`));await shot('clinic-doctor-detail');
 await go('doctors');check('unscoped doctor detail keeps own store mappings',await ev(`document.querySelector('.clinic-doctor-card').getAttribute('href')==='#/doctors?id=11'`));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await shot('clinic-doctors-390');check('doctor list has no narrow overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));await go('stores');await shot('clinic-stores-390');check('store list has no narrow overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));
 console.log(JSON.stringify(checks,null,2));fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/clinic-browser-results.json',JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
} finally {await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
