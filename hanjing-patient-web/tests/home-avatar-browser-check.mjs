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
for(const server of [base,'http://127.0.0.1:3004']){
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:server+'/#/home'});await wait(`!!document.querySelector('#home-posts .hc-stories')`);
 const rows=[{id:71,author:'微信用户-张华',roleLabel:'鼾友',title:'配戴阻鼾器四周体验',summary:'分享治疗体验',createdAt:'2026-08-12',avatar:'/missing-avatar-for-test.jpg'},{id:72,author:'测试昵称',roleLabel:'鼾友',title:'暂无头像',summary:'无图占位测试',createdAt:'2026-08-12',avatar:''}];
 await ev(`document.querySelector('#home-posts').innerHTML=${JSON.stringify(homePosts(rows))}`);await ev(`document.querySelector('#home-posts').scrollIntoView({block:'center'})`);await wait(`document.querySelectorAll('.hc-author-avatar.image-fallback').length===2`);
 check(server+' missing and failed avatar same size and one character',await ev(`const nodes=[...document.querySelectorAll('.hc-author-avatar')];nodes.every(x=>{const r=x.getBoundingClientRect(),s=getComputedStyle(x);return r.width===44&&r.height===44&&s.fontSize==='18px'&&Array.from(x.textContent).length===1})&&nodes[0].textContent==='微'&&document.querySelector('.hc-post-author small').textContent.includes('微信用户-张华')`));
 await ev(`document.querySelector('#home-posts').scrollIntoView({block:'center'})`);await shot(server.endsWith('3004')?'home-avatar-production-1440':'home-avatar-dev-1440');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});check(server+' narrow failed avatar does not expand',await ev(`const r=document.querySelector('.hc-author-avatar').getBoundingClientRect();r.height===44&&r.width===44&&document.documentElement.scrollWidth<=innerWidth+1`));await ev(`document.querySelector('#home-posts').scrollIntoView({block:'center'})`);await shot(server.endsWith('3004')?'home-avatar-production-390':'home-avatar-dev-390');
 await ev(`document.querySelector('#home-posts').innerHTML=${JSON.stringify(homePosts([{...rows[0],avatar:'/brand/logo.svg'}]))}`);await wait(`document.querySelector('img.hc-author-avatar')?.complete`);check(server+' valid avatar still renders image',await ev(`const x=document.querySelector('img.hc-author-avatar');x.naturalWidth>0&&x.getBoundingClientRect().height===44`));
}
console.log(JSON.stringify(checks,null,2));fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/home-avatar-results.json',JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
