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



try{
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/?localLogin=1#/login'});await wait(`!!document.querySelector('[data-action="local-login"]')`);await ev(`document.querySelector('[data-action="local-login"]').click()`);await wait(`location.hash==='#/profile'&&!document.querySelector('.loading-state')`);
const data=structuredClone(fixtures);data['/appointments']=[{...appointment,status:'pending',type:'first',symptomDesc:'睡眠时打鼾，白天嗜睡'},{...appointment,id:52,status:'confirmed',type:'followup',doctorName:'测试医生乙',symptomDesc:''},{...appointment,id:53,status:'cancelled',type:'adjust'}];
await ev(`window.__fixture=${JSON.stringify(data)};window.__realFetch=fetch;window.__gets=0;window.__posts=[];window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);const p=u.pathname.slice(7);if(opts.method==='POST'){__posts.push({p,body:JSON.parse(opts.body)});__fixture['/appointments'][0].status='cancelled';return new Response(JSON.stringify({code:0,data:{}}))}__gets++;return new Response(JSON.stringify({code:0,data:__fixture[p]??[]}))}`);
await go('appointments');await wait(`document.querySelectorAll('.appointment-list-card').length===2`);check('active list full mini fields and status',await ev(`const t=document.querySelector('.appointment-list-card').textContent;['门店','就诊人','医生','时间','类型','初诊','主诉','睡眠时打鼾','待确认'].every(x=>t.includes(x))`));check('confirmed has no cancel action',await ev(`document.querySelectorAll('.appointment-list-card')[1].querySelectorAll('[data-action="cancel-appointment"]').length===0`));await new Promise(r=>setTimeout(r,350));await shot('appointment-list-desktop');
await ev(`window.__before=__gets;document.querySelector('[data-tab="history"]').click()`);check('history switches locally',await ev(`__before===__gets&&document.querySelectorAll('.appointment-list-card').length===1&&document.querySelector('.appointment-list-card').textContent.includes('已取消')`));await ev(`document.querySelector('[data-tab="upcoming"]').click();document.querySelector('[data-action="cancel-appointment"]').click()`);await wait(`!!document.querySelector('dialog[open]')`);await ev(`document.querySelector('dialog button[value="ok"]').click()`);await wait(`document.querySelectorAll('.appointment-list-card').length===1`);check('list cancellation targets correct appointment and updates grouping',await ev(`__posts.length===1&&__posts[0].p==='/appointments/51/cancel'&&document.querySelector('.appointment-list-card').textContent.includes('已确认')`));
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await shot('appointment-list-390');check('narrow list no overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));console.log(JSON.stringify(checks,null,2));fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/appointment-list-results.json',JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
