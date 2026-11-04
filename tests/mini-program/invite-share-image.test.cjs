const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const design=require('../../mp-weixin-rewrite/pages/distribution/invite/invite-design');
function setup(){let config;vm.runInNewContext(fs.readFileSync('mp-weixin-rewrite/pages/distribution/invite/index.js','utf8'),{require:n=>n==='./invite-design'?design:{},Page:p=>config=p,wx:{showLoading(){},hideLoading(){},showToast(){}}});return {...config,data:{...config.data,inviteCode:'HJtest',inviteQrCode:'qr'},setData(v){Object.assign(this.data,v)}};}
test('share and album use the same image, concurrent requests draw once',async()=>{
 const p=setup();let count=0,saved;p.drawInvitePoster=async()=>{count++;return '/tmp/invite.png';};
 const paths=await Promise.all([p.prepareInviteImage(),p.prepareInviteImage()]);assert.equal(count,1);assert.equal(paths[0],paths[1]);assert.equal(p.onShareAppMessage().imageUrl,paths[0]);
 p.ensureAlbumPermission=async()=>{};p.savePosterImage=async path=>saved=path;p.showPosterSavedNotice=async()=>{};
 await p.handleSavePoster();assert.equal(saved,p.onShareAppMessage().imageUrl);assert.equal(count,1);
 p.data.inviteCode='HJnext';await p.prepareInviteImage();assert.equal(count,2);
});
test('failed rendering can retry without caching a broken image',async()=>{
 const p=setup();p.drawInvitePoster=async()=>{throw Error('load failed')};await assert.rejects(p.prepareInviteImage());assert.equal(p.imageFlight,null);assert.equal(p.data.shareImagePath,'');
 p.drawInvitePoster=async()=>'/tmp/retry.png';assert.equal(await p.prepareInviteImage(),'/tmp/retry.png');
});
test('QR sits inside artwork lower right with white padding and identical rendering modes',()=>{
 function render(cover){const calls=[];const ctx=new Proxy({},{get:(_,k)=>(...args)=>calls.push([k,...args])});design.drawInviteDesign(ctx,{logo:'logo',artwork:'art',qr:'qr',cover});return calls;}
 const poster=render(false);assert.deepEqual(poster,render(true));const qr=poster.find(c=>c[0]==='drawImage'&&c[1]==='qr');assert.deepEqual(qr,['drawImage','qr',668,832,184,184]);assert.equal(900-qr[2]-qr[4],48);assert.equal(1064-qr[3]-qr[5],48);
});
