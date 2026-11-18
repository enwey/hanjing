const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const file = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const fixture = { exports: {} };
const artifact = process.env.APPOINTMENT_FOLLOWUP_OUTPUT || 'artifacts/appointment-followup-2026-11-18';
const source = fs.readFileSync(file, 'utf8').split('\n(async()=>{')[0]
  .replaceAll('artifacts/appointment-audit-2026-11-18', artifact);
vm.runInNewContext(source + '\nmodule.exports={create,loadPage,confirmApi,members};', {
  require: require('node:module').createRequire(file), __dirname, module: fixture,
  Buffer, console, structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { create, loadPage, confirmApi, members } = fixture.exports;
const results = [];
async function check(id, fn) {
  const observed = {};
  try { await fn(observed); results.push({ id, passed: true, observed }); }
  catch (e) { results.push({ id, passed: false, error: e.message, observed }); }
}
async function slots(nextDates, fail) {
  const a = '2099-01-01', b = '2099-01-02';
  let refresh = false;
  const page = loadPage('time-select.js', create(), {
    getScheduleDates: async () => ({data: refresh ? nextDates : [a]}),
    getDoctors: async () => ({data: [{id: '1', name: '医生'}]}),
    getDaySlots: async ({date}) => {
      if (refresh && fail) throw Error('请求超时');
      return {data: [{id: date, scheduleId: date === a ? 'old' : 'new', label: '09:00-09:30', status: 'available'}]};
    },
  });
  page.page.options = {doctorId:'1', storeId:'1'};
  await page.page.loadPage();
  assert.equal(page.page.data.selectedDate, a);
  refresh = true;
  await page.page.loadPage({silent: true});
  return page;
}
function tapOld(s) {
  s.page.handleTimeSlotTap({currentTarget:{dataset:{timeSlotId:'2099-01-01'}}});
}
(async () => {
  await check('FOLLOW-01 changed date and failed slot refresh', async observed => {
    const s = await slots(['2099-01-02'], true);
    tapOld(s);
    Object.assign(observed, {date:s.page.data.selectedDate, loading:s.page.data.loadingSchedules,
      error:s.page.data.loadError, navigations:s.nav.length, draft:s.nav.length ? s.draftStore.getDraft() : null});
    assert.equal(s.nav.length, 0);
  });
  await check('FOLLOW-02 no remaining dates clears old slots', async observed => {
    const s = await slots([], false);
    Object.assign(observed, {date:s.page.data.selectedDate, sections:s.page.data.timeSlotSections.length});
    assert.equal(s.page.data.timeSlotSections.length, 0);
  });
  await check('FOLLOW-03 successful refresh rejects old slot', async () => {
    const s = await slots(['2099-01-02'], false);
    tapOld(s);
    assert.equal(s.nav.length, 0);
  });
  await check('FOLLOW-04 lost creation response does not create a second unresolved submission', async observed => {
    const h = create({response: () => ({statusCode:200,data:{data:members}})});
    const api = confirmApi(h);
    let requests = 0;
    api.createAppointment = async () => {
      if (++requests === 1) throw Error('请求超时');
      return {data:{id:'fixture',status:'pending'}};
    };
    const s = loadPage('confirm.js', h, api);
    await s.page.loadPage();
    await s.page.submitAppointment();
    await s.page.submitAppointment();
    const reopened = loadPage('confirm.js', h, api);
    await reopened.page.loadPage();
    await reopened.page.submitAppointment();
    Object.assign(observed, {requests, toasts:s.toasts});
    assert.equal(requests, 1);
  });
  await check('FOLLOW-05 reused unpaid booking opens records without payment prompt', async () => {
    const h = create({response: () => ({statusCode:200,data:{data:members}})});
    const api = confirmApi(h);
    api.createAppointment = async () => ({data:{id:'existing',status:'pending_payment',reused:true}});
    const s = loadPage('confirm.js', h, api);
    await s.page.loadPage();
    await s.page.submitAppointment();
    assert.equal(s.modals.length, 0);
    assert.equal(s.nav[0], '/pages/appointment/booking/index?tab=mine');
  });
  fs.writeFileSync(path.join(__dirname, artifact, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
  process.exitCode = results.some(r => !r.passed) ? 1 : 0;
})().catch(e => {console.error(e); process.exitCode = 1;});
