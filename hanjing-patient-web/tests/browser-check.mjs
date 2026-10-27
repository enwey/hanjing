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
const debug = process.env.PC_TEST_CDP || 'http://127.0.0.1:9337';
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
    '/tmp/hanjing-pc-' + name + '.png',
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
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: base });
  await wait(
    `!!document.querySelector('.hc-hero') && !document.querySelector('#home-doctors')?.textContent.includes('正在加载')`,
  );
  check(
    'real backend homepage doctors loaded',
    await ev(
      `!!document.querySelector('#home-doctors .hc-doctor') && !document.querySelector('#home-doctors .error-state')`,
    ),
  );
  check(
    'real homepage brand',
    await ev(
      `getComputedStyle(document.body).getPropertyValue('--pine').trim()==='#3b6bf5'`,
    ),
  );
  await shot('home-1440');
  await go('stores');
  check(
    'real stores loaded',
    await ev(`document.querySelectorAll('.pc-grid .pc-panel').length>0`),
  );
  await shot('stores-1440');
  await go('profile');
  await wait(`!!document.querySelector('[data-form="login"]')`);
  check(
    'guest personal page requires login',
    await ev(`location.hash==='#/login'`),
  );
  await shot('login-1440');
  await ev(
    `document.querySelector('[data-action="login-mode"][data-mode="wechat"]').click();document.querySelector('[data-action="wechat-start"]').click()`,
  );
  await wait(
    `document.querySelector('#toast').textContent.includes('尚未配置')`,
  );
  check('missing real WeChat credentials not faked', true);
  // Isolated browser-only API fixtures. No writes to the real backend below.
  const injection = `window.__calls=[];window.__fixtures=${JSON.stringify(fixtures)};window.__fail='';window.__unauthorized=false;window.fetch=async function(input,options={}){const url=new URL(input,location.href);if(!url.pathname.startsWith('/api/v1/'))return window.__realFetch(input,options);const path=url.pathname.slice(7),method=options.method||'GET';window.__calls.push({path,method,body:options.body?JSON.parse(options.body):null});await new Promise(r=>setTimeout(r,80));if(window.__unauthorized)return new Response(JSON.stringify({code:401,message:'登录已过期'}),{status:401});if(window.__fail===path)return new Response(JSON.stringify({code:500,message:'隔离网络错误'}),{status:500});let data;if(method==='GET'){data=window.__fixtures[path];if(data===undefined)return new Response(JSON.stringify({code:404,message:'Fixture missing '+path}),{status:404});}else if(path==='/auth/password-login')data={access_token:'browser-isolated-token'};else if(path==='/appointments')data=${JSON.stringify(appointment)};else if(path==='/orders')data=${JSON.stringify(order)};else if(path==='/assessments/ess')data=${JSON.stringify(assessments[0])};else if(path==='/assessments/snore')data=${JSON.stringify(assessments[1])};else if(path==='/community/posts')data=${JSON.stringify(post)};else data={};return new Response(JSON.stringify({code:0,data}),{status:200,headers:{'Content-Type':'application/json'}});};`;
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__realFetch=window.fetch.bind(window);' + injection,
  });
  await send('Page.navigate', { url: base + '/?pc-test=isolated#/login' });
  await wait(
    `!!window.__fixtures && !!document.querySelector('[data-form="login"]')`,
  );
  await ev(
    `document.querySelector('[name="phone"]').value='13800138000';document.querySelector('[name="password"]').value='TestOnly123';document.querySelector('[data-form="login"]').requestSubmit();document.querySelector('[data-form="login"]').requestSubmit()`,
  );
  await wait(
    `location.hash==='#/profile' && !!document.querySelector('.profile-heading')`,
  );
  check(
    'password login single submission',
    await ev(`__calls.filter(c=>c.path==='/auth/password-login').length===1`),
  );
  for (const name of Object.keys(titles).filter(
    (n) => !['home', 'login'].includes(n),
  )) {
    await go(name, routeParams[name] || {});
    check(
      'interactive route ' + name,
      await ev(
        `!!document.querySelector('.pc-page-head') && !document.querySelector('.error-state') && !document.querySelector('#content').textContent.includes('undefined')`,
      ),
    );
  }
  await go('booking', routeParams.booking);
  await ev(
    `document.querySelector('[name="patientId"]').value='21';const s=document.querySelector('[name="scheduleId"]');s.value='31';s.dispatchEvent(new Event('change',{bubbles:true}))`,
  );
  await wait(`!!document.querySelector('[name="appointmentTime"]')`);
  check(
    'unavailable time slot disabled',
    await ev(
      `document.querySelectorAll('[name="appointmentTime"]:disabled').length===1`,
    ),
  );
  await ev(
    `document.querySelector('[name="appointmentTime"]:not(:disabled)').checked=true;document.querySelector('[data-form="booking"]').requestSubmit();document.querySelector('[data-form="booking"]').requestSubmit()`,
  );
  await wait(
    `location.hash.includes('/appointment?') && document.querySelector('#content').textContent.includes('待支付')`,
  );
  check(
    'booking single POST preserving state',
    await ev(
      `__calls.filter(c=>c.path==='/appointments'&&c.method==='POST').length===1 && document.querySelector('#content').textContent.includes('测试就诊人')`,
    ),
  );
  check(
    'booking payload uses selected schedule/patient',
    await ev(
      `(()=>{const b=__calls.find(c=>c.path==='/appointments'&&c.method==='POST').body;return b.patientId==='21'&&b.scheduleId===31&&b.appointmentTime==='09:00-09:30'})()`,
    ),
  );
  await shot('appointment-1440');
  await go('checkout', routeParams.checkout);
  await ev(
    `const f=document.querySelector('form');f.elements.contactName.value='测试就诊人';f.elements.phone.value='13800138000';f.elements.detailAddress.value='测试地址';f.requestSubmit();f.requestSubmit()`,
  );
  await wait(
    `location.hash.includes('/order?') && !!document.querySelector('[data-action="cancel-order"]')`,
  );
  check(
    'order pending and single POST',
    await ev(
      `__calls.filter(c=>c.path==='/orders'&&c.method==='POST').length===1&&document.querySelector('#content').textContent.includes('待支付')`,
    ),
  );
  await go('questionnaire');
  await ev(
    `document.querySelector('[name="patientId"]').value='21';document.querySelectorAll('input[type="radio"][value="0"]').forEach(e=>e.checked=true);document.querySelector('form').requestSubmit()`,
  );
  await wait(`location.hash.includes('/report?')`);
  check(
    'ESS payload is eight integer answers',
    await ev(
      `__calls.some(c=>c.path==='/assessments/ess'&&c.body.answers.length===8&&c.body.answers.every(a=>a===0))`,
    ),
  );
  await go('community');
  await ev(
    `const s=document.querySelector('[data-search="posts"]');s.value='无匹配字符串';s.dispatchEvent(new Event('input',{bubbles:true}))`,
  );
  check(
    'community filtering empty state',
    await ev(
      `document.querySelector('#search-results').textContent.includes('没有找到')`,
    ),
  );
  await ev(`__fail='/products'`);
  await go('products');
  check(
    'API failure is not shown as empty success',
    await ev(`!!document.querySelector('.error-state')`),
  );
  await ev(`__fail='';document.querySelector('[data-action="retry"]').click()`);
  await wait(`!!document.querySelector('.pc-product')`);
  check('error retry restores products', true);
  for (const width of [1440, 1024, 390]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (const name of ['home', 'booking', 'products', 'post', 'profile']) {
      await go(name, routeParams[name] || {});
      check(
        'no horizontal overflow ' + name + ' ' + width,
        await ev('document.documentElement.scrollWidth<=innerWidth'),
      );
      await shot(name + '-' + width);
    }
  }
  // Synthetic PCM input validates the browser audio plumbing, not a physical mic
  // or clinical/ambient dB accuracy.
  await go('recording');
  await ev(
    `navigator.mediaDevices.getUserMedia=async()=>{window.__audio=new AudioContext();const oscillator=__audio.createOscillator(),gain=__audio.createGain(),output=__audio.createMediaStreamDestination();gain.gain.value=0.04;oscillator.frequency.value=160;oscillator.connect(gain);gain.connect(output);oscillator.start();await __audio.resume();return output.stream;};document.querySelector('[name="patientId"]').value='21';document.querySelector('[data-action="record-start"]').click()`,
  );
  await wait(
    `document.querySelector('#record-time').textContent==='00:06'`,
    10000,
  );
  check(
    'recording streams real PCM levels',
    await ev(
      `Number.isFinite(Number(document.querySelector('#record-level').textContent)) && Number(document.querySelector('#record-level').textContent)<0`,
    ),
  );
  await ev(`document.querySelector('[data-action="record-stop"]').click()`);
  await wait(`!document.querySelector('[data-action="record-save"]').hidden`);
  check(
    'recording analysis uses worker and produces a result',
    await ev(
      `document.querySelector('#record-result').textContent.includes('本次录音结果') && document.querySelector('[data-action="record-stop"]').disabled`,
    ),
  );
  await ev(`document.querySelector('[data-action="record-save"]').click()`);
  await wait(`location.hash.includes('snore-1')`);
  check(
    'recording save matches mini API contract',
    await ev(
      `__calls.some(c=>c.path==='/assessments/snore'&&c.body.duration>=5&&c.body.patientId==='21'&&c.body.client_side_analysis===true&&c.body.localId&&Number.isFinite(c.body.analysis_result.avgDecibel))`,
    ),
  );
  await ev(`__audio.close()`);
  check(
    'no payment requests',
    await ev(
      `!__calls.some(c=>c.path.endsWith('/pay')||c.path.endsWith('/confirm-pay'))`,
    ),
  );
  await ev(`__unauthorized=true`);
  await go('stores');
  await go('profile');
  await wait(`location.hash==='#/login'`);
  check(
    '401 clears session and private content',
    await ev(
      `!sessionStorage.getItem('xingkangming.patient.pc.session')&&!document.querySelector('.profile-heading')`,
    ),
  );
  check(
    'no uncaught runtime exceptions',
    !tab.events.some((e) => e.method === 'Runtime.exceptionThrown'),
  );
  console.log(
    JSON.stringify(
      {
        passed: checks.filter((v) => v.ok).length,
        total: checks.length,
        failed: checks.filter((v) => !v.ok),
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    '/tmp/hanjing-pc-browser-check.json',
    JSON.stringify(checks, null, 2),
  );
  if (checks.some((v) => !v.ok)) process.exitCode = 1;
} catch (error) {
  await shot('failed');
  console.error(
    await ev(
      `({hash:location.hash,text:document.querySelector('#content')?.textContent.slice(0,1500),requests:window.__calls?.map(c=>({path:c.path,method:c.method})),errors:document.querySelector('.form-message')?.textContent})`,
    ),
  );
  throw error;
} finally {
  tab.ws.close();
  await browser.send('Target.closeTarget', { targetId });
  browser.ws.close();
}
