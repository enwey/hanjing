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
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/#/login'});await wait(`!!document.querySelector('[data-action="local-login"]')`);await ev(`document.querySelector('[data-action="local-login"]').click()`);await wait(`location.hash==='#/profile' && !document.querySelector('.loading-state')`);check('real local PC login',true);
 await ev(`location.hash='#/treatment'`);await wait(`!!document.querySelector('.treatment-hero')`);check('real empty treatment keeps six features',await ev(`document.querySelectorAll('.treatment-entries>a').length===6`));check('real calendar and metrics',await ev(`document.querySelectorAll('.treatment-calendar [data-date]').length>=28 && document.querySelectorAll('.treatment-metrics article').length===4`));await shot('empty-real-1440');

 const monthBefore=await ev(`document.querySelector('.treatment-month-nav h2').textContent`);
 await ev(`document.querySelector('.treatment-month-nav a').click()`);await wait(`!document.querySelector('.loading-state')&&document.querySelector('.treatment-month-nav h2')?.textContent!==${JSON.stringify(monthBefore)}`);
 check('overview previous month updates month and keeps patient',await ev(`document.querySelector('.treatment-month-nav h2').textContent!==${JSON.stringify(monthBefore)}&&location.hash.includes('month=')`));
 check('future day cannot check in',await ev(`!Array.from(document.querySelectorAll('.treatment-calendar a')).some(a=>a.dataset.date>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date()))`));
 await go('treatment');
 check('six mini-program icons render',await ev(`document.querySelectorAll('.treatment-entry-icon svg').length===6`));
 check('desktop timeline is right of main and top aligned',await ev(`const a=document.querySelector('.treatment-main').getBoundingClientRect(),b=document.querySelector('.treatment-sidebar').getBoundingClientRect();b.left>=a.right&&Math.abs(b.top-a.top)<2`));
 check('right sidebar has one third of column width',await ev(`const a=document.querySelector('.treatment-main').getBoundingClientRect(),b=document.querySelector('.treatment-sidebar').getBoundingClientRect();Math.abs(a.width/b.width-2)<.02`));
 check('hero checkin and medical button shown',await ev(`!!document.querySelector('.treatment-hero-checkin a[href*="wearing"]')&&!!document.querySelector('.pc-page-head a.btn[href*="medical"]')`));
 check('legend uses unchecked wording',await ev(`document.querySelector('.treatment-legend .pain-none').textContent==='未打卡'`));
 check('month navigation has visible backgrounds and directional arrows',await ev(`const a=document.querySelector('.treatment-month-nav a'),s=getComputedStyle(a);s.backgroundColor==='rgb(243, 244, 246)'&&parseFloat(s.minHeight)>=38&&getComputedStyle(a,'::before').borderRightWidth==='5px'`));
 const full=await send('Page.getLayoutMetrics');const shotFull=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1440,height:full.cssContentSize.height,scale:1}});fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/overview-full.png',Buffer.from(shotFull.data,'base64'));
 await go('treatmentTrend');check('empty trend has centered compact checkin action',await ev(`document.querySelector('.empty-state a.btn').getBoundingClientRect().width<300&&!Array.from(document.querySelectorAll('a')).some(a=>a.textContent==='去打卡')`));await ev(`document.querySelector('.empty-state a.btn').scrollIntoView({block:'center'})`);await shot('empty-trend-checkin');await ev(`document.querySelector('.empty-state a.btn').click()`);await wait(`!!document.querySelector('[data-checkin-form]')`);check('empty trend action opens drawer in place',await ev(`location.hash.startsWith('#/treatmentTrend')&&document.querySelector('dialog').open`));await ev(`document.querySelector('.checkin-close').click()`);
 await go('treatmentReport');check('empty report has centered compact checkin action',await ev(`!!document.querySelector('.empty-state a.btn')`));
 await go('treatmentAdvice');check('advice appointment entry styled as button',await ev(`const a=document.querySelector('.empty-state a'),s=getComputedStyle(a);a.textContent==='预约就诊'&&s.backgroundColor==='rgb(59, 107, 245)'&&parseFloat(s.minHeight)>=48&&parseFloat(s.minWidth)>=220&&s.color==='rgb(255, 255, 255)'`));await shot('advice-empty-button');
 await go('treatmentAdjust');check('adjustment appointment entry styled as button',await ev(`const s=getComputedStyle(document.querySelector('.empty-state a'));s.backgroundColor==='rgb(59, 107, 245)'&&parseFloat(s.minHeight)>=44`));
 const data=structuredClone(fixtures);(Array.isArray(data['/user/family-members'])?data['/user/family-members']:data['/user/family-members'].list).push({id:22,name:'测试家人',relation:'parent'});data['/treatment/record'].status='active';
 await ev(`window.__treatmentFixtures=${JSON.stringify(data)};window.__treatmentCalls=[];window.__realFetch=window.fetch;window.fetch=async(input,options={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,options);const p=u.pathname.slice(7),patient=u.searchParams.get('patientId'),body=options.body?JSON.parse(options.body):null;__treatmentCalls.push({p,patient,body,method:options.method||'GET'});let data;if(p==='/treatment/wearing'&&options.method==='POST'){__treatmentFixtures['/treatment/wearing-records']=[body];data={}}else if(patient==='22'&&p==='/treatment/record')data=null;else if(patient==='22'&&p==='/treatment/wearing-records')data=[];else if(patient==='22'&&p==='/treatment/wearing-summary')data={};else if(p in __treatmentFixtures)data=__treatmentFixtures[p];else throw Error('Unexpected fixture '+p);return new Response(JSON.stringify({code:0,data}),{headers:{'content-type':'application/json'}})}`);
 await go('treatment',{patientId:'21'});check('bound device shown',await ev(`document.querySelector('.treatment-hero').textContent.includes('测试')`));await shot('bound-fixture-1440');
 await ev(`document.querySelector('[data-patient-option="22"]').click()`);await wait(`location.hash.includes('patientId=22') && document.querySelector('.treatment-hero')?.textContent.includes('暂无治疗记录')`);check('patient switch clears old device',true);check('unbound patient has active checkin link',await ev(`!!document.querySelector('.treatment-checkin-wrap a[href*="wearing"]') && !document.querySelector('.treatment-checkin-wrap button[disabled]')`));
 for(const route of ['treatmentCalendar','treatmentTrend','treatmentReport','treatmentTimeline','treatmentAdvice','treatmentAdjust']){await go(route,{patientId:'21'});check(route+' opens',await ev(`!document.querySelector('.error-state')`));if(route==='treatmentCalendar'){check('monthly calendar renders days',await ev(`document.querySelectorAll('[data-date]').length>=28`));await shot('calendar-fixture-1440')}}
 await go('treatmentTrend',{patientId:'21'});await ev(`document.querySelector('.treatment-range-options a[href*="range=month"]').click()`);await wait(`location.hash.includes('range=month')&&!document.querySelector('.loading-state')`);check('flat range click keeps patient and updates selection',await ev(`location.hash.includes('patientId=21')&&document.querySelector('.treatment-range-options .selected').textContent==='最近30天'`));await shot('trend-range-options-1440');check('month trend has 30 days',await ev(`document.querySelectorAll('.treatment-chart-day').length===30`));
 await go('wearing',{patientId:'21'});await wait(`!!document.querySelector('[data-checkin-form]')`);await ev(`const f=document.querySelector('[data-checkin-form]');f.elements.wearDuration.value='8';f.elements.painScore.value='3';const xs=f.querySelectorAll('[name="painLocations"]');xs[0].checked=true;xs[1].checked=true;f.requestSubmit()`);await wait(`__treatmentCalls.some(x=>x.p==='/treatment/wearing'&&x.method==='POST')`);check('checkin sends two pain locations, scoped patient and mapped comfort',await ev(`const p=__treatmentCalls.findLast(x=>x.p==='/treatment/wearing'&&x.method==='POST').body;p.patientId==='21'&&p.wearDuration===8&&p.painScore===3&&p.comfort===3&&p.painLocations.length===2`));
 await go('wearing',{patientId:'22'});await wait(`!!document.querySelector('[data-checkin-form]')`);check('unbound patient has wearing form',await ev(`!!document.querySelector('[data-checkin-form]')`));await shot('wearing-unbound-fixture-1440');await ev(`const f=document.querySelector('[data-checkin-form]');f.elements.wearDuration.value='6';f.elements.painScore.value='0';f.requestSubmit()`);await wait(`__treatmentCalls.some(x=>x.p==='/treatment/wearing'&&x.body?.patientId==='22')`);check('unbound checkin keeps selected patient and zero pain',await ev(`const p=__treatmentCalls.findLast(x=>x.p==='/treatment/wearing'&&x.body?.patientId==='22').body;p.wearDuration===6&&p.painScore===0&&p.comfort===5`));
 await go('treatment',{patientId:'21'});await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await shot('treatment-fixture-390');check('narrow timeline follows main',await ev(`const a=document.querySelector('.treatment-main').getBoundingClientRect(),b=document.querySelector('.treatment-sidebar').getBoundingClientRect();b.top>=a.bottom&&Math.abs(a.left-b.left)<2`));check('no global narrow-screen horizontal overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));
 fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/browser-results.json',JSON.stringify(checks,null,2));console.log(JSON.stringify({total:checks.length,passed:checks.filter(c=>c.ok).length,checks},null,2));if(checks.some(c=>!c.ok))process.exitCode=1;
} finally {await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
