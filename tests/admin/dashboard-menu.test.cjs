const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const path=require('path');
const admin=path.resolve(__dirname,'../../hanjing-clinic-管理后台源码-20260607');
process.chdir(admin);
const adminRequire=require('module').createRequire(path.join(admin,'package.json'));
const {parse,compileTemplate,compileScript}=adminRequire('@vue/compiler-sfc');
const ts=adminRequire('typescript');
for(const file of ['src/layouts/BasicLayout.vue','src/views/login/index.vue','src/views/dashboard/index.vue']){
 const {descriptor,errors}=parse(fs.readFileSync(file,'utf8'));assert.equal(errors.length,0);
 assert.equal(compileTemplate({source:descriptor.template.content,filename:file,id:'test'}).errors.length,0);
 compileScript(descriptor,{id:'test'});
}
const context={exports:{}};vm.createContext(context);
vm.runInContext(ts.transpileModule(fs.readFileSync('src/utils/menu.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
for(const user of [{role_code:'doctor',permissions:['appointment:view']},{role_code:'other',permissions:[]},{role_code:'super_admin'}]){
 const groups=context.exports.visibleMenuGroups(user);
 assert.equal(context.exports.firstMenuPath(user),groups[0].items[0].path);
}
const filtered=context.exports.visibleMenuGroups({role_code:'doctor',permissions:[]});
assert.equal(filtered.flatMap(g=>g.items).length,1);
console.log('PASS: three Vue components compile; first visible menu for three permission sets; no role fallback');
