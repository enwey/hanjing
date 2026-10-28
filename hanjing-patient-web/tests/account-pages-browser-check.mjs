import fs from "node:fs";
import { pendingRoutes } from "../src/pending-pages.js";
import {
  fixtures,
  routeParams,
  appointment,
  order,
  post,
  assessments,
} from "./fixtures.mjs";
import { titles } from "../src/pages.js";
const debug = process.env.PC_TEST_CDP || "http://127.0.0.1:9337";
const base = process.env.PC_TEST_URL || "http://127.0.0.1:3003";
const version = await (await fetch(debug + "/json/version")).json();
if (!version["User-Agent"]?.includes("HeadlessChrome"))
  throw Error("Use an isolated headless Chrome, not the user browser");
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
const { targetId } = await browser.send("Target.createTarget", {
  url: "about:blank",
});
const tabs = await (await fetch(debug + "/json/list")).json();
const target = tabs.find((t) => t.id === targetId);
const tab = await connect(target.webSocketDebuggerUrl);
const send = tab.send,
  checks = [];
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression: "{\n" + expression + "\n}",
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
  if (!ok) console.error("FAIL", name);
};
const wait = async (expression, timeout = 7000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await ev(expression)) return;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw Error("Timed out: " + expression);
};
const shot = async (name) => {
  await new Promise((r) => setTimeout(r, 400));
  const { cssContentSize } = await send("Page.getLayoutMetrics");
  const r = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { ...cssContentSize, scale: 1 },
  });
  fs.writeFileSync(
    "../tests/patient-web/artifacts/account-pages-2026-10-29/" + name + ".png",
    Buffer.from(r.data, "base64"),
  );
};
const go = async (page, params = {}) => {
  await ev(
    `location.hash=${JSON.stringify("#/" + page + (Object.keys(params).length ? "?" + new URLSearchParams(params) : ""))}`,
  );
  await new Promise((r) => setTimeout(r, 130));
  await wait(
    `!document.querySelector('.loading-state') && !!document.querySelector('#content')`,
  );
};

fs.mkdirSync("../tests/patient-web/artifacts/account-pages-2026-10-29", {
  recursive: true,
});

