const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const diagnostics = require('../../mp-weixin-rewrite/pages/distribution/invite/qr-diagnostics');
function setup(info, wxExtra = {}) {
  let config, copied;
  const wx = { showToast() {}, setClipboardData: ({ data }) => copied = data, ...wxExtra };
  vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/pages/distribution/invite/index.js','utf8'), {
    Page: value => config = value, wx,
    require: name => name === './qr-diagnostics' ? diagnostics : name === './invite-service' ? { loadInviteShareInfo: info } : name === './invite-design' ? { copy: {} } : {}
  });
  return { p: { ...config, data: { ...config.data }, setData(v) { Object.assign(this.data, v); } }, copied: () => copied };
}
test('backend generation reason and interface failure remain visible and copyable', async () => {
  const {p,copied} = setup(async()=>({inviteCode:'HJ1',inviteQrCode:'',inviteQrReason:'invalid appid'}));
  await p.loadInviteInfo(); assert.match(p.data.qrDiagnosticText,/后台生成结果：invalid appid/); assert.equal(p.data.qrChecking,false);
  p.handleCopyQrDiagnostic();assert.equal(copied(),p.data.qrDiagnosticText);
  const other=setup(async()=>{throw Error('request:fail timeout')}).p;
  await other.loadInviteInfo();assert.match(other.data.qrDiagnosticText,/邀请接口异常：request:fail timeout/);
});
test('download domain error, HTTP status and decode errors are distinguishable',async()=>{
  const response=async()=>({inviteCode:'HJ1',inviteQrCode:'https://test/qr.png'});
  const p=setup(response,{downloadFile:o=>o.fail({errMsg:'downloadFile:fail url not in domain list'}),getImageInfo:o=>o.fail({errMsg:'getImageInfo:fail'})}).p;
  await p.loadInviteInfo();assert.match(p.data.qrDiagnosticText,/domain list/);assert.match(p.data.qrDiagnosticText,/未取得可显示图片/);
  const q=setup(response,{downloadFile:o=>o.success({statusCode:404}),getImageInfo:o=>o.fail({errMsg:'getImageInfo:fail'})}).p;
  await q.loadInviteInfo();assert.match(q.data.qrDiagnosticText,/图片HTTP状态：404/);
  const r=setup(response,{downloadFile:o=>o.success({statusCode:200,tempFilePath:'/tmp/qr'}),getImageInfo:o=>o.fail({errMsg:'getImageInfo:fail decode image fail'})}).p;
  await r.loadInviteInfo();assert.match(r.data.qrDiagnosticText,/图片校验失败：getImageInfo:fail decode/);
});
test('successful display and bounded sanitized diagnostic text',async()=>{
  const p=setup(async()=>({inviteCode:'HJ1',inviteQrCode:'https://test/qr.png'}),{downloadFile:o=>o.success({statusCode:200,tempFilePath:'/tmp/qr'}),getImageInfo:o=>o.success({path:'/tmp/qr',width:430,height:430})}).p;
  await p.loadInviteInfo();p.handleQrLoaded();assert.match(p.data.qrDiagnosticText,/页面显示：小程序码图片加载成功/);
  assert.equal(diagnostics.safeDetail('https://test/qr?access_token=abc#hash'),'https://test/qr');
  assert.doesNotMatch(diagnostics.safeDetail('AppSecret=abc Bearer xyz'),/abc|xyz/);
  for(let i=0;i<30;i++)p.addQrDiagnostic('test',i);assert.equal(p.data.qrDiagnosticText.split('\n').length,16);
});
test('WXML tags and diagnostic actions are well formed',()=>{
  const s=fs.readFileSync('mp-weixin-rewrite/pages/distribution/invite/index.wxml','utf8'),stack=[];
  for(const m of s.matchAll(/<\/?([\w-]+)\b[^>]*>/g)){if(m[0].startsWith('</'))assert.equal(stack.pop(),m[1]);else if(!m[0].endsWith('/>'))stack.push(m[1]);}
  assert.equal(stack.length,0);assert.match(s,/bindload="handleQrLoaded"/);assert.match(s,/bindtap="handleCopyQrDiagnostic"/);
});
