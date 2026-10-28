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
    "../tests/patient-web/artifacts/api-business-2026-10-29/" + name + ".png",
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

fs.mkdirSync("../tests/patient-web/artifacts/api-business-2026-10-29", {
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
    `(async()=>{const api=await import('/src/api.js');const result=[];for(const path of ['/user/profile','/user/member-info','/user/member-levels','/im/unread-count','/user/account-security','/user/family-members','/user/notifications','/user/medical-records','/assessments','/assessments/ess-questions','/appointments','/orders','/products','/product-categories','/stores','/doctors','/community/posts','/treatment/records','/treatment/record','/treatment/wearing-summary','/treatment/wearing-records','/treatment/sleep-report','/treatment/timeline','/treatment/adjustments','/treatment/device-maintenance','/treatment/device-feedback','/im/messages']){try{await api.request(path);result.push({path,ok:true})}catch(e){result.push({path,ok:false,message:e.message})}}return result})()`,
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

  await ev(`__fixture['/user/medical-records'].list[0].visitDate='2026-10-27T16:00:00.000Z'`);
  await go('medical');check('medical timezone date',await ev(`document.querySelector('#content').textContent.includes('2026-10-28')`));await shot('medical-date');
  // Unknown creation outcomes remain locked until records actually load.
  await ev(`sessionStorage.setItem('pc-pending:order:'+(sessionStorage.getItem('xingkangming.patient.pc.session')||''),'{}');__fail='/orders'`);
  await go('orders');check('failed list cannot acknowledge unknown order',await ev(`!!document.querySelector('.error-state')&&!document.querySelector('[data-action="acknowledge-create"]')`));
  await ev(`__fail=''`);await go('profile');await go('orders');check('loaded list offers manual acknowledgement',await ev(`!!document.querySelector('[data-action="acknowledge-create"]')`));
  await go('post',{id:71});
  await ev(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(r=>window.__releaseClipboard=r)}});document.querySelector('[data-action="post-share"]').click()`);
  await wait(`!!window.__releaseClipboard`);await go('profile');await ev(`__releaseClipboard()`);await new Promise(r=>setTimeout(r,200));
  check('abandoned share does not send request',await ev(`!__calls.some(x=>x.path==='/community/posts/71/share')`));
  await ev(`sessionStorage.clear()`);
  await send('Page.navigate',{url:base+'/#/login'});await wait(`!!document.querySelector('[data-form="login"]')`);
  check('ordinary login hides mock and developer copy',await ev(`!document.querySelector('[data-action="local-login"]')&&!/模拟|测试账号/.test(document.querySelector('#content').textContent)`));await shot('normal-login');
  fs.writeFileSync('../tests/patient-web/artifacts/api-business-2026-10-29/results.json',JSON.stringify(checks,null,2));
  console.log(JSON.stringify({total:checks.length,failed:checks.filter(x=>!x.ok)}));if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close();}
