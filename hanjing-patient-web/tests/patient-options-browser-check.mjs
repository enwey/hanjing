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
 const data=structuredClone(fixtures);data['/user/family-members'].list.push({id:22,name:'测试家人',relation:'parent'});
 await ev(`window.__fixture=${JSON.stringify(data)};window.__realFetch=fetch;window.__calls=[];window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);__calls.push(u.pathname+u.search);return new Response(JSON.stringify({code:0,data:__fixture[u.pathname.slice(7)]??[]}))}`);
 for(const route of ['medical','assessments','devices','treatment','treatmentCalendar','treatmentTrend','treatmentReport','treatmentTimeline','treatmentAdvice','treatmentAdjust','booking','questionnaire','recording']){
  await go(route,{...(routeParams[route]||{}),patientId:'21'});
  if(route==='booking'){await ev(`document.querySelector('[data-clinic-schedule]').click()`);await wait(`!!document.querySelector('[data-clinic-time]:not([disabled])')`);await ev(`document.querySelector('[data-clinic-time]:not([disabled])').click();document.querySelector('[data-action="doctor-book"]').click()`);await wait(`!!document.querySelector('.clinic-confirm-dialog')`);}
  check(route+' uses flat options with right management link',await ev(`const b=document.querySelector('.patient-options-bar'),s=b?.querySelector('select'),r=b?.querySelector('a');!!b&&!!s&&s.hidden&&b.querySelectorAll('[data-patient-option]').length===2&&r.textContent==='管理就诊人'&&r.getBoundingClientRect().right>b.querySelector('.patient-options').getBoundingClientRect().left`));
 }
 await go('medical',{patientId:'21'});await ev(`document.querySelector('[data-patient-option="22"]').click()`);await wait(`location.hash.includes('patientId=22')&&document.querySelector('[data-patient-option="22"]')?.getAttribute('aria-pressed')==='true'`);check('medical switch scopes data to selected patient',await ev(`__calls.some(x=>x.includes('/user/medical-records?patientId=22'))`));await shot('medical-flat-patient-options');
 await go('questionnaire');await ev(`document.querySelector('.question input').checked=true;document.querySelector('[data-patient-option="22"]').click()`);check('questionnaire selection updates form and resets answers',await ev(`document.querySelector('select[name="patientId"]').value==='22'&&!document.querySelector('.question input').checked&&!location.hash.includes('patientId=22')`));
 await go('booking',routeParams.booking);await ev(`document.querySelector('[data-clinic-schedule]').click()`);await wait(`!!document.querySelector('[data-clinic-time]:not([disabled])')`);await ev(`document.querySelector('[data-clinic-time]:not([disabled])').click();document.querySelector('[data-action="doctor-book"]').click()`);await wait(`!!document.querySelector('.clinic-confirm-dialog')`);await ev(`document.querySelector('[data-patient-option="22"]').click()`);check('booking uses new patient without replacing form',await ev(`new FormData(document.querySelector('[data-form="booking"]')).get('patientId')==='22'`));
 await go('recording');await ev(`document.querySelector('select[name="patientId"]').disabled=true;document.querySelector('[data-patient-option="22"]').click()`);check('recording disabled patient choice cannot switch',await ev(`document.querySelector('select[name="patientId"]').value==='21'`));
 await go('medical',{patientId:'21'});await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await shot('medical-flat-patient-options-390');check('narrow patient choices fit without overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));
 console.log(JSON.stringify(checks,null,2));fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/patient-options-results.json',JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
} finally {await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
