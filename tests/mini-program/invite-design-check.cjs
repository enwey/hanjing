const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const path=require('path');
const root=path.resolve('mp-weixin-rewrite');
const dir=root+'/pages/distribution/invite/';
const design=require(dir+'invite-design');
let page;
vm.runInNewContext(fs.readFileSync(dir+'index.js','utf8'),{require:n=>n==='./invite-design'?design:{},Page:p=>page=p,wx:{navigateTo:o=>{assert.equal(o.url,'/pages/distribution/rules/index');}},console});
const instance={...page,data:{...page.data,inviteCode:'HJ1234567890',inviteQrCode:'https://invalid.test/qr.png',sharePath:'/pages/index/index?inviteCode=HJ1234567890'},setData(v){Object.assign(this.data,v)}};
instance.handleQrError();assert.equal(instance.data.inviteQrCode,'');assert.equal(instance.data.inviteCode,'HJ1234567890');
assert.equal(instance.onShareAppMessage().title,design.copy.shareTitle);assert.match(instance.onShareAppMessage().path,/inviteCode=HJ/);
const template=fs.readFileSync(dir+'index.wxml','utf8');
const stack=[];for(const m of template.matchAll(/<\/?([\w-]+)\b[^>]*>/g)){if(m[0].startsWith('</'))assert.equal(stack.pop(),m[1]);else if(!m[0].endsWith('/>'))stack.push(m[1]);}assert.equal(stack.length,0);
const calls=[];const ctx=new Proxy({measureText:t=>({width:t.length*20})},{get:(o,k)=>o[k]||((...args)=>calls.push([k,...args]))});
design.drawInviteDesign(ctx,{logo:'logo',qr:'real-qr',code:'HJ1234567890'});assert(calls.some(c=>c[0]==='drawImage'&&c[1]==='real-qr'));
calls.length=0;design.drawInviteDesign(ctx,{logo:'logo',code:'HJ1234567890'});assert(calls.some(c=>c[0]==='fillText'&&c[1]==='邀请码'));assert(!calls.some(c=>c[0]==='fillText'&&c[1]==='长按识别小程序码'));
console.log('PASS: template tags, share title/path, QR failure, poster QR/fallback');
if(!process.argv.includes('--visual'))process.exit(0);
(async()=>{
const {chromium}=require('/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});const tab=await browser.newPage({viewport:{width:375,height:900},deviceScaleFactor:2});
const out=path.resolve('tests/mini-program/artifacts/invite-2026-11-05');fs.mkdirSync(out,{recursive:true});
const artwork='data:image/jpeg;base64,'+fs.readFileSync(root+'/static/images/invite-sleep-letter.jpg').toString('base64');
const logo='data:image/png;base64,'+fs.readFileSync(root+'/static/images/brand-logo-v20261105.png').toString('base64');
await tab.setContent('<canvas id="poster" width="900" height="1360"></canvas>');
await tab.evaluate(async({source,logo,artwork})=>{const module={exports:{}};eval(source);window.design=module.exports;window.logo=await new Promise(r=>{const img=new Image();img.onload=()=>r(img);img.src=logo;});window.artwork=await new Promise(r=>{const img=new Image();img.onload=()=>r(img);img.src=artwork;});window.paint=cover=>{const c=document.querySelector('canvas');c.height=1064;const raw=c.getContext('2d');const ctx=new Proxy(raw,{get:(o,k)=>k==='setFillStyle'?v=>o.fillStyle=v:k==='setFontSize'?(v,weight=400)=>o.font=weight+' '+v+'px sans-serif':typeof o[k]==='function'?o[k].bind(o):o[k]});window.design.drawInviteDesign(ctx,{logo:window.logo,artwork:window.artwork,code:cover?'':'HJ1234567890',cover});};window.paint(false);},{source:fs.readFileSync(dir+'invite-design.js','utf8'),logo,artwork});
for(const [name,cover] of [['poster',false],['share',true]]){await tab.evaluate(c=>window.paint(c),cover);const data=await tab.locator('canvas').evaluate(c=>c.toDataURL().split(',')[1]);fs.writeFileSync(out+'/'+name+'.png',Buffer.from(data,'base64'));if(cover){const jpeg=await tab.locator('canvas').evaluate(c=>c.toDataURL('image/jpeg',0.88).split(',')[1]);const bytes=Buffer.from(jpeg,'base64');assert(bytes.length<200000,'Share cover must stay below 200 KB');fs.writeFileSync(root+'/static/images/distribution-invite-share-v20261105.jpg',bytes);}}
await tab.evaluate(()=>{
 const c=document.querySelector('canvas'),raw=c.getContext('2d');
 const sample=document.createElement('canvas');sample.width=184;sample.height=184;const q=sample.getContext('2d');q.fillStyle='#eef4ff';q.fillRect(0,0,184,184);q.fillStyle='#2a52d4';q.font='20px sans-serif';q.fillText('小程序码位置',30,90);q.font='16px sans-serif';q.fillText('仅布局示意',50,120);
 const ctx=new Proxy(raw,{get:(o,k)=>k==='setFillStyle'?v=>o.fillStyle=v:k==='setFontSize'?(v,weight=400)=>o.font=weight+' '+v+'px sans-serif':typeof o[k]==='function'?o[k].bind(o):o[k]});
 window.design.drawInviteDesign(ctx,{logo:window.logo,artwork:window.artwork,qr:sample});
});
const layoutData=await tab.locator('canvas').evaluate(c=>c.toDataURL().split(',')[1]);fs.writeFileSync(out+'/qr-layout.png',Buffer.from(layoutData,'base64'));
const response=await fetch('http://127.0.0.1:5005/api/v1/distribution/rules');assert(response.ok);
const rules=require(dir+'../utils/rules').normalizeDistributionRules(await response.json());
const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const groups=[['开通条件',[rules.qualificationText||'当前暂无分销开通说明']],['佣金规则',rules.commissionRules],['推广方式',rules.promotionWays],['提现规则',rules.withdrawRules]];
const rulesHtml=groups.filter(([,items])=>items.length).map(([title,items])=>'<div class="invite-rules__section"><span class="invite-rules__heading">'+title+'</span>'+items.map(item=>'<span class="invite-rules__item">'+escapeHtml(item)+'</span>').join('')+'</div>').join('');
const previewTemplate=template.replace(/<text wx:if="\{\{rulesLoading[\s\S]*?(?=    <\/view>\n  <\/view>)/,rulesHtml);
let html=previewTemplate.replace(/<hj-navbar[^>]*\/>/,'<header>‹　邀请好友</header>').replace(/<canvas[\s\S]*?<\/canvas>/,'').replace(/<image wx:if[^>]*\/>/,'').replace(/wx:else/g,'').replace(/<image\b/g,'<img').replace(/<view\b/g,'<div').replace(/<\/view>/g,'</div>').replace(/<text\b/g,'<span').replace(/<\/text>/g,'</span>');
html=html.replace(/\{\{(.*?)\}\}/g,(_,exp)=>{try{return vm.runInNewContext(exp,{copy:design.copy,inviteCode:'HJ1234567890',inviteQrCode:'',hasLoaded:true,isSavingPoster:false,shareImagePath:'preview.png'});}catch{return '';}}).replaceAll('/static/images/brand-logo-v20261105.png',logo).replaceAll('/static/images/invite-sleep-letter.jpg',artwork).replace(/disabled="false"/g,'');
for(const width of [375,320]){await tab.setViewportSize({width,height:900});let css=fs.readFileSync(dir+'index.wxss','utf8').replace(/\bimage\b/g,'img').replace(/> view/g,'> div').replace(/([\d.]+)rpx/g,(_,n)=>Number(n)*width/750+'px');await tab.setContent('<style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}header{height:64px;padding:24px;background:white;font-size:17px}button{border:0;font-family:inherit}'+css+'</style>'+html);assert(await tab.locator('.invite-brand img').evaluate(e=>e.getBoundingClientRect().width<40 && parseFloat(getComputedStyle(e).borderRadius)>0));await tab.screenshot({path:out+'/page-'+width+'.png',fullPage:true});assert(await tab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
await browser.close();console.log('PASS: 320/375px browser previews, actual renderer poster/share exports (not native WeChat)');
})().catch(e=>{console.error(e);process.exit(1)});
