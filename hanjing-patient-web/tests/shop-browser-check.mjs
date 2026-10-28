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
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/#/products'});await wait(`!!document.querySelector('.shop-product')`);check('real catalog covers every product',await ev(`document.querySelectorAll('.shop-product').length===document.querySelectorAll('.shop-cover').length`));await shot('shop-real-list');await ev(`(document.querySelector('.shop-product img')?.closest('a')||document.querySelector('.shop-product a')).click()`);await wait(`!!document.querySelector('.shop-detail-top')`);await shot('shop-real-detail');
 const data=structuredClone(fixtures);const product={...data['/products/61'],id:61,name:'睡眠健康服务套餐',category:'service',imageUrl:'',price:19900,originalPrice:29900,stock:20,salesCount:128,description:'# 产品介绍\n'+ '舒适佩戴与睡眠健康指导'.repeat(25)+'\n![详情图片](/brand/logo.svg)\n## 使用说明\n完整的使用说明与售后服务。',galleryUrls:[]};data['/products']=[product,{...product,id:62,name:'无图器械商品名称需要保持最多两行显示避免超长标题撑开卡片',category:'device',originalPrice:19900}, {...product,id:63,name:'图片加载失败',imageUrl:'/missing-test-product.jpg',category:'accessory'},{...product,id:64,name:'同分类推荐服务'}];data['/products/61']=product;
 await ev(`window.__fixture=${JSON.stringify(data)};window.__realFetch=fetch;window.fetch=async(input,opts={})=>{const u=new URL(input,location.origin);if(!u.pathname.startsWith('/api/v1/'))return __realFetch(input,opts);return new Response(JSON.stringify({code:0,data:__fixture[u.pathname.slice(7)]??[]}))}`);
 await go('home');await go('products');await wait(`document.querySelectorAll('.shop-product').length===4`);await wait(`!document.querySelector('img[src="/missing-test-product.jpg"]')`);
 check('no-image and broken-image covers keep mini category colors',await ev(`const x=[...document.querySelectorAll('.shop-cover')];x.length===4&&getComputedStyle(x[0]).backgroundColor==='rgb(255, 241, 214)'&&getComputedStyle(x[2]).backgroundColor==='rgb(223, 244, 232)'&&!x[2].querySelector('img')`));
 check('catalog matches sales price discount hierarchy',await ev(`document.querySelector('.shop-product').textContent.includes('已售 128')&&document.querySelector('.shop-discount')&&document.querySelector('.shop-product del')`));check('catalog order entry is a button',await ev(`!!document.querySelector('.pc-page-head a.btn[href="#/orders"]')`));
 check('card titles limited to two lines and prices reserve equal height',await ev(`const a=[...document.querySelectorAll('.shop-product')];a.every(x=>getComputedStyle(x.querySelector('h3')).webkitLineClamp==='2'&&x.querySelector('h3').getBoundingClientRect().height===48)&&Math.abs(a[0].getBoundingClientRect().height-a[1].getBoundingClientRect().height)<1&&a.every(x=>x.querySelector('.shop-original-price').getBoundingClientRect().height===18)`));await shot('shop-fixture-list');
 await go('product',{id:'61'});check('description uses first 144 text characters',await ev(`Array.from(document.querySelector('.shop-description').textContent).length===144&&!document.querySelector('.shop-description').textContent.includes('![详情图片]')`));
 check('full rich description includes ending and image',await ev(`document.querySelector('.shop-rich-content').textContent.includes('完整的使用说明与售后服务。')&&document.querySelector('.shop-rich-content img').getAttribute('src')==='/brand/logo.svg'`));
 check('detail fallback matches category and purchase keeps checkout',await ev(`getComputedStyle(document.querySelector('.shop-cover-detail')).backgroundColor==='rgb(255, 241, 214)'&&document.querySelector('.shop-buy-bar a').getAttribute('href').includes('checkout?id=61')`));
 check('HTML rich text strips scripts and unsafe attributes',await ev(`(async()=>{const m=await import('/src/shop.js');const html=m.productRichText('<p onclick="bad()">测试</p><img src="javascript:bad()" onerror="bad()"><script>bad()</script><p>结束</p>');return html.includes('结束')&&!html.includes('script')&&!html.includes('onclick')&&!html.includes('javascript:')&&!html.includes('onerror')})()`));
 await ev(`__fixture['/products/61'].galleryUrls=['/brand/logo.svg'];__fixture['/products/61'].imageUrl='/missing-detail-test.jpg'`);await go('products');await go('product',{id:'61'});await wait(`!document.querySelector('.shop-cover-detail img')`);await ev(`document.querySelectorAll('[data-action="product-gallery"]')[1].click()`);await wait(`document.querySelector('.shop-cover-detail img')?.complete`);check('gallery recovers after main image fails',await ev(`document.querySelector('.shop-cover-detail img').getAttribute('src')==='/brand/logo.svg'`));
check('detail has separated purchase content and recommendation sections',await ev(`document.querySelector('.shop-detail-panel').nextElementSibling.classList.contains('shop-related')&&getComputedStyle(document.querySelector('.shop-detail-top')).gridTemplateColumns.split(' ').length===2&&document.querySelector('.shop-detail-info').firstElementChild.tagName==='H1'`));
 check('detail cover is compact',await ev(`const r=document.querySelector('.shop-cover-detail').getBoundingClientRect();r.width<=320&&r.height<=320`));
 check('related list excludes current and other categories',await ev(`const a=[...document.querySelectorAll('.shop-related .shop-product-link')];a.length===1&&a[0].getAttribute('href').includes('id=64')`));
 await shot('shop-detail-1440');await ev(`document.querySelector('.shop-related').scrollIntoView({block:'center'})`);await shot('shop-related');await ev(`scrollTo(0,0)`);await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});check('detail has no narrow horizontal overflow',await ev(`document.documentElement.scrollWidth<=innerWidth+1`));await shot('shop-detail-390');
 await go('products');check('mobile catalog has two columns',await ev(`getComputedStyle(document.querySelector('.compact-products')).gridTemplateColumns.split(' ').length===2`));await shot('shop-list-390');
 fs.writeFileSync('../tests/patient-web/artifacts/treatment-2026-10-28/shop-browser-results.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
} finally {await browser.send('Target.closeTarget',{targetId});tab.ws.close();browser.ws.close()}
