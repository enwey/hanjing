const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const helper = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const destination = process.env.APPOINTMENT_ROUND5_OUTPUT || 'artifacts/appointment-flow-round5-2026-11-18';
const fixture = { exports: {} };
const setup = fs.readFileSync(helper, 'utf8').split('\n(async()=>{')[0]
  .replace('artifacts/appointment-audit-2026-11-18', destination)
  .replace('Page: p =>', 'Date, Page: p =>');
let now = Date.parse('2026-11-20T06:59:00+08:00');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
vm.runInNewContext(setup + '\nmodule.exports={create,loadPage,confirmApi,members};', {
  require: createRequire(helper), __dirname, module: fixture, Date: Clock, Buffer, console,
  structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { create, loadPage, confirmApi, members } = fixture.exports;
const results = [];
const record = { id: 'a', doctorId: 'd', storeId: 's', status: 'pending',
  appointmentDate: '2026-11-20', appointmentTime: '09:00-09:30' };

async function check(id, run) {
  const observed = {};
  try {
    await run(observed);
    results.push({ id, passed: true, observed });
  } catch (error) {
    results.push({ id, passed: false, observed, error: error.message });
  }
}

function reschedule(status = 'pending', overrides = {}) {
  const h = loadPage('reschedule.js', create(), {
    getAppointmentDetail: async () => ({ data: { appointment: { ...record, status } } }),
    getScheduleDates: async () => ['2026-11-21'],
    getSchedules: async () => [{ id: 'schedule', status: 'available' }],
    getTimeSlots: async () => [{ id: 'slot', label: '10:00-10:30', status: 'available' }],
    ...overrides,
  });
  h.page.options = { id: 'a' };
  return h;
}

function chooseSlot(page) {
  page.selectTimeSlot({ currentTarget: { dataset: { timeSlotId: 'slot' } } });
}

async function main() {
  await check('E01 改约页面跨过截止后应在提交时拦截', async o => {
    let calls = 0;
    const h = reschedule('pending', { rescheduleAppointment: async () => {
      calls++; throw Error('距离预约时间已不足2小时，不支持修改就诊时间');
    } });
    await h.page.loadPage();
    chooseSlot(h.page);
    assert.equal(h.page.data.selectedTimeSlotId, 'slot');
    now = Date.parse('2026-11-20T07:01:00+08:00');
    await h.page.submitReschedule();
    Object.assign(o, { calls, toasts: h.toasts });
    assert.equal(calls, 0);
  });

  await check('E02 改约刷新发现预约已取消应阻止提交', async o => {
    let status = 'pending';
    let calls = 0;
    const h = reschedule(status, {
      getAppointmentDetail: async () => ({ data: { appointment: { ...record, status } } }),
      rescheduleAppointment: async () => { calls++; throw Error('该预约状态下不支持修改就诊时间'); },
    });
    now = Date.parse('2026-11-20T06:59:00+08:00');
    await h.page.loadPage();
    status = 'cancelled';
    await h.page.onShow();
    chooseSlot(h.page);
    await h.page.submitReschedule();
    Object.assign(o, { status, selected: h.page.data.selectedTimeSlotId, calls, toasts: h.toasts });
    assert.equal(calls, 0);
  });

  const recovery = {
    getAppointmentDetail: { data: { appointment: record } },
    getScheduleDates: ['2026-11-21'],
    getSchedules: [{ id: 'schedule', status: 'available' }],
    getTimeSlots: [{ id: 'slot', label: '10:00-10:30', status: 'available' }],
  };
  for (const apiName of Object.keys(recovery)) {
    await check('E03 改约请求超时后原页有重试入口 ' + apiName, async o => {
      let calls = 0;
      const h = reschedule('pending', { [apiName]: async () => {
        if (++calls === 1) throw Error('网络超时');
        return recovery[apiName];
      } });
      await h.page.loadPage();
      const layout = fs.readFileSync(path.join(__dirname, '../../mp-weixin-rewrite/pages/appointment/reschedule.wxml'), 'utf8');
      const errorBranch = layout.match(/wx:elif="\{\{loadError\}\}"[\s\S]*?<\/view>/)?.[0] || '';
      Object.assign(o, { error: h.page.data.loadError, retryInErrorState: /bindtap=/.test(errorBranch),
        refreshOnReturn: !!h.page.hasLoaded });
      assert.equal(o.error, '网络超时');
      assert.equal(o.retryInErrorState, true);
      assert.equal(h.page.data.canRetryLoad, true);
      await h.page.retryLoad();
      assert.equal(h.page.data.loadError, '');
      chooseSlot(h.page);
      assert.equal(h.page.data.selectedTimeSlotId, 'slot');
      o.recovered = true;
    });
  }

  await check('E04 改约无可选日期不会发请求', async o => {
    let calls = 0;
    const h = reschedule('pending', { getScheduleDates: async () => [],
      rescheduleAppointment: async () => { calls++; } });
    await h.page.loadPage();
    await h.page.submitReschedule();
    Object.assign(o, { date: h.page.data.selectedDate, calls, toasts: h.toasts });
    assert.equal(calls, 0);
  });

  await check('E05 确认页资料请求超时后原页有重试入口', async o => {
    const session = create();
    let calls = 0;
    const h = loadPage('confirm.js', session, { ...confirmApi(session),
      getFamilyMembers: async () => {
        if (++calls === 1) throw Error('就诊人加载超时');
        return members;
      } });
    await h.page.loadPage();
    const layout = fs.readFileSync(path.join(__dirname, '../../mp-weixin-rewrite/pages/appointment/confirm.wxml'), 'utf8');
    const errorBranch = layout.match(/class="state-card" wx:if="\{\{loadError\}\}"[\s\S]*?<\/view>/)?.[0] || '';
    Object.assign(o, { error: h.page.data.loadError, retryInErrorState: /bindtap=/.test(errorBranch) });
    assert.equal(o.error, '就诊人加载超时');
    assert.equal(o.retryInErrorState, true);
    assert.equal(h.page.data.canRetryLoad, true);
    await h.page.retryLoad();
    assert.equal(h.page.data.loadError, '');
    assert.equal(h.page.data.memberList.length, members.length);
    o.recovered = true;
  });

  await check('E06 预约确认成功后两次提交只创建一次', async o => {
    const session = create();
    let calls = 0;
    const h = loadPage('confirm.js', session, { ...confirmApi(session), getFamilyMembers: async () => members,
      createAppointment: async () => { calls++; return { data: { id: 'new', status: 'pending' } }; } });
    await h.page.loadPage();
    await h.page.submitAppointment();
    await h.page.submitAppointment();
    Object.assign(o, { calls, navigation: h.nav });
    assert.equal(calls, 1);
  });

  await check('E07 已取消预约进入结果页不会显示成功', async o => {
    const h = loadPage('success.js', create(), { getBookingSettings: async () => ({}), getStores: async () => [],
      getAppointmentDetail: async () => ({ data: { appointment: { ...record, status: 'cancelled' } } }) });
    h.page.options = { id: 'a' };
    await h.page.loadPage();
    o.error = h.page.data.loadError;
    assert.equal(o.error, '该预约已取消');
  });

  fs.writeFileSync(path.join(__dirname, destination, 'new-cases.json'), JSON.stringify(results, null, 2));
  for (const r of results) console.log(r.passed ? 'PASS' : 'FAIL', r.id, JSON.stringify(r.observed), r.error || '');
  process.exitCode = results.some(r => !r.passed) ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
