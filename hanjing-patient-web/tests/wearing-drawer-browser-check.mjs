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
    '../tests/patient-web/artifacts/wearing-drawer-2026-10-28/' + name + '.png',
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

fs.mkdirSync('../tests/patient-web/artifacts/wearing-drawer-2026-10-28',{recursive:true});
try {
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/?localLogin=1#/login'});await wait(`!!document.querySelector('[data-action="local-login"]')`);await ev(`document.querySelector('[data-action="local-login"]').click()`);await wait(`location.hash==='#/profile' && !document.querySelector('.loading-state')`);check('real local PC login',true);
 await ev(`location.hash='#/treatment'`);await wait(`!!document.querySelector('.treatment-hero')`);check('real empty treatment keeps six features',await ev(`document.querySelectorAll('.treatment-entries>a').length===6`));check('real calendar and metrics',await ev(`document.querySelectorAll('.treatment-calendar [data-date]').length>=28 && document.querySelectorAll('.treatment-metrics article').length===4`));await shot('empty-real-1440');

 await ev(`document.querySelector('a[href*="wearing"]').click()`);await wait(`!!document.querySelector('[data-checkin-form]')`);
 check('opens on treatment without route change',await ev(`location.hash==='#/treatment'&&document.querySelector('dialog').open`));
 check('mini defaults seven hours and pain two',await ev(`const f=document.querySelector('[data-checkin-form]');f.elements.wearDuration.value==='7'&&f.elements.painScore.value==='2'`));
 check('body locked while drawer open',await ev(`document.body.style.overflow==='hidden'`));check('small left corners and square right corners',await ev(`const s=getComputedStyle(document.querySelector('dialog'));s.borderTopLeftRadius==='12px'&&s.borderTopRightRadius==='0px'&&s.borderBottomRightRadius==='0px'`));
 check('no custom duration input',await ev(`!document.querySelector('.checkin-duration-custom')&&document.querySelector('[name="wearDuration"]').type==='hidden'`));
 check('submit text centered on both axes',await ev(`const s=getComputedStyle(document.querySelector('.checkin-submit'));s.display==='flex'||s.display==='inline-flex'?s.alignItems==='center'&&s.justifyContent==='center'&&s.paddingTop===s.paddingBottom:false`));
 check('submit uses project theme',await ev(`getComputedStyle(document.querySelector('.checkin-submit')).backgroundColor===getComputedStyle(document.body).getPropertyValue('--pine').trim().replace('#3b6bf5','rgb(59, 107, 245)')`));
 const pos=await ev(`const r=document.querySelector('[name="painScore"]').getBoundingClientRect();({x:r.x+r.width*.5,y:r.y+r.height/2})`);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x,y:pos.y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x:pos.x,y:pos.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pos.x+50,y:pos.y,button:'left',buttons:1});
 check('slider drag does not apply white input focus background',await ev(`getComputedStyle(document.querySelector('[name="painScore"]')).backgroundColor==='rgba(0, 0, 0, 0)'&&Number(document.querySelector('[name="painScore"]').value)>2`));await shot('drawer-drag');await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pos.x+50,y:pos.y,button:'left',clickCount:1});
 await shot('drawer-desktop');
 await ev(`document.querySelector('[name="quickDuration"][value="8"]').click();const x=document.querySelector('[name="painScore"]');x.value='7';x.dispatchEvent(new Event('input',{bubbles:true}))`);
 check('selected duration unit matches selected text',await ev(`const x=document.querySelector('[name="quickDuration"]:checked+span');getComputedStyle(x.querySelector('small')).color===getComputedStyle(x).color&&getComputedStyle(x).color==='rgb(255, 255, 255)'`));
 check('duration chips and VAS badge update',await ev(`document.querySelector('[name="wearDuration"]').value==='8'&&document.querySelector('[data-pain-badge]').textContent==='重度疼痛'`));
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait(`!document.querySelector('dialog')`);
 check('Escape closes and unlocks scroll',await ev(`document.body.style.overflow!== 'hidden'`));
 await ev(`window.__realFetch=fetch;window.__saves=[];window.__fail=true;window.fetch=async(input,opts={})=>{if(String(input).includes('/treatment/wearing')&&opts.method==='POST'){__saves.push(JSON.parse(opts.body));return new Response(JSON.stringify(__fail?{code:500,message:'测试保存失败'}:{code:0,data:{}}),{status:__fail?500:200,headers:{'content-type':'application/json'}})}return __realFetch(input,opts)}`);
 await ev(`document.querySelector('a[href*="wearing"]').click()`);await wait(`!!document.querySelector('[data-checkin-form]')`);
 await ev(`const f=document.querySelector('[data-checkin-form]');f.elements.note.value='保留备注';f.elements.painScore.value='0';f.querySelector('[name="painLocations"]').checked=true;f.requestSubmit()`);await wait(`!!document.querySelector('.checkin-message')?.textContent`);
 check('failed save keeps form inputs',await ev(`document.querySelector('[name="note"]').value==='保留备注'&&!document.querySelector('.checkin-submit').disabled`));
 await ev(`__fail=false;document.querySelector('[data-checkin-form]').requestSubmit()`);await wait(`!document.querySelector('dialog')&&!document.querySelector('.loading-state')`);
 check('successful save closes and stays on treatment',await ev(`location.hash==='#/treatment'&&__saves.at(-1).painScore===0&&__saves.at(-1).comfort===5&&__saves.at(-1).painLocations.length===1`));
 await go('wearing');await wait(`!!document.querySelector('[data-checkin-form]')`);check('legacy route redirects to treatment drawer',await ev(`location.hash.startsWith('#/treatment')`));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await shot('drawer-mobile');
 check('narrow drawer fits viewport',await ev(`const r=document.querySelector('dialog').getBoundingClientRect();r.width<=innerWidth&&r.left>=0`));
 check('footer stays visible and body scrolls',await ev(`const r=document.querySelector('.checkin-footer').getBoundingClientRect(),b=document.querySelector('.checkin-body');r.bottom<=innerHeight+1&&b.scrollHeight>b.clientHeight`));
 await ev(`document.querySelector('.checkin-cancel').click()`);check('cancel removes drawer',await ev(`!document.querySelector('dialog')`));
 fs.writeFileSync('../tests/patient-web/artifacts/wearing-drawer-2026-10-28/browser-results.json',JSON.stringify(checks,null,2));console.log(JSON.stringify({total:checks.length,passed:checks.filter(c=>c.ok).length,checks},null,2));if(checks.some(c=>!c.ok))process.exitCode=1;
} finally {await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
