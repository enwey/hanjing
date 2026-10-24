const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require('../../hanjing-promoter-portal/node_modules/typescript');
const paths = ['hanjing-promoter-portal', 'hanjing-clinic-管理后台源码-20260607'];
(async () => {
  for (const path of paths) {
    const source = fs.readFileSync(`${__dirname}/../../${path}/src/utils/promoterQr.ts`, 'utf8');
    const calls = [], urls = [];
    const context = Object.fromEntries(['drawImage','save','beginPath','arc','clip','fillRect','restore'].map(k => [k, (...args) => calls.push([k,...args])]));
    const canvas = { getContext: () => context, toDataURL: type => { assert.equal(type,'image/png'); return 'data:image/png;base64,result'; } };
    class Image { naturalWidth=430; naturalHeight=430; set src(url) { urls.push(url); queueMicrotask(()=>this.onload()); } }
    const box = { exports: {}, Image, window: { setTimeout, clearTimeout }, document: { createElement: tag => { assert.equal(tag,'canvas'); return canvas; } } };
    vm.runInNewContext(ts.transpileModule(source.replace('import.meta.env.BASE_URL', "'/promoter/'"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, box);
    const result = await box.exports.brandPromoterQr('data:image/jpeg;base64,fixture');
    assert.equal(result,'data:image/png;base64,result');
    assert.equal(urls[1],'/promoter/brand-koala.png');
    assert.equal(canvas.width,430); assert.equal(canvas.height,430);
    const arc = calls.find(c=>c[0]==='arc'); assert.equal(arc[1],215); assert.equal(arc[3],94.6);
    assert.equal(calls.filter(c=>c[0]==='drawImage').length,2);
    await assert.rejects(box.exports.brandPromoterQr('https://invalid.example/qr'));
    console.log('PASS',path,'base path, central clipping, source image + logo, PNG, invalid input');
  }
})().catch(e=>{console.error(e);process.exitCode=1});