try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: base + "/?localLogin=1#/login" });
  await wait(`!!document.querySelector('[data-action="local-login"]')`);
  await ev(`document.querySelector('[data-action="local-login"]').click()`);
  await wait(
    `location.hash==='#/profile'&&!document.querySelector('.loading-state')`,
  );
  const realChecks = await ev(
    `(async()=>{const api=await import('/src/api.js');const result=[];for(const path of ['/user/profile','/user/member-info','/user/member-levels','/im/unread-count']){try{await api.request(path);result.push({path,ok:true})}catch(e){result.push({path,ok:false,message:e.message})}}return result})()`,
  );
  for (const item of realChecks) check("real local API " + item.path, item.ok);
  const data = structuredClone(fixtures);
  data["/assessments"][0].essAnswers = [0, 1, 2, 3, 0, 1, 2, 3];
  data["/treatment/sleep-report"].score = 86;
  data["/treatment/sleep-report"].trend = Array.from({ length: 7 }, (_, i) => ({
    date: "10-" + (i + 21),
    score: 70 + i * 3,
    painScore: 2,
  }));
  data["/user/family-members/22"] = {
    ...data["/user/family-members/21"],
    id: 22,
    relation: "parent",
    name: "测试家属",
  };
  data["/distribution/info"].teamCount = 1;
  data["/distribution/info"].teamLevel2Count = 2;
  await ev(
    `window.__fixture=${JSON.stringify(data)};window.__calls=[];window.__fail='';window.__realFetch=fetch;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);const path=u.pathname.slice(7);__calls.push({path,method:opts.method||'GET',body:opts.body});if(path===__fail)return new Response(JSON.stringify({code:500,message:'测试接口失败'}),{status:500});return new Response(JSON.stringify({code:0,data:opts.method==='POST'?{id:71}:(Object.hasOwn(__fixture,path)?__fixture[path]:[])}))}`,
  );
  const scenes=[['profile',{}],['editProfile',{}],['family',{}],['member',{},'member-add'],['member',{id:22},'member-edit'],['membership',{}],['security',{}],['notifications',{}],['service',{}]];
  for(const width of [1440,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
    for(const [route,params,key=route] of scenes){
      await go(route,params);await wait(`!!document.querySelector('.account-page')`);
      check(key+' fits '+width,await ev(`document.documentElement.scrollWidth<=innerWidth+1&&!document.querySelector('#content .error-state')`));
      check(key+' hints '+width,await ev(`[...document.querySelectorAll('#content input:not([type="hidden"]),#content textarea')].every(el=>['file','date'].includes(el.type)?!!el.closest('.field')?.querySelector('.input-hint'):!!el.placeholder)`));
      check(key+' removed entries absent '+width,await ev(`!document.querySelector('a[href*="#/distribution"],a[href*="#/coupons"],a[href*="#/withdraw"]')`));
      await shot(key+'-'+width);
    }
  }
  await go('editProfile');await ev(`const f=document.querySelector('[data-form="profile"]');f.elements.nickname.value='资料检查';f.requestSubmit()`);await wait(`location.hash==='#/profile'&&!document.querySelector('.loading-state')`);
  check('profile save payload',await ev(`__calls.some(x=>x.path==='/user/profile'&&x.method==='PUT'&&JSON.parse(x.body).nickname==='资料检查')`));
  await go('member');await ev(`const f=document.querySelector('[data-form="member"]');f.elements.name.value='测试家属';f.elements.birthday.value='1990-01-01';f.elements.phone.value='13800138000';f.elements.storeId.value='9';f.requestSubmit()`);await wait(`location.hash==='#/family'`);
  check('member add payload',await ev(`__calls.some(x=>x.path==='/user/family-members'&&x.method==='POST')`));
  await go('member',{id:22});await ev(`const f=document.querySelector('[data-form="member"]');f.elements.name.value='编辑家属';f.requestSubmit()`);await wait(`location.hash==='#/family'`);
  check('member edit payload',await ev(`__calls.some(x=>x.path==='/user/family-members/22'&&x.method==='PUT')`));
  await go('member',{id:21});check('self stays read only',await ev(`!document.querySelector('[data-form="member"]')&&!!document.querySelector('a[href="#/editProfile"]')`));
  await go('security');await ev(`const f=document.querySelector('[data-form="password"]');f.elements.newPassword.value='Test12345';f.elements.confirmPassword.value='Other12345';f.requestSubmit()`);await wait(`document.querySelector('.form-message').textContent.includes('不一致')`);
  check('password mismatch no request',await ev(`!__calls.some(x=>x.path==='/user/password')`));
  await ev(`const f=document.querySelector('[data-form="password"]');f.elements.confirmPassword.value='Test12345';f.requestSubmit()`);await wait(`document.querySelector('[name="newPassword"]').value===''`);
  check('password save',await ev(`__calls.some(x=>x.path==='/user/password'&&x.method==='PUT')`));
  await go('notifications');await ev(`document.querySelector('[data-action="read-all"]').click()`);await wait(`__calls.some(x=>x.path==='/user/notifications/read-all')`);check('read all action',true);
  await go('service');await ev(`document.querySelector('[data-form="message"]').requestSubmit()`);await wait(`document.querySelector('.form-message').textContent.includes('请输入内容')`);check('empty chat blocked',await ev(`!__calls.some(x=>x.path==='/im/send')`));
  await ev(`const f=document.querySelector('[data-form="message"]');f.elements.text.value='测试咨询';f.requestSubmit()`);await wait(`__calls.some(x=>x.path==='/im/send')`);check('message payload',await ev(`__calls.some(x=>x.path==='/im/send'&&JSON.parse(x.body).text==='测试咨询')`));
  await go('profile');await ev(`__fixture['/user/family-members']=[];__fixture['/user/notifications']=[];__fixture['/im/messages']=[]`);
  for(const route of ['family','notifications','service']){await go(route);check(route+' empty',await ev(`!!document.querySelector('.empty-state')&&!document.querySelector('#content .error-state')`));}
  await ev(`__fail='/user/profile'`);await go('editProfile');check('profile failure retry',await ev(`!!document.querySelector('[data-action="retry"]')`));
  fs.writeFileSync('../tests/patient-web/artifacts/account-pages-2026-10-29/results.json',JSON.stringify(checks,null,2));
  console.log(JSON.stringify({total:checks.length,failed:checks.filter(x=>!x.ok)}));if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close();}
