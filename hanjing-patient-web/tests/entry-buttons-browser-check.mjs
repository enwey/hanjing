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
const debug = process.env.PC_TEST_CDP || 'http://127.0.0.1:9337';
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
  await new Promise(r=>setTimeout(r,400));
  const {cssContentSize}=await send('Page.getLayoutMetrics');
  const r = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: {...cssContentSize,scale:1},
  });
  fs.writeFileSync(
    '../tests/patient-web/artifacts/entry-buttons-2026-10-28/' + name + '.png',
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

fs.mkdirSync('../tests/patient-web/artifacts/entry-buttons-2026-10-28',{recursive:true});



try {
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/#/login'});await wait(`!!document.querySelector('[data-action="local-login"]')`);await ev(`document.querySelector('[data-action="local-login"]').click()`);await wait(`location.hash==='#/profile'&&!document.querySelector('.loading-state')`);
await ev(`window.__fixture=${JSON.stringify(fixtures)};window.__realFetch=fetch;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);return new Response(JSON.stringify({code:0,data:__fixture[u.pathname.slice(7)]??[]}))}`);
for(const name of Object.keys(titles).filter(n=>!['home','login','wearing'].includes(n))){
await go(name,routeParams[name]||{});
check('route '+name,await ev(`!document.querySelector('#content .error-state') && !!document.querySelector('#content .pc-page-head')`));
check('button entries '+name,await ev(`Array.from(document.querySelectorAll('#content .pc-page-head a,#content .patient-options-bar>a,#content .pc-list-row a,#content .profile-heading>a')).every(a=>a.classList.contains('btn'))`));
}
await go('report',{id:assessments[0].id,patientId:'21'});await wait(`!!document.querySelector('.ess-report')`);await shot('report-desktop');
check('all assessments visible button border',await ev(`(()=>{const a=document.querySelector('.pc-page-head .entry-button'),s=getComputedStyle(a);return s.borderTopStyle==='solid'&&parseFloat(s.borderTopWidth)>=1&&a.getBoundingClientRect().height>=44})()`));
await ev(`document.querySelector('.pc-page-head .entry-button').click()`);await wait(`location.hash.includes('/assessments')&&!document.querySelector('.loading-state')`);check('all assessments destination and patient retained',await ev(`location.hash.includes('patientId=21')&&!!document.querySelector('.pc-list-row .entry-button')`));await shot('list-desktop');
await go('distribution');await shot('distribution-desktop');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:false});
for(const name of ['report','assessments','profile','family','distribution','treatment']){await go(name,routeParams[name]||{});check('mobile overflow '+name,await ev(`document.documentElement.scrollWidth<=390`));}
await go('report',{id:assessments[0].id,patientId:'21'});await shot('report-mobile');
fs.writeFileSync('../tests/patient-web/artifacts/entry-buttons-2026-10-28/results.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
