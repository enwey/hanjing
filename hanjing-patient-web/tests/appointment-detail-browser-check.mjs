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
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/#/login'});await wait(`!!document.querySelector('[data-action="local-login"]')`);await ev(`document.querySelector('[data-action="local-login"]').click()`);await wait(`location.hash==='#/profile'&&!document.querySelector('.loading-state')`);
 const data=structuredClone(fixtures);Object.assign(data['/appointments/51'].appointment,{status:'pending',symptomDesc:'睡眠打鼾，白天嗜睡',consultFee:10000,requireDeposit:true,depositAmount:5000});delete data['/appointments/51'].medicalRecord;
 await ev(`window.__fixture=${JSON.stringify(data)};window.__realFetch=fetch;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);return new Response(JSON.stringify({code:0,data:__fixture[u.pathname.slice(7)]??[]}))}`);
 await go('appointment',{id:'51'});await wait(`!!document.querySelector('.appointment-status-hero')`);
 check('status and doctor',await ev(`document.querySelector('.appointment-status-hero h2').textContent==='已预约'&&document.querySelector('.appointment-doctor').textContent.includes('测试医生')`));
 check('change and cancel buttons',await ev(`!!document.querySelector('.appointment-detail-actions a[href*="booking"]')&&!!document.querySelector('[data-action="cancel-appointment"]')`));
 check('conditional fees and symptoms',await ev(`const t=document.querySelector('.appointment-detail-page').textContent;t.includes('¥50.00')&&t.includes('¥100.00')&&t.includes('睡眠打鼾')&&!t.includes('取消原因')`));
 check('desktop two columns',await ev(`getComputedStyle(document.querySelector('.appointment-detail-layout')).gridTemplateColumns.split(' ').length===2&&document.documentElement.scrollWidth<=innerWidth`));await shot('appointment-detail-desktop');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await shot('appointment-detail-390');check('mobile no overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));
 await ev(`__fixture['/appointments/51'].appointment.status='completed';__fixture['/appointments/51'].evaluation={rating:5,content:'医生耐心'};__fixture['/appointments/51'].preExam={height:170,bmi:22.5};__fixture['/appointments/51'].assessments={ess:{score:0,riskLevel:'低风险'}}`);await go('home');await go('appointment',{id:'51'});check('completed clinical data and readonly evaluation',await ev(`const t=document.querySelector('.appointment-detail-page').textContent;t.includes('医生耐心')&&t.includes('签到预检信息')&&t.includes('0分')&&!document.querySelector('[data-form="evaluation"]')&&!document.querySelector('[data-action="cancel-appointment"]')`));
 await ev(`__fixture['/appointments/51'].appointment.status='pending';__fixture['/appointments/51'].appointment.appointmentDate='2020-01-01'`);await go('home');await go('appointment',{id:'51'});check('cutoff hides unavailable operations',await ev(`!!document.querySelector('.appointment-limit-notice')&&!document.querySelector('.appointment-detail-actions')`));
 await ev(`__fixture['/appointments/51'].appointment.status='pending_payment'`);await go('home');await go('appointment',{id:'51'});check('pending payment contact notice',await ev(`!!document.querySelector('.appointment-pay-notice')&&!!document.querySelector('[data-action="cancel-appointment"]')`));
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await ev(`Object.assign(__fixture['/appointments/51'].appointment,{status:'pending',appointmentDate:'2099-01-01'});window.__posts=[];window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);const p=u.pathname.slice(7);if(opts.method==='POST'){const body=JSON.parse(opts.body);__posts.push({p,body});if(p.endsWith('/cancel'))Object.assign(__fixture['/appointments/51'].appointment,{status:'cancelled',cancelReason:body.reason});if(p.endsWith('/reschedule'))Object.assign(__fixture['/appointments/51'].appointment,{appointmentDate:body.appointmentDate,appointmentTime:body.appointmentTime});await new Promise(r=>setTimeout(r,100));return new Response(JSON.stringify({code:0,data:{id:51}}))}return new Response(JSON.stringify({code:0,data:__fixture[p]??[]}))}`);
 await go('home');await go('appointment',{id:'51'});await ev(`document.querySelector('.appointment-detail-actions a[href*="booking"]').click()`);await wait(`!!document.querySelector('[data-schedule-select]')`);await ev(`const s=document.querySelector('[data-schedule-select]');s.value='31';s.dispatchEvent(new Event('change',{bubbles:true}))`);await wait(`!!document.querySelector('[name="appointmentTime"]')`);await ev(`document.querySelector('[name="appointmentTime"]:not(:disabled)').checked=true`);await shot('appointment-reschedule-desktop');await ev(`const f=document.querySelector('[data-form="booking"]');f.requestSubmit();f.requestSubmit()`);await wait(`location.hash.includes('appointment?id=51')&&!!document.querySelector('.appointment-status-hero')`);check('reschedule submits once to original appointment and returns detail',await ev(`__posts.length===1&&__posts[0].p==='/appointments/51/reschedule'&&__posts[0].body.scheduleId===31&&__posts[0].body.appointmentTime==='09:00-09:30'`));
 await ev(`document.querySelector('[data-action="cancel-appointment"]').click()`);await wait(`!!document.querySelector('dialog[open]')`);check('cancel uses mini confirmation without mandatory reason',await ev(`!document.querySelector('dialog textarea')&&document.querySelector('dialog').textContent.includes('确定要取消这次预约吗')`));await shot('appointment-cancel-confirm');await ev(`document.querySelector('dialog button[value="cancel"]').click()`);await wait(`!document.querySelector('dialog')&&!document.querySelector('[data-action=\"cancel-appointment\"]')?.disabled`);check('dismiss sends no cancellation',await ev(`__posts.length===1`));await ev(`document.querySelector('[data-action="cancel-appointment"]').click()`);await wait(`!!document.querySelector('dialog[open]')`);await ev(`document.querySelector('dialog button[value="ok"]').click()`);await wait(`!!document.querySelector('.status-cancelled')`);check('confirmed cancellation calls API and refreshes detail',await ev(`__posts.length===2&&__posts[1].p==='/appointments/51/cancel'&&__posts[1].body.reason==='用户主动取消'&&!document.querySelector('[data-action="cancel-appointment"]')&&document.querySelector('.appointment-detail-page').textContent.includes('用户主动取消')`));
 console.log(JSON.stringify(checks,null,2));fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/appointment-detail-results.json',JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
