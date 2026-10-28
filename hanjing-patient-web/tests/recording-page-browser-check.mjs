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
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/#/login'});await wait(`!!document.querySelector('[data-action="local-login"]')`);await ev(`document.querySelector('[data-action="local-login"]').click()`);await wait(`location.hash==='#/profile'&&!document.querySelector('.loading-state')`);
const data=structuredClone(fixtures);await ev(`window.__fixture=${JSON.stringify(data)};window.__realFetch=fetch;window.__posts=[];window.__failReport=true;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);const p=u.pathname.slice(7);if(opts.method==='POST'){__posts.push({p,body:JSON.parse(opts.body)});if(__failReport){__failReport=false;return new Response(JSON.stringify({code:503,message:'报告服务暂不可用'}),{status:503})}return new Response(JSON.stringify({code:0,data:{id:'snore-1',patientId:21}}))}return new Response(JSON.stringify({code:0,data:__fixture[p]??[]}))}`);
await go('recording');await wait(`!!document.querySelector('.snore-studio')`);await new Promise(r=>setTimeout(r,350));await shot('snore-recording-ready');check('light studio has guide and real idle levels',await ev(`getComputedStyle(document.querySelector('.snore-studio')).backgroundColor==='rgb(255, 255, 255)'&&document.querySelector('#record-level').textContent==='—'&&document.querySelector('#record-peak').textContent==='—'&&document.querySelector('[data-action="record-stop"]').disabled`));
await ev(`navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError')};document.querySelector('[data-action="record-start"]').click()`);await wait(`document.querySelector('#record-status').textContent.includes('授权被拒绝')`);check('permission error allows retry and unlocks patient',await ev(`!document.querySelector('[name="patientId"]').disabled&&!document.querySelector('[data-action="record-start"]').hidden`));
await ev(`navigator.mediaDevices.getUserMedia=async()=>{window.__audio=new AudioContext();const oscillator=__audio.createOscillator(),gain=__audio.createGain(),output=__audio.createMediaStreamDestination();gain.gain.value=0.04;oscillator.frequency.value=160;oscillator.connect(gain);gain.connect(output);oscillator.start();await __audio.resume();return output.stream;};document.querySelector('[data-action="record-start"]').click()`);await wait(`document.querySelector('#record-time').textContent==='00:02'`,10000);check('real PCM updates wave and peak, patient locked',await ev(`Number(document.querySelector('#record-level').textContent)>=30&&Number(document.querySelector('#record-peak').textContent)<=95&&document.querySelector('[name="patientId"]').disabled&&[...document.querySelectorAll('.snore-wave i')].some(x=>parseFloat(x.style.getPropertyValue('--level'))>5)`));await shot('snore-recording-live');
await ev(`document.querySelector('[data-action="record-pause"]').click()`);await wait(`document.querySelector('.snore-studio').dataset.recordPhase==='paused'`);check('mini live dB and sixteen-bar waveform',await ev(`Number.isInteger(Number(document.querySelector('#record-level').textContent))&&Math.abs(Number(document.querySelector('#record-level').textContent)-65)<=1&&!document.querySelector('.snore-studio').textContent.includes('dBFS')&&document.querySelectorAll('.snore-wave i').length===16`));await ev(`document.querySelector('[data-action="record-stop"]').click()`);await new Promise(r=>setTimeout(r,100));check('under five seconds retains paused recording instead of discarding it',await ev(`document.querySelector('.snore-studio').dataset.recordPhase==='paused'&&__posts.length===0&&[...document.querySelectorAll('.snore-wave i')].every(x=>x.style.getPropertyValue('--level')==='6px')`));const paused=await ev(`document.querySelector('#record-time').textContent`);await new Promise(r=>setTimeout(r,1300));check('pause freezes captured duration and permits resume',await ev(`document.querySelector('#record-time').textContent===${JSON.stringify(paused)}&&!document.querySelector('[data-action="record-resume"]').hidden`));await ev(`document.querySelector('[data-action="record-resume"]').click()`);await wait(`document.querySelector('#record-time').textContent==='00:06'`,10000);await ev(`document.querySelector('[data-action="record-pause"]').click()`);await wait(`!document.querySelector('[data-action="record-stop"]').hidden`);await ev(`document.querySelector('[data-action="record-stop"]').click()`);await wait(`!document.querySelector('[data-action="record-save"]').hidden`,10000);check('failed report generation retains analysis and exposes retry',await ev(`document.querySelector('.snore-studio').dataset.recordPhase==='complete'&&!document.querySelector('[name="patientId"]').disabled&&document.querySelector('[data-action="record-stop"]').disabled&&document.querySelector('[data-action="record-save"]').textContent==='重试生成报告'`));await ev(`document.querySelector('[data-action="record-save"]').click()`);await wait(`location.hash.includes('snore-1')&&!!document.querySelector('.snore-report')`);check('retry preserves local identity and only sends analysis',await ev(`__posts.length===2&&__posts[0].body.localId===__posts[1].body.localId&&__posts[1].p==='/assessments/snore'&&__posts[1].body.patientId==='21'&&__posts[1].body.duration>=5&&__posts[1].body.client_side_analysis===true&&!__posts[1].body.audio`));check('standalone report has mini sections and actions',await ev(`const t=document.querySelector('.snore-report').textContent;['鼾声风险指数','鼾声数据详情','专业建议','改善小贴士','立即预约门诊','返回睡眠评估','重新测试'].every(x=>t.includes(x))`));await new Promise(r=>setTimeout(r,350));await shot('snore-report-desktop');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await shot('snore-report-390');check('390px report no overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));
await ev(`__audio.close()`);await go('recording');await ev(`document.querySelector('[data-action="record-start"]').click()`);await wait(`document.querySelector('#record-time').textContent==='00:06'`,10000);await ev(`document.querySelector('[data-action="record-pause"]').click()`);await wait(`!document.querySelector('[data-action="record-stop"]').hidden`);await ev(`document.querySelector('[data-action="record-stop"]').click();document.querySelector('[data-action="record-stop"]').click()`);await wait(`location.hash.includes('snore-1')&&!!document.querySelector('.snore-report')`,10000);check('ending recording automatically generates one report and navigates',await ev(`__posts.length===3&&__posts[2].body.duration>=5&&__posts[2].body.localId!==__posts[1].body.localId`));
await go('recording');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await new Promise(r=>setTimeout(r,350));await shot('snore-recording-390');check('390px no horizontal overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));await ev(`__audio.close()`);console.log(JSON.stringify(checks,null,2));fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/snore-recording-results.json',JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
