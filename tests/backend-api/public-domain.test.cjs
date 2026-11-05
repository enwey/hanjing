const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const front=require('../../mp-weixin-rewrite/common/config/asset-url');
const mod=()=>import('../../hanjing-clinic-backend/public-urls.js');
test('production defaults and old aliases resolve to one canonical HTTPS origin',async()=>{
 const {getPublicOrigin,PRODUCTION_ORIGIN}=await mod();
 assert.equal(getPublicOrigin(null,{NODE_ENV:'production'}),PRODUCTION_ORIGIN);
 assert.equal(getPublicOrigin(null,{NODE_ENV:'production',PUBLIC_BASE_URL:'https://m.hanjinghealth.com/api/v1'}),PRODUCTION_ORIGIN);
 assert.equal(getPublicOrigin(null,{NODE_ENV:'production',API_PUBLIC_BASE_URL:'https://m.xingkangming.com/'}),PRODUCTION_ORIGIN);
 const env=fs.readFileSync('mp-weixin-rewrite/common/config/env.js','utf8');assert.ok(env.includes(PRODUCTION_ORIGIN+'/api/v1'));
});
test('invalid/conflicting production configuration cannot silently generate wrong URLs',async()=>{
 const {getPublicOrigin}=await mod();
 assert.throws(()=>getPublicOrigin(null,{NODE_ENV:'production',PUBLIC_BASE_URL:'http://localhost:5005'}));
 assert.throws(()=>getPublicOrigin(null,{PUBLIC_BASE_URL:'https://a.example',API_PUBLIC_BASE_URL:'https://b.example'}));
 for(const v of ['ftp://a.test','https://name:password@a.test','https://a.test/wrong','https://a.test?token=secret'])assert.throws(()=>getPublicOrigin(null,{PUBLIC_BASE_URL:v}));
});
test('local request origin and configured local API prefix remain usable',async()=>{
 const {getPublicOrigin}=await mod();
 assert.equal(getPublicOrigin({protocol:'http',get:()=> '127.0.0.1:5005'},{NODE_ENV:'development'}),'http://127.0.0.1:5005');
 assert.equal(getPublicOrigin(null,{PUBLIC_BASE_URL:'http://localhost:5005/api/v1'}),'http://localhost:5005');
});
test('server and client migrate owned assets and preserve external URLs and signed queries',async()=>{
 const {normalizeOwnedAsset}=await mod();const origin='https://m.xingkangming.com';
 for(const input of ['https://m.hanjinghealth.com/uploads/a.png?asset_token=abc#x','http://m.hanjinghealth.com/static/demo/doctor-1.jpg']){
  const expected=input.replace(/^https?:\/\/m.hanjinghealth.com/,origin);
  assert.equal(normalizeOwnedAsset(input,origin),expected);assert.equal(front.normalizeAssetUrl(input,origin+'/api/v1'),expected);
 }
 for(const input of ['https://cdn.test/uploads/a.png','https://m.hanjinghealth.com.evil.test/uploads/a.png','https://m.hanjinghealth.com/news','/uploads/a.png','data:image/png;base64,xx']){
  assert.equal(normalizeOwnedAsset(input,origin),input);assert.equal(front.normalizeAssetUrl(input,origin+'/api/v1'),input);
 }
 const input={list:[{avatar:'https://m.hanjinghealth.com/uploads/a.png'}]};assert.equal(front.normalizeAssets(input,origin+'/api/v1').list[0].avatar,origin+'/uploads/a.png');assert.ok(input.list[0].avatar.includes('hanjinghealth'));
});
test('response middleware changes historical resources without mutating payload or dates',async()=>{
 const {normalizeAssetResponses}=await mod();let result;const date=new Date();class RowDataPacket { constructor() { this.avatar='https://m.hanjinghealth.com/uploads/user.png'; } }
 const body={image:'https://m.hanjinghealth.com/uploads/a.png?asset_token=xyz',date,row:new RowDataPacket()};
 const res={json:v=>result=v};normalizeAssetResponses({get:()=> 'localhost:5005',protocol:'http'},res,()=>{});res.json(body);
 assert.equal(result.image,'http://localhost:5005/uploads/a.png?asset_token=xyz');assert.equal(result.date,date);assert.equal(result.row.avatar,'http://localhost:5005/uploads/user.png');assert.ok(body.image.includes('hanjinghealth'));
});
test('admin production API uses existing same-origin proxy, not placeholder domain or double API prefix',()=>{
 for (const project of ['hanjing-clinic-管理后台源码-20260607','hanjing-promoter-portal']) {
   const source=fs.readFileSync(project+'/src/utils/request.ts','utf8');
   assert.ok(source.includes("import.meta.env.PROD ? '' : (import.meta.env.VITE_API_BASE_URL || '')"));
 }
});
