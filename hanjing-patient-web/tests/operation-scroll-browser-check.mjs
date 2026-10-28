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
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/?localLogin=1#/login'});await wait(`!!document.querySelector('[data-action="local-login"]')`);await ev(`document.querySelector('[data-action="local-login"]').click()`);await wait(`location.hash==='#/profile'&&!document.querySelector('.loading-state')`);
 const data=structuredClone(fixtures);const article=data['/community/posts/71'];article.content='用于验证页内操作的长文章。\n'.repeat(45);data['/user/notifications']={list:Array.from({length:20},(_,i)=>({id:String(i+1),title:'测试通知 '+i,content:'系统通知内容',isRead:false}))};article.comments=Array.from({length:6},(_,i)=>({...article.comments[0],id:900+i}));
 await ev(`window.__fixture=${JSON.stringify(data)};window.__realFetch=fetch;window.__fail=false;window.__reads=0;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);const p=u.pathname.slice(7);if(opts.method==='POST'){if(__fail)return new Response(JSON.stringify({code:500,message:'模拟失败'}),{status:500});if(p.endsWith('/read'))__fixture['/user/notifications'].list.find(x=>p.includes('/'+x.id+'/')).isRead=true;if(p.endsWith('/read-all'))__fixture['/user/notifications'].list.forEach(x=>x.isRead=true);if(p.endsWith('/comment'))__fixture['/community/posts/71'].comments.push({id:9999,author:'测试',content:'新增评论',createdAt:'2026-10-28',likes:0});return new Response(JSON.stringify({code:0,data:{}}))}__reads++;return new Response(JSON.stringify({code:0,data:__fixture[p]??[]}))}`);
 await go('post',{id:'71'});await ev(`document.querySelector('[data-action="comment-like"]').scrollIntoView({block:'center'});window.__content=document.querySelector('#content');window.__scroll=scrollY;window.__readStart=__reads;document.querySelector('[name="content"]').value='尚未发送的草稿'`);
 for(const name of ['post-like','post-favorite','comment-like']){
  await ev(`document.querySelector('[data-action="${name}"]').click()`);await wait(`!document.querySelector('[data-action="${name}"]').disabled`);
  check(name+' updates without replacing content or jumping',await ev(`document.querySelector('#content')===__content&&Math.abs(scrollY-__scroll)<2&&__reads===__readStart&&document.querySelector('[name="content"]').value==='尚未发送的草稿'`));
 }
 check('like reflects new state',await ev(`document.querySelector('[data-action="post-like"]').textContent.includes('已点赞')`));
 await ev(`__fail=true;document.querySelector('[data-action="post-like"]').click()`);await wait(`!document.querySelector('[data-action="post-like"]').disabled`);check('failed like retains state and scroll',await ev(`document.querySelector('[data-action="post-like"]').textContent.includes('已点赞')&&Math.abs(scrollY-__scroll)<2`));
 await ev(`__fail=false;document.querySelector('[data-form="comment"]').requestSubmit()`);await wait(`document.querySelector('#content')!==__content||document.querySelector('.comment')?.textContent.includes('新增评论')`,3000).catch(()=>{});
 await wait(`document.querySelector('#content').textContent.includes('新增评论')`);check('comment submit retains scroll with refreshed data',await ev(`Math.abs(scrollY-__scroll)<2&&!document.querySelector('.loading-state')`));await shot('community-operation-scroll');
 await go('notifications');await ev(`document.querySelectorAll('[data-action="read"]')[8].scrollIntoView({block:'center'});__scroll=scrollY;document.querySelectorAll('[data-action="read"]')[8].click()`);await wait(`document.querySelectorAll('[data-action="read"]').length===19`);check('notification read retains scroll',await ev(`Math.abs(scrollY-__scroll)<2`));
 await ev(`document.querySelector('[data-action="read-all"]').click()`);await wait(`!document.querySelector('[data-action="read"]')`);check('notification read-all retains scroll',await ev(`Math.abs(scrollY-__scroll)<2`));
 await go('treatmentTrend',{patientId:'21'});await ev(`scrollTo(0,250);__scroll=scrollY;document.querySelector('.treatment-range-options a[href*="range=month"]').click()`);await wait(`document.querySelectorAll('.treatment-chart-day').length===30`);check('range switch retains scroll',await ev(`Math.abs(scrollY-__scroll)<2`));
 await go('treatment',{patientId:'21'});await ev(`scrollTo(0,350);__scroll=scrollY;document.querySelector('.treatment-month-nav a').click()`);await wait(`location.hash.includes('month=')&&!document.querySelector('.loading-state')`);check('month switch retains scroll',await ev(`Math.abs(scrollY-__scroll)<2`));
 await go('profile');check('different route starts at top' ,await ev(`scrollY===0`));
 fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/operation-scroll-results.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
} finally {await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
