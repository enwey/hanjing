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
    "../tests/patient-web/artifacts/pending-pages-2026-10-28/" + name + ".png",
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

fs.mkdirSync("../tests/patient-web/artifacts/pending-pages-2026-10-28", {
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
  await send("Page.navigate", { url: base + "/#/login" });
  await wait(`!!document.querySelector('[data-action="local-login"]')`);
  await ev(`document.querySelector('[data-action="local-login"]').click()`);
  await wait(
    `location.hash==='#/profile'&&!document.querySelector('.loading-state')`,
  );
  const realChecks = await ev(
    `(async()=>{const api=await import('/src/api.js');const result=[];for(const path of ['/user/profile','/user/member-info','/user/member-levels','/im/unread-count','/distribution/info','/distribution/rules','/distribution/orders','/live/rooms','/user/coupons?status=all']){try{await api.request(path);result.push({path,ok:true})}catch(e){result.push({path,ok:false,message:e.message})}}return result})()`,
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
  const scenarios = [...pendingRoutes]
    .filter((n) => n !== "member")
    .map((name) => ({ name, params: routeParams[name] || {} }));
  scenarios.push(
    { name: "member", key: "member-add", params: {} },
    { name: "member", key: "member-edit", params: { id: 22 } },
  );
  for (const width of process.env.PC_INTERACTIONS_ONLY ? [] : [1440, 390]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (const item of scenarios) {
      const key = item.key || item.name;
      await go(item.name, item.params);
      await wait(
        `!!document.querySelector('[data-pending-page]')&&!document.querySelector('.loading-state')`,
      );
      check(
        width + " " + key + " rendered",
        await ev(
          `!document.querySelector('#content .error-state')&&!document.querySelector('#content').textContent.includes('undefined')&&!document.querySelector('#content').textContent.includes('NaN')`,
        ),
      );
      check(
        width + " " + key + " overflow",
        await ev(`document.documentElement.scrollWidth<=${width}`),
      );
      await shot(key + "-" + width);
    }
  }
  await go("assessments", { filter: "ess", patientId: 21 });
  check(
    "assessment type filter",
    await ev(
      `document.querySelectorAll('.parity-record-summary').length===1&&!document.querySelector('.parity-record-summary').textContent.includes('AI')`,
    ),
  );
  await go("publish");
  await ev(
    `const fields=document.querySelectorAll('[data-publish-tag]');for(const x of Array.from(fields).slice(0,4)){x.checked=true;x.dispatchEvent(new Event('change',{bubbles:true}))}document.querySelector('[data-publish-content]').value='发布测试内容';document.querySelector('[data-publish-content]').dispatchEvent(new Event('input',{bubbles:true}));`,
  );
  check(
    "publish maximum three tags",
    await ev(
      `document.querySelectorAll('[data-publish-tag]:checked').length===3`,
    ),
  );
  check(
    "publish live count",
    await ev(
      `document.querySelector('[data-publish-count]').textContent==='6/1000'`,
    ),
  );
  await ev(
    `const f=document.querySelector('[data-form="publish"]');f.elements.title.value='测试发布';f.requestSubmit()`,
  );
  await wait(
    `location.hash.includes('/post?')&&!document.querySelector('.loading-state')`,
  );
  check(
    "publish carries category and three tags",
    await ev(
      `(()=>{const c=__calls.findLast(x=>x.path==='/community/posts'&&x.method==='POST');return c&&JSON.parse(c.body).tags.length===4})()`,
    ),
  );
  await go("editProfile");
  await ev(
    `const f=document.querySelector('[data-form="profile"]');f.elements.nickname.value='测试昵称';f.elements.idCard.value='110101199001010011';f.requestSubmit()`,
  );
  await wait(
    `location.hash==='#/profile'&&!document.querySelector('.loading-state')`,
  );
  check(
    "profile identity and gender payload",
    await ev(
      `(()=>{const c=__calls.findLast(x=>x.path==='/user/profile'&&x.method==='PUT');return c&&JSON.parse(c.body).idCard==='110101199001010011'&&JSON.parse(c.body).gender===1})()`,
    ),
  );
  await go("member", {});
  await ev(
    `const f=document.querySelector('[data-form="member"]');f.elements.name.value='测试新增家属';f.elements.birthday.value='1990-01-01';f.elements.cardNo.value='TEST-CARD';f.elements.storeId.value='9';f.requestSubmit()`,
  );
  await wait(
    `location.hash==='#/family'&&!document.querySelector('.loading-state')`,
  );
  check(
    "member clinic and record payload",
    await ev(
      `(()=>{const c=__calls.findLast(x=>x.path==='/user/family-members'&&x.method==='POST');return c&&JSON.parse(c.body).storeId==='9'&&JSON.parse(c.body).cardNo==='TEST-CARD'})()`,
    ),
  );
  await go("withdraw");
  await ev(
    `const input=document.querySelector('[data-withdraw-amount]');input.value='10';input.dispatchEvent(new Event('input',{bubbles:true}))`,
  );
  check(
    "withdraw actual fee summary",
    await ev(
      `document.querySelector('[data-withdraw-fee]').textContent==='¥1.00'&&document.querySelector('[data-withdraw-net]').textContent==='¥9.00'`,
    ),
  );
  await go("member", { id: 21 });
  check(
    "self member remains read-only",
    await ev(
      `!document.querySelector('[data-form="member"]')&&document.querySelector('#content').textContent.includes('编辑本人资料')`,
    ),
  );
  await ev(`__fail='/user/notifications'`);
  await go("notifications");
  check(
    "API failure is not shown as empty success",
    await ev(`!!document.querySelector('#content .error-state')`),
  );
  await ev(
    `__fail='';__fixture['/treatment/record']=null;__fixture['/treatment/sleep-report']={hasData:false};__fixture['/assessments']=[]`,
  );
  for (const name of [
    "assessments",
    "treatmentReport",
    "treatmentTimeline",
    "treatmentAdvice",
    "treatmentAdjust",
  ]) {
    await go(name, { patientId: 21 });
    check(
      "empty " + name,
      await ev(
        `!!document.querySelector('.empty-state')&&!document.querySelector('#content .error-state')`,
      ),
    );
  }
  fs.writeFileSync(
    "../tests/patient-web/artifacts/pending-pages-2026-10-28/results.json",
    JSON.stringify(checks, null, 2),
  );
  console.log(
    JSON.stringify({
      total: checks.length,
      failed: checks.filter((x) => !x.ok),
    }),
  );
  if (checks.some((x) => !x.ok)) process.exitCode = 1;
} finally {
  await browser.send("Target.closeTarget", { targetId });
  tab.ws.close();
  browser.ws.close();
}
