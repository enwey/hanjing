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
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  check('login switch animates without overlapping panels', await ev(`(async () => {
    document.querySelector('[data-mode="wechat"]').click();
    await new Promise(r=>setTimeout(r,60));
    return document.querySelector('#password-login').hidden && !document.querySelector('#wechat-login').hidden && document.querySelector('#wechat-login').getAnimations().length>0;
  })()`));
  await shot('login-switch-motion');
  await ev(`document.querySelector('[data-mode="password"]').click()`);
  await go('assessment');
  await ev(`window.__navBefore=document.querySelector('.top-nav');window.__markerBefore=document.querySelector('.nav-selection')`);
  await ev(`location.hash='#/community'`);
  await new Promise(r=>setTimeout(r,70));
  await ev(`location.hash='#/products'`);
  await new Promise(r=>setTimeout(r,450));
  check('rapid navigation ends at selected item',await ev(`(() => {
    const selected=document.querySelector('.top-nav a.current'), marker=document.querySelector('.nav-selection');
    if(!selected||!marker)return false;
    const a=selected.getBoundingClientRect(),b=marker.getBoundingClientRect();
    return window.__navBefore===document.querySelector('.top-nav') && window.__markerBefore===marker && selected.hash==='#/products' && Math.abs(a.left-b.left)<1 && Math.abs(a.width-b.width)<1 && Math.abs(a.top-b.top)<1;
  })()`));
  await shot('nav-switch-final');
  await go('login');
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for (const width of [1440, 820, 390]) {
    await send('Emulation.setDeviceMetricsOverride', {width, height:1000, deviceScaleFactor:1, mobile:false});
    check(`login content inset ${width}`, await ev(`(() => {
      const shell=document.querySelector('.login-layout').getBoundingClientRect();
      const panel=document.querySelector('.login-panel').getBoundingClientRect();
      const intro=document.querySelector('.login-intro').getBoundingClientRect();
      const style=getComputedStyle(document.querySelector('.login-panel'));
      return !document.querySelector('.pc-page-head') && parseFloat(style.paddingLeft)>=24
        && style.backgroundColor==='rgb(255, 255, 255)' && panel.left>=shell.left && panel.right<=shell.right+1 && panel.width<=480
        && (innerWidth<768 || (Math.abs(intro.left-shell.left)<1 && Math.abs(intro.top-panel.top)<1 && panel.left-intro.right>=39))
        && document.documentElement.scrollWidth<=innerWidth;
    })()`));
    await shot('login-spacing-'+width);
  }
  await send('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
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
  for(const width of [1440,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
    for(const name of Object.keys(titles).filter(n=>!['home','login'].includes(n))) {
      await go(name,routeParams[name]||{});
      check('layout '+width+' '+name,await ev('!document.querySelector(".error-state") && document.documentElement.scrollWidth<=innerWidth'));
      await shot('layout-'+name+'-'+width);
    }
  }
  console.log(JSON.stringify(checks.filter(c=>!c.ok)));
  console.log(checks.length+' checks, '+checks.filter(c=>!c.ok).length+' failures');
} finally {tab.ws.close();await browser.send('Target.closeTarget',{targetId});browser.ws.close();}
