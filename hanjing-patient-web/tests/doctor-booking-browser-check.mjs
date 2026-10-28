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
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/?localLogin=1#/login'});await wait(`!!document.querySelector('[data-action="local-login"]')`);await ev(`document.querySelector('[data-action="local-login"]').click()`);await wait(`location.hash==='#/profile'&&!document.querySelector('.loading-state')`);
 const data=structuredClone(fixtures);data['/settings/booking']={requireDeposit:true,depositAmount:5000,cancelLimit:'就诊前2小时'};data['/user/family-members'].list.push({id:22,name:'测试家人',relation:'parent'});data['/schedules'].push({...data['/schedules'][0],id:32,date:'2099-01-02'});data['/schedules'].push({...data['/schedules'][0],id:33});data['/schedules/33/slots']=[{scheduleId:33,label:'11:00-11:30',status:'available'},{scheduleId:33,label:'09:00-09:30',status:'available'},{scheduleId:33,label:'14:00-14:30',status:'available'}];data['/schedules/32/slots']=[{scheduleId:32,label:'10:00-10:30',status:'available'}];
 await ev(`window.__fixture=${JSON.stringify(data)};window.__realFetch=fetch;window.__posts=[];window.__fail=false;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);const p=u.pathname.slice(7);if(opts.method==='POST'){__posts.push({p,body:JSON.parse(opts.body)});await new Promise(r=>setTimeout(r,120));return new Response(JSON.stringify(__fail?{code:400,message:'时段已被占用'}:{code:0,data:{id:51}}),{status:__fail?400:200})}if(p==='/schedules/31/slots')await new Promise(r=>setTimeout(r,160));return new Response(JSON.stringify({code:0,data:__fixture[p]??[]}))}`);
 await go('doctors',{id:'11',storeId:'9'});check('doctor hero displays identity tags rather than expertise',await ev(`const t=document.querySelector('.clinic-doctor-hero .clinic-tags').textContent;t.includes('主治医师')&&t.includes('睡眠医学')&&!t.includes('睡眠评估')&&document.querySelector('.clinic-doctor-sections').textContent.includes('睡眠评估')`));check('doctor and times on same page',await ev(`!!document.querySelector('.clinic-doctor-detail')&&!!document.querySelector('.doctor-schedule-panel')&&document.querySelector('[data-action="doctor-book"]').disabled`));check('calendar has weekdays and only backend available dates selectable',await ev(`document.querySelectorAll('.doctor-calendar-week>span').length===7&&document.querySelectorAll('.doctor-calendar-days button:not(:disabled)').length===2&&document.querySelector('[data-clinic-date="2099-01-03"]').disabled`));
 await ev(`document.querySelector('[data-clinic-month="1"]').click()`);check('calendar month switch works without reload',await ev(`document.querySelector('.doctor-calendar-heading strong').textContent==='2099年2月'&&!document.querySelector('[data-clinic-date="2099-02-01"]:not(:disabled)')`));await ev(`document.querySelector('[data-clinic-month="-1"]').click()`);await shot('doctor-booking-desktop');
 await ev(`document.querySelector('[data-clinic-schedule="31"]').click();document.querySelector('[data-clinic-schedule="32"]').click()`);await wait(`!!document.querySelector('[data-clinic-time="10:00-10:30"]')`);await new Promise(r=>setTimeout(r,200));check('old schedule response cannot overwrite latest selection',await ev(`!document.querySelector('[data-clinic-time="09:00-09:30"]')&&!!document.querySelector('[data-clinic-time="10:00-10:30"]')`));
 await ev(`document.querySelector('[data-clinic-schedule="31"]').click()`);await wait(`!!document.querySelector('[data-clinic-time="09:00-09:30"]')`);check('same-day multiple schedules expose all periods',await ev(`!!document.querySelector('[data-clinic-time="11:00-11:30"][data-clinic-slot="33"]')`));check('unavailable slot hidden and available duplicates removed',await ev(`!document.querySelector('[data-clinic-time="09:30-10:00"]')&&document.querySelectorAll('[data-clinic-time="09:00-09:30"]').length===1`));check('morning and afternoon are grouped',await ev(`const g=[...document.querySelectorAll('.doctor-time-group')];g.length===2&&g[0].querySelector('h3').textContent==='上午'&&g[1].querySelector('[data-clinic-time="14:00-14:30"]')`));await shot('doctor-time-groups');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:768,deviceScaleFactor:1,mobile:false});
 await ev(`document.querySelector('[data-clinic-time="09:00-09:30"]').click();document.querySelector('[data-action="doctor-book"]').click()`);await wait(`!!document.querySelector('.clinic-confirm-dialog')`);check('confirmation modal preserves detail route',await ev(`location.hash.includes('doctors?id=11')&&document.querySelector('.clinic-confirm-dialog').open&&document.body.style.overflow==='hidden'`));check('desktop 768px confirmation fits without internal scrolling',await ev(`const d=document.querySelector('.clinic-confirm-dialog');d.scrollHeight<=d.clientHeight+1&&d.getBoundingClientRect().height<=innerHeight-32`));
 check('confirmation has no manual visit type',await ev(`!document.querySelector('.clinic-confirm-dialog [name="type"]')&&!document.querySelector('.clinic-confirm-dialog').textContent.includes('就诊类型')`));check('mini confirmation fields show configured fees and notice',await ev(`const t=document.querySelector('.clinic-confirm-dialog').textContent;t.includes('日期')&&t.includes('时段')&&t.includes('定金')&&t.includes('¥50.00')&&t.includes('挂号费')&&t.includes('就诊前2小时')&&document.querySelector('[name="symptomDesc"]').maxLength===500`));await shot('doctor-booking-confirm');
 await ev(`document.querySelector('[data-patient-option="22"]').click()`);check('patient switch stays inside modal',await ev(`!!document.querySelector('.clinic-confirm-dialog')&&document.querySelector('.clinic-confirm-dialog select[name="patientId"]').value==='22'&&!location.hash.includes('patientId=22')`));
 await ev(`document.querySelector('[data-clinic-close]').click()`);check('cancel keeps selected slot and unlocks body',await ev(`!document.querySelector('.clinic-confirm-dialog')&&document.body.style.overflow!=='hidden'&&document.querySelector('[data-clinic-time="09:00-09:30"]').getAttribute('aria-pressed')==='true'`));
 await ev(`document.querySelector('[data-action="doctor-book"]').click()`);await wait(`!!document.querySelector('[data-form="booking"]')`);await ev(`__fail=true;document.querySelector('[name="symptomDesc"]').value='睡眠问题';document.querySelector('[data-form="booking"]').requestSubmit()`);await wait(`document.querySelector('.form-message')?.textContent.includes('时段已被占用')`);check('server rejection retains confirmation input',await ev(`document.querySelector('[name="symptomDesc"]').value==='睡眠问题'&&!document.querySelector('[data-form="booking"] button[type="submit"]').disabled`));
 await ev(`__fail=false;document.querySelector('[data-patient-option="22"]').click();const f=document.querySelector('[data-form="booking"]');f.requestSubmit();f.requestSubmit()`);await wait(`location.hash.includes('appointment?id=51')&&!document.querySelector('.loading-state')`);check('single successful submit and correct scoped payload',await ev(`const x=__posts.at(-1);__posts.length===2&&x.body.type==='first'&&x.body.patientId==='22'&&x.body.doctorId==='11'&&x.body.storeId==='9'&&x.body.scheduleId===31&&x.body.appointmentDate==='2099-01-01'&&x.body.appointmentTime==='09:00-09:30'&&x.body.symptomDesc==='睡眠问题'&&!document.querySelector('.clinic-confirm-dialog')`));
 await go('booking',{storeId:'9',doctorId:'11'});await wait(`!!document.querySelector('.doctor-schedule-panel')`);check('legacy booking entry opens integrated detail',await ev(`location.hash==='#/doctors?id=11&storeId=9'`));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await shot('doctor-booking-390');await ev(`document.querySelector('.doctor-calendar').scrollIntoView({block:'center'})`);await shot('doctor-calendar-390');check('mobile detail has no horizontal overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));
 await ev(`document.querySelector('[data-clinic-schedule="31"]').click()`);await wait(`!!document.querySelector('[data-clinic-time="09:00-09:30"]')`);await ev(`document.querySelector('[data-clinic-time="09:00-09:30"]').click();document.querySelector('[data-action="doctor-book"]').click()`);await wait(`!!document.querySelector('.clinic-confirm-dialog')`);await shot('doctor-booking-confirm-390');check('mobile confirmation fits viewport',await ev(`const r=document.querySelector('.clinic-confirm-dialog').getBoundingClientRect();r.width<=innerWidth&&r.height<=innerHeight`));
 await go('home');check('navigation closes confirmation and restores scroll',await ev(`!document.querySelector('.clinic-confirm-dialog')&&document.body.style.overflow!=='hidden'`));
 await ev(`__fixture['/schedules']=[]`);await go('doctors',{id:'11',storeId:'9'});check('no schedule clearly disables confirmation',await ev(`document.querySelector('.doctor-schedule-panel').textContent.includes('暂无可预约排班')&&document.querySelector('[data-action="doctor-book"]').disabled`));
 console.log(JSON.stringify(checks,null,2));fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/doctor-booking-results.json',JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
} finally {await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
