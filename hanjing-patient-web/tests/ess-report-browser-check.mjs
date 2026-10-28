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
    '../tests/patient-web/artifacts/ess-report-2026-10-28/' + name + '.png',
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

fs.mkdirSync('../tests/patient-web/artifacts/ess-report-2026-10-28',{recursive:true});



try {
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1200,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/?localLogin=1#/login'});await wait(`!!document.querySelector('[data-action="local-login"]')`);await ev(`document.querySelector('[data-action="local-login"]').click()`);await wait(`location.hash==='#/profile'&&!document.querySelector('.loading-state')`);
await ev(`window.__fixture=${JSON.stringify(fixtures)};window.__fixture['/assessments'][0].essScore=12;window.__fixture['/assessments'][0].essAnswers=[0,1,2,3,0,1,2,3];window.__realFetch=fetch;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);return new Response(JSON.stringify({code:0,data:__fixture[u.pathname.slice(7)]??[]}))}`);
await go('report',{id:assessments[0].id,patientId:'21'});await wait(`!!document.querySelector('.ess-report')`);
check('eight answers and moderate score',await ev(`document.querySelectorAll('.ess-answer-row').length===8&&document.querySelector('.ess-score-card').textContent.includes('中度嗜睡')`));
check('desktop two columns',await ev(`document.querySelector('.ess-score-card').getBoundingClientRect().right<=document.querySelector('.ess-interpretation').getBoundingClientRect().left`));
check('three navigation actions',await ev(`document.querySelectorAll('.ess-report-actions a').length===3`));
await shot('desktop');
check('report and heading share both edges',await ev(`(()=>{const h=document.querySelector('.pc-page-head').getBoundingClientRect(),r=document.querySelector('.ess-report').getBoundingClientRect();return Math.abs(h.left-r.left)<1&&Math.abs(h.right-r.right)<1})()`));
await send('Emulation.setDeviceMetricsOverride',{width:390,height:1600,deviceScaleFactor:1,mobile:false});
check('narrow screen no overflow',await ev(`document.documentElement.scrollWidth<=390`));
check('narrow summary stacked',await ev(`document.querySelector('.ess-interpretation').getBoundingClientRect().top>=document.querySelector('.ess-score-card').getBoundingClientRect().bottom`));await shot('mobile');
fs.writeFileSync('../tests/patient-web/artifacts/ess-report-2026-10-28/results.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
