const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup(info, wxExtra = {}) {
  let config;
  vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/pages/distribution/invite/index.js','utf8'), {
    Page: value => config = value, wx: { showToast() {}, ...wxExtra },
    require: name => name === './invite-service' ? { loadInviteShareInfo: info } : name === './invite-design' ? { copy: {} } : {}
  });
  return { ...config, data: { ...config.data }, setData(v) { Object.assign(this.data, v); } };
}
test('QR download and local cache work after diagnostic removal', async () => {
  let downloads = 0;
  const p = setup(async()=>({inviteCode:'HJ1',inviteQrCode:'https://example.test/qr.png'}), {
    downloadFile:o=>{downloads++;o.success({statusCode:200,tempFilePath:'/tmp/qr'});},
    getImageInfo:o=>o.success({path:o.src})
  });
  await p.loadInviteInfo(); assert.equal(p.data.inviteQrCode,'/tmp/qr');
  await p.loadInviteInfo(); assert.equal(downloads,1);
  assert.equal(p.inviteLoading,false); assert.equal(p.data.qrDiagnosticText,undefined);
});
test('failed image retries and preserves invite code; failed request releases guard',async()=>{
  let downloads=0;
  const p=setup(async()=>({inviteCode:'HJ1',inviteQrCode:'https://example.test/qr.png'}), {
    downloadFile:o=>{downloads++;o.fail({errMsg:'downloadFile:fail'});},getImageInfo:o=>o.fail({errMsg:'decode fail'})
  });
  await p.loadInviteInfo(); assert.equal(downloads,2);assert.equal(p.data.inviteQrCode,'');assert.equal(p.data.inviteCode,'HJ1');assert.equal(p.inviteLoading,false);
  const q=setup(async()=>{throw Error('timeout')});await q.loadInviteInfo();assert.equal(q.inviteLoading,false);
});
test('template remains balanced with no diagnostic controls or orphaned module',()=>{
  const dir='mp-weixin-rewrite/pages/distribution/invite/';
  const s=fs.readFileSync(dir+'index.wxml','utf8'),stack=[];
  for(const m of s.matchAll(/<\/?([\w-]+)\b[^>]*>/g)){if(m[0].startsWith('</'))assert.equal(stack.pop(),m[1]);else if(!m[0].endsWith('/>'))stack.push(m[1]);}
  assert.equal(stack.length,0);assert.doesNotMatch(s,/diagnostic|诊断|handleRetryQr|handleQrLoaded/i);
  assert.equal(fs.existsSync(dir+'qr-diagnostics.js'),false);
});
test('combined packaged image and audio resources stay below 200 KiB',()=>{
  const extensions=/\.(jpg|jpeg|png|svg|webp|gif|flac|m4a|ogg|ape|amr|wma|wav|mp3|mp4|aac|aiff|caf)$/i;
  function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
  const assets=walk('mp-weixin-rewrite').filter(p=>extensions.test(p));
  assert(assets.length>0);
  const total=assets.reduce((sum,p)=>sum+fs.statSync(p).size,0);
  assert(total<200*1024,`Combined media size ${total} bytes exceeds 200 KiB`);
  console.log(`Checked ${assets.length} packaged media resources; combined ${total} bytes`);
});
