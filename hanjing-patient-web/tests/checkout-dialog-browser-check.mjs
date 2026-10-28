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
const artifactDir = new URL("../../tests/patient-web/artifacts/checkout-dialog-2026-10-28/", import.meta.url);
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
    new URL(name + ".png", artifactDir),
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

fs.mkdirSync(artifactDir, {
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
  await ev(`window.__orderMode='success';window.__fixtureFetch=fetch;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(u.pathname.endsWith('/auth/local-login'))return __realFetch(input,opts);if(u.pathname==='/api/v1/orders'&&opts.method==='POST'){__calls.push({path:'/orders',method:'POST',body:opts.body});await new Promise(r=>setTimeout(r,400));return __orderMode==='error'?new Response(JSON.stringify({code:422,message:'测试下单失败'}),{status:422}):new Response(JSON.stringify({code:0,data:{id:81}}));}return __fixtureFetch(input,opts)}`);
  const open=async()=>{await ev(`document.querySelector('[data-action="checkout-open"]').click()`);await wait(`!!document.querySelector('.checkout-dialog [data-form="order"]')`)};
  await go('product',{id:41});
  await ev(`window.scrollTo(0,200);document.querySelector('[data-action="checkout-open"]').focus();window.__oldY=scrollY`);
  await open();
  check('opens on product without navigation',await ev(`location.hash==='#/product?id=41' && document.querySelectorAll('.checkout-dialog').length===1 && document.body.style.overflow==='hidden'`));
  await ev(`document.querySelector('[data-action="checkout-open"]').click()`);
  check('coupon and extra hints removed',await ev(`!document.querySelector('.checkout-dialog [name="couponId"]')&&!document.querySelector('.checkout-dialog').textContent.includes('最终优惠')&&!document.querySelector('.checkout-dialog').textContent.includes('如提交结果不明确')`));
  check('large red total and centered close icon',await ev(`(()=>{const s=getComputedStyle(document.querySelector('[data-checkout-total]'));const b=document.querySelector('[data-checkout-close]').getBoundingClientRect();const i=document.querySelector('[data-checkout-close] svg').getBoundingClientRect();return s.color==='rgb(220, 38, 38)'&&parseFloat(s.fontSize)>=28&&Math.abs(b.x+b.width/2-i.x-i.width/2)<1&&Math.abs(b.y+b.height/2-i.y-i.height/2)<1})()`));
  check('single modal',await ev(`document.querySelectorAll('.checkout-dialog').length===1`));
  for(const width of [1440,390]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    check(width+' modal fits',await ev(`(()=>{const r=document.querySelector('.checkout-dialog').getBoundingClientRect();return r.width<=innerWidth && r.height<=innerHeight && r.top>=0 && document.querySelector('.checkout-dialog-body').scrollWidth<=document.querySelector('.checkout-dialog-body').clientWidth+1})()`));
    await shot('checkout-'+width);
  }
  await ev(`const f=document.querySelector('[data-form="order"]');f.elements.quantity.value='2';f.elements.quantity.dispatchEvent(new Event('input',{bubbles:true}));f.elements.deliveryMethod.value='pickup';f.elements.deliveryMethod.dispatchEvent(new Event('change',{bubbles:true}))`);
  check('amount and pickup requirements',await ev(`const f=document.querySelector('[data-form="order"]');f.querySelector('[data-checkout-total]').textContent.includes('198.00')&&f.querySelector('#shipping-fields').hidden&&!f.elements.detailAddress.required&&f.elements.storeId.required`));
  await ev(`document.querySelector('[data-checkout-close]').click()`);
  check('close restores focus and unlocks',await ev(`!document.querySelector('.checkout-dialog')&&document.body.style.overflow!=='hidden'&&document.activeElement.matches('[data-action="checkout-open"]')`));
  await open();
  await ev(`document.querySelector('.checkout-dialog').dispatchEvent(new Event('cancel',{cancelable:true}))`);
  check('escape closes',await ev(`!document.querySelector('.checkout-dialog')`));
  await go('checkout',{id:41});await wait(`!!document.querySelector('.checkout-dialog [data-form="order"]')`);
  check('legacy checkout opens product modal',await ev(`location.hash==='#/product?id=41'&&document.querySelector('#content .shop-detail')`));
  await go('products');
  check('route navigation removes modal',await ev(`!document.querySelector('.checkout-dialog')&&document.body.style.overflow!=='hidden'`));
  await go('product',{id:41});
  await ev(`__fail='/stores';document.querySelector('[data-action="checkout-open"]').click()`);
  await wait(`!!document.querySelector('[data-checkout-retry]')`);
  check('load error remains in modal',await ev(`location.hash.includes('product')&&document.querySelector('.checkout-dialog [role="alert"]')`));
  await ev(`__fail='';document.querySelector('[data-checkout-retry]').click()`);
  await wait(`!!document.querySelector('.checkout-dialog [data-form="order"]')`);
  await ev(`const f=document.querySelector('[data-form="order"]');f.elements.contactName.value='订单测试';f.elements.phone.value='13800138000';f.elements.detailAddress.value='测试省测试市测试路1号';__orderMode='error';f.requestSubmit()`);
  await wait(`document.querySelector('.checkout-dialog .form-message')?.textContent.includes('测试下单失败')`);
  check('submit error preserves fields',await ev(`document.querySelector('[name="contactName"]').value==='订单测试'`));
  await ev(`__orderMode='success';const f=document.querySelector('[data-form="order"]');f.requestSubmit();f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));document.querySelector('[data-checkout-close]').click()`);
  check('cannot close during submit',await ev(`!!document.querySelector('.checkout-dialog')`));
  await wait(`location.hash==='#/order?id=81'&&!document.querySelector('.loading-state')`);
  check('one order per attempt, closes on success',await ev(`__calls.filter(x=>x.path==='/orders'&&x.method==='POST').length===2&&!document.querySelector('.checkout-dialog')`));
  check('payload preserved',await ev(`const x=JSON.parse(__calls.filter(x=>x.path==='/orders'&&x.method==='POST').at(-1).body);x.items[0].productId==41&&x.shippingAddress.contactName==='订单测试'&&x.shippingAddress.detailAddress==='测试省测试市测试路1号'`));
  await ev(`(async()=>{const {session}=await import('/src/api.js');session.clear()})()`);
  await go('product',{id:41});await ev(`document.querySelector('[data-action="checkout-open"]').click()`);
  await wait(`!!document.querySelector('[data-action="local-login"]')`);
  check('guest login remembers purchase',await ev(`sessionStorage.getItem('pc-login-return')==='#/checkout?id=41'`));
  await ev(`document.querySelector('[data-action="local-login"]').click()`);
  await wait(`!!document.querySelector('.checkout-dialog [data-form="order"]')`);
  check('login resumes product modal',await ev(`location.hash==='#/product?id=41'`));
  fs.writeFileSync(new URL('results.json', artifactDir),JSON.stringify(checks,null,2));
  console.log(JSON.stringify({total:checks.length,failed:checks.filter(x=>!x.ok)}));
  if(checks.some(x=>!x.ok))process.exitCode=1;
}finally{await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close();}
