import {homePosts} from '../src/home.js';
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
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.removeItem('xingkangming.patient.pc.session');sessionStorage.removeItem('xingkangming.patient.pc.session.mode');window.__fixture=${JSON.stringify(fixtures)};window.__calls=[];window.__fail=true;window.__realFetch=fetch;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);const p=u.pathname.slice(7);__calls.push(p);if(p==='/auth/password-login'){await new Promise(r=>setTimeout(r,100));return new Response(JSON.stringify(__fail?{code:400,message:'手机号或密码不正确'}:{code:0,data:{access_token:'isolated-password-fixture'}}),{status:__fail?400:200})}return new Response(JSON.stringify({code:0,data:__fixture[p]??[]}))}`});
for(const server of [base,'http://127.0.0.1:3004']){
await send('Page.navigate',{url:server+'/?wechat=callback&code=old&state=old'});await wait(`location.hash==='#/login'&&!!document.querySelector('[data-form="login"]')`);check(server+' legacy callback safely returns to password login',await ev(`!location.search&&!__calls.some(x=>x.includes('/pc/auth/wechat'))`));check(server+' no QR entry or login tabs',await ev(`!document.querySelector('[data-action="wechat-start"]')&&!document.querySelector('.login-modes')&&!document.querySelector('#wechat-login')&&!!document.querySelector('[name="phone"]')&&!!document.querySelector('[name="password"]')`));await new Promise(r=>setTimeout(r,250));await shot(server.endsWith('3004')?'password-only-production':'password-only-dev');
await ev(`document.querySelector('[name="phone"]').value='13800138000';document.querySelector('[name="password"]').value='fixture-password';document.querySelector('[data-form="login"]').requestSubmit()`);await wait(`document.querySelector('.form-message')?.textContent.includes('手机号或密码不正确')`);check(server+' wrong password stays on login',await ev(`location.hash==='#/login'&&!document.querySelector('[data-form="login"] button[type="submit"]').disabled`));await ev(`__fail=false;const f=document.querySelector('[data-form="login"]');f.requestSubmit();f.requestSubmit()`);await wait(`location.hash==='#/profile'&&!!document.querySelector('.profile-heading')`);check(server+' password login works with duplicate submit guard',await ev(`__calls.filter(x=>x==='/auth/password-login').length===2&&!__calls.some(x=>x.includes('/pc/auth/wechat'))`));
}
await send('Page.navigate',{url:base+'/?localLogin=1#/login'});await wait(`!!document.querySelector('[data-action="local-login"]')`);check('local diagnostic login entry retained',true);console.log(JSON.stringify(checks,null,2));fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/password-only-results.json',JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
