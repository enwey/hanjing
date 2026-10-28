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
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/#/agreement'});await wait(`!!document.querySelector('.pc-legal')`);
 for(const route of ['agreement','privacy']){
  await go(route);check(route+' has operator address and version date',await ev(`const t=document.querySelector('.pc-legal').textContent;t.includes('深圳兴康明诊所')&&t.includes('下李朗社区下李南路73号')&&t.includes('版本日期：2026年10月28日')&&!t.includes('尚未正式生效')&&!t.includes('业务核对稿')`));
  check(route+' has fourteen sections and important notice',await ev(`document.querySelectorAll('.pc-legal h2').length===15&&!!document.querySelector('.legal-important')`));
  check(route+' has contact without phone or email fields',await ev(`const t=document.querySelector('.pc-legal').textContent;t.includes('在线客服')&&!t.includes('邮箱：')&&!t.includes('电话：')`));
  check(route+' heading body and notices share content edges',await ev(`const head=document.querySelector('.pc-page-head').getBoundingClientRect(),body=document.querySelector('.pc-legal').getBoundingClientRect(),p=document.querySelector('.pc-legal p:not(.legal-meta):not(.legal-important)').getBoundingClientRect(),notice=document.querySelector('.legal-important').getBoundingClientRect();Math.abs(head.left-body.left)<1&&Math.abs(body.left-p.left)<1&&Math.abs(p.right-body.right)<1&&Math.abs(notice.right-body.right)<1`));
  await shot('legal-'+route+'-1440');await ev(`scrollTo(0,document.body.scrollHeight)`);check(route+' renders final contact section',await ev(`document.querySelector('.pc-legal').lastElementChild.textContent.includes('A1313')`));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await ev(`scrollTo(0,0)`);await shot('legal-privacy-390');check('narrow legal text has no horizontal overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));
 console.log(JSON.stringify(checks,null,2));fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/legal-browser-results.json',JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
} finally {await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
