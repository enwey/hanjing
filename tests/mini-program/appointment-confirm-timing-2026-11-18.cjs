const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const file = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const artifact = process.env.APPOINTMENT_TIMING_OUTPUT || 'artifacts/appointment-confirm-timing-2026-11-18';
const fixture = { exports: {} };
const source = fs.readFileSync(file, 'utf8').split('\n(async()=>{')[0]
  .replaceAll('artifacts/appointment-audit-2026-11-18', artifact)
  .replace('requestSubscribe: async () => {}', 'requestSubscribe: options.requestSubscribe || (async () => {})');
vm.runInNewContext(source + '\nmodule.exports={create,loadPage,confirmApi,gate,tick};', {
  require: require('node:module').createRequire(file), __dirname, module: fixture,
  Buffer, console, structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { create, loadPage, confirmApi, gate, tick } = fixture.exports;
const self = {id:'self',name:'本人',relation:'self',age:30};
const child = {id:'child',name:'孩子',relation:'child',age:12};
const adult = {id:'adult',name:'家人',relation:'parent',age:50};
function setup(options) {
  const h = create();
  const api = confirmApi(h);
  api.getFamilyMembers = async () => ({data:[self,child,adult]});
  const submitted = [];
  api.createAppointment = async payload => {
    submitted.push(payload.patientId);
    return {data:{id:'fixture',status:'pending'}};
  };
  return {s:loadPage('confirm.js', h, api, options),api,submitted};
}
const results = [];
async function check(id, fn) {
  const observed = {};
  try { await fn(observed); results.push({id,passed:true,observed}); }
  catch (e) { results.push({id,passed:false,error:e.message,observed}); }
}
(async () => {
  await check('TIMING-01 child confirmation after list reorder retains intended patient', async observed => {
    const {s,api,submitted} = setup();
    await s.page.loadPage();
    s.page.handleMemberChange({detail:{value:1}});
    assert.equal(s.modals.length,1);
    api.getFamilyMembers = async () => ({data:[self,adult,child]});
    await s.page.loadPage({silent:true});
    s.modals[0].success({confirm:true});
    await s.page.submitAppointment();
    observed.submitted = submitted;
    assert.deepEqual(submitted,['child']);
  });
  await check('TIMING-02 unchanged draft reload during subscription preserves submission', async observed => {
    const g = gate();
    const {s,submitted} = setup({requestSubscribe:()=>g.promise});
    const readDraft = s.draftStore.getDraft;
    s.draftStore.getDraft = () => structuredClone(readDraft());
    await s.page.loadPage();
    const pending = s.page.submitAppointment();
    await tick();
    await s.page.loadPage({silent:true});
    g.resolve();
    await pending;
    Object.assign(observed,{submitted,toasts:s.toasts,navigations:s.nav.length});
    assert.deepEqual(submitted,['self']);
  });
  await check('TIMING-03 normal child modal confirms selected patient', async () => {
    const {s,submitted} = setup();
    await s.page.loadPage();
    s.page.handleMemberChange({detail:{value:1}});
    s.modals[0].success({confirm:true});
    await s.page.submitAppointment();
    assert.deepEqual(submitted,['child']);
  });
  await check('TIMING-04 changed slot requires explicit resubmission', async () => {
    const g = gate();
    const {s,submitted} = setup({requestSubscribe:()=>g.promise});
    await s.page.loadPage();
    const pending = s.page.submitAppointment();
    await tick();
    s.draftStore.setDraft({...s.draftStore.getDraft(), scheduleId:'new'});
    await s.page.loadPage();
    g.resolve();
    await pending;
    assert.deepEqual(submitted,[]);
    assert.ok(s.toasts.some(title=>title.includes('预约信息已变更')));
  });
  fs.writeFileSync(path.join(__dirname,artifact,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
  process.exitCode = results.some(r=>!r.passed) ? 1 : 0;
})().catch(e=>{console.error(e);process.exitCode=1;});
