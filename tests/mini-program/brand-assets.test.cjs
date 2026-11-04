const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const root='mp-weixin-rewrite/';
const box={module:{exports:{}},require:()=>({apiBaseUrl:'https://clinic.example/api/v1'})};
vm.runInNewContext(fs.readFileSync(root+'common/utils/image-url.js','utf8'),box);
const {normalizeImageUrl,BRAND_LOGO}=box.module.exports;
test('packaged logo matches approved brand and historical URLs resolve locally',()=>{
 assert.deepEqual(fs.readFileSync(root+BRAND_LOGO),fs.readFileSync('assets/brand/logo.png'));
 for(const p of ['/static/images/brand-koala.png','/static/images/brand-logo.png','/static/icons/koala-outline.svg','/api/v1/community/brand-logo.png','/api/v1/community/brand-logo-v20261105.png','/static/demo/avatar.jpg',BRAND_LOGO]) {
  assert.equal(normalizeImageUrl(p),BRAND_LOGO);assert.equal(normalizeImageUrl('https://clinic.example'+p+'?old=1'),BRAND_LOGO);
 }
 assert.equal(normalizeImageUrl('https://cdn.example/personal.jpg'),'https://cdn.example/personal.jpg');
 assert.equal(normalizeImageUrl('/uploads/personal.jpg'),'https://clinic.example/uploads/personal.jpg');
 assert.equal(normalizeImageUrl('wxfile://personal'),'wxfile://personal');
});
for(const page of ['appointment/index.js','community/index.js'])test(page+' uses current official avatar and preserves custom user avatar',async()=>{
 let config;
 vm.runInNewContext(fs.readFileSync(root+'pages/'+page,'utf8'),{require:n=>n.includes('image-url')?box.module.exports:n.includes('date-time')?{formatChinaDateTime:()=>''}:{getCommunityPosts:async()=>({data:[{id:1,role:'admin',avatar:'https://old.example/old.png'},{id:2,role:'patient',avatar:'https://cdn.example/personal.jpg'},{id:3,role:'patient',avatar:'/static/images/brand-koala.png'}]})},Page:p=>config=p,wx:{},console});
 const instance={...config,data:JSON.parse(JSON.stringify(config.data)),setData(v){Object.assign(this.data,v)}};
 await instance.loadPosts();
 assert.equal(instance.data.posts.find(p=>p.id==='1').avatar,BRAND_LOGO);
 assert.equal(instance.data.posts.find(p=>p.id==='2').avatar,'https://cdn.example/personal.jpg');
 assert.equal(instance.data.posts.find(p=>p.id==='3').avatar,BRAND_LOGO);
});
