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
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
const data=structuredClone(fixtures);data['/user/profile'].nickname='微信用户-完整昵称';data['/user/family-members/21'].name='就诊人完整姓名';data['/user/family-members/21'].relation='parent';data['/doctors'][0].avatar='/broken-doctor-avatar.png';
await send('Page.addScriptToEvaluateOnNewDocument',{source:`sessionStorage.setItem('xingkangming.patient.pc.session','isolated-avatar-fixture');window.__fixture=${JSON.stringify(data)};window.__realFetch=fetch;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);return new Response(JSON.stringify({code:0,data:__fixture[u.pathname.slice(7)]??[]}))}`});
for(const server of [base,'http://127.0.0.1:3004']){
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:server+'/#/home'});await wait(`!!document.querySelector('#home-posts .hc-stories')`);
check(server+' project favicon links and PNG asset',await ev(`(async()=>{const icon=document.querySelector('link[rel="icon"][type="image/png"]');const r=await fetch(icon.href);const data=new Uint8Array(await r.arrayBuffer());return icon.href.includes('/favicon.png?v=20261029-brand2')&&r.status===200&&data[0]===137&&data[1]===80&&!!document.querySelector('link[rel="icon"][type="image/svg+xml"]')})()`));
for(const page of ['profile','editProfile','family','member'])for(const mode of ['broken','missing','valid']){
 const avatar=mode==='broken'?'/missing-member-avatar.png':mode==='valid'?'/brand/logo.svg':'';
 await ev(`__fixture['/user/profile'].avatar=${JSON.stringify(avatar)};__fixture['/user/family-members/21'].avatar=${JSON.stringify(avatar)};__fixture['/user/family-members'].list.forEach(m=>m.avatar=${JSON.stringify(avatar)})`);
 console.log(server,page,mode);await go(page,{...(page==='member'?{id:'21'}:{}),avatarCase:mode});await wait(`!!document.querySelector('.profile-heading .avatar')`);await ev(`document.querySelector('.profile-heading').scrollIntoView({block:'center'})`);
 if(mode==='valid')await wait(`document.querySelector('img.avatar')?.complete`);else await wait(`!!document.querySelector('.profile-heading .image-fallback.avatar')`);
 check(server+' '+page+' '+mode,await ev(`const x=document.querySelector('.profile-heading .avatar'),r=x.getBoundingClientRect();r.width===r.height&&r.height>=60&&r.height<=80&&(${JSON.stringify(mode)}==='valid'?x.naturalWidth>0:Array.from(x.textContent).length===1&&getComputedStyle(x).whiteSpace==='nowrap')`));
 if(mode==='broken')await shot('avatar-'+page+(server.endsWith('3004')?'-production':'-dev'));
}
await go('doctors',{id:'11',storeId:'9'});await wait(`!!document.querySelector('.clinic-doctor-avatar')`);await wait(`!document.querySelector('.clinic-doctor-photo')`);check(server+' doctor failed photo reveals logo',await ev(`const img=document.querySelector('.clinic-doctor-avatar img');img.complete&&img.naturalWidth>0&&img.src.includes('/brand/logo.svg')`));
}
console.log(JSON.stringify(checks,null,2));fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/avatar-favicon-results.json',JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
