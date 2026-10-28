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
    "../tests/patient-web/artifacts/input-hints-2026-10-28/" + name + ".png",
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

fs.mkdirSync("../tests/patient-web/artifacts/input-hints-2026-10-28", {
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
    `(async()=>{const api=await import('/src/api.js');const result=[];for(const path of ['/user/profile','/user/member-info','/user/member-levels','/im/unread-count','/distribution/info','/distribution/rules','/distribution/orders','/user/coupons?status=all']){try{await api.request(path);result.push({path,ok:true})}catch(e){result.push({path,ok:false,message:e.message})}}return result})()`,
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
  const audit = async (name) => {
    const result=await ev(`(()=>{const controls=[...document.querySelectorAll('input,textarea')].filter(x=>!['hidden','radio','checkbox','range','submit','button'].includes(x.type));return {total:controls.length,missing:controls.filter(x=>['date','file'].includes(x.type)?!x.getAttribute('aria-description'):!x.getAttribute('placeholder')?.trim()).map(x=>({name:x.name,type:x.type})),error:!!document.querySelector('#content .error-state')}})()`);
    check(name + ' inputs have prompts', !result.error && result.missing.length===0);
    inventory.push({name,...result});
  };
  const inventory=[];
  for (const name of Object.keys(titles).filter(n=>!['home','login','wearing'].includes(n))) {
    await go(name,routeParams[name]||{});await audit(name);
  }
  await go('member');await audit('member-add');
  await go('member',{id:22});await audit('member-edit');
  await ev(`__fixture['/appointments/51'].appointment.status='completed'`);
  await go('appointment',{id:51});await audit('appointment-evaluation');
  await ev(`(async()=>{const {session}=await import('/src/api.js');window.__hintToken=session.token();session.clear()})()`);
  await go('login');await wait(`!!document.querySelector('[data-form="login"]')`);await audit('login');
  await ev(`(async()=>{const {session}=await import('/src/api.js');session.save(__hintToken,{local:true})})()`);
  for(const width of [1440,390]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
    for(const name of ['member','security','checkout','withdraw','publish','medical']) {
      await go(name,name==='member'?{}:routeParams[name]||{});
      check(width+' '+name+' no overflow',await ev(`document.documentElement.scrollWidth<=${width}`));
      await shot(name+'-'+width);
    }
  }
  await go('post',routeParams.post);
  await ev(`document.querySelector('[data-action="post-report"]').click()`);
  await wait(`!!document.querySelector('dialog[open] textarea')`);
  await audit('report-dialog');await shot('report-dialog');
  await ev(`document.querySelector('dialog[open]').close()`);
  await go('order',routeParams.order);
  await ev(`__fixture['/orders/81'].status='paid'`);
  await go('orders');await go('order',routeParams.order);
  await ev(`document.querySelector('[data-action="refund-order"]').click()`);
  await wait(`!!document.querySelector('dialog[open] textarea')`);
  await audit('refund-dialog');
  await ev(`document.querySelector('dialog[open]').close()`);
  await go('wearing',{patientId:21});
  await wait(`!!document.querySelector('dialog[open] textarea')`);
  await audit('wearing-drawer');await shot('wearing-drawer');
  fs.writeFileSync('../tests/patient-web/artifacts/input-hints-2026-10-28/results.json',JSON.stringify({checks,inventory},null,2));
  console.log(JSON.stringify({total:checks.length,failed:checks.filter(x=>!x.ok),missing:inventory.filter(x=>x.missing.length||x.error)}));
  if(checks.some(x=>!x.ok))process.exitCode=1;
} finally {await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close();}
