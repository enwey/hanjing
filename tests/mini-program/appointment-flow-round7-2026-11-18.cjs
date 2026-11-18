const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const helper = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const destination = process.env.APPOINTMENT_ROUND7_OUTPUT || 'artifacts/appointment-flow-round7-2026-11-18';
const fixture = { exports: {} };
const now = Date.parse('2026-11-20T05:30:00+08:00');
class Clock extends Date {
  static now() { return now; }
}
const setup = fs.readFileSync(helper, 'utf8').split('\n(async()=>{')[0]
  .replace('artifacts/appointment-audit-2026-11-18', destination)
  .replace('Page: p =>', 'Date, Page: p =>');
vm.runInNewContext(setup + '\nmodule.exports={create,loadPage,confirmApi,members};', {
  require: createRequire(helper), __dirname, module: fixture, Date: Clock, Buffer, console,
  structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { create, loadPage, confirmApi, members } = fixture.exports;
const record = { id: 'a', status: 'pending', appointmentDate: '2026-11-20', appointmentTime: '09:00-09:30' };
const response = appointment => ({ data: { appointment } });
const defaults = { getBookingSettings: async () => ({}), getStores: async () => [], getDoctors: async () => [],
  getAppointmentDetail: async () => response(record) };
const results = [];

async function check(id, run) {
  const observed = {};
  try {
    await run(observed);
    results.push({ id, passed: true, observed });
  } catch (error) {
    results.push({ id, passed: false, observed, error: error.message });
  }
}

function page(file, api = {}) {
  const h = loadPage(file, create(), { ...defaults, ...api });
  h.page.options = { id: 'a', doctorId: 'd', storeId: 's' };
  return h;
}

async function main() {
  await check('G01 详情首次超时恢复网络后可原页重试', async o => {
    let calls = 0;
    const h = page('detail.js', { getAppointmentDetail: async () => {
      if (++calls === 1) throw Error('详情请求超时');
      return response(record);
    } });
    await h.page.loadPage();
    assert.equal(h.page.data.loadError, '详情请求超时');
    await h.page.onShow();
    const layout = fs.readFileSync(path.join(__dirname, '../../mp-weixin-rewrite/pages/appointment/detail.wxml'), 'utf8');
    const errorBranch = layout.match(/wx:elif="\{\{loadError\}\}"[\s\S]*?<\/view>/)?.[0] || '';
    Object.assign(o, { calls, retry: /bindtap=/.test(errorBranch), loaded: h.page.data.appointmentLoaded });
    assert.ok(o.retry || o.loaded);
    await h.page.retryLoad();
    assert.equal(h.page.data.appointmentLoaded, true);
    o.recovered = true;
  });

  await check('G02 已显示的详情刷新失败时用户收到提示', async o => {
    let calls = 0;
    const h = page('detail.js', { getAppointmentDetail: async () => {
      if (++calls > 1) throw Error('详情刷新超时');
      return response(record);
    } });
    await h.page.loadPage();
    await h.page.onShow();
    const layout = fs.readFileSync(path.join(__dirname, '../../mp-weixin-rewrite/pages/appointment/detail.wxml'), 'utf8');
    Object.assign(o, { calls, retained: h.page.data.appointmentLoaded, error: h.page.data.loadError, toasts: h.toasts,
      errorBelowExclusiveBranch: /wx:if="\{\{appointmentLoaded\}\}"/.test(layout) && /wx:elif="\{\{loadError\}\}"/.test(layout) });
    assert.equal(o.retained, true);
    assert.ok(o.toasts.length || !o.errorBelowExclusiveBranch);
  });

  for (const file of ['detail.js', 'booking/index.js']) {
    await check('G03 设置短暂超时应保留已知的取消时限 ' + file, async o => {
      let calls = 0;
      const h = page(file, {
        getAppointments: async () => [record],
        getBookingSettings: async () => {
          if (++calls > 1) throw Error('设置超时');
          return { data: { cancelLimitHours: 4 } };
        },
      });
      await h.page.loadPage();
      const isList = file.startsWith('booking');
      const limit = () => isList ? h.page.data.cancelLimitHours : h.page.cancelLimitHours;
      assert.equal(limit(), 4);
      await h.page.loadPage({ silent: true });
      const cancellation = h.page.cancelAppointment({ detail: record });
      const modals = h.modals.length;
      if (modals) await h.modals[0].success({ confirm: false });
      await cancellation;
      Object.assign(o, { firstLimit: 4, refreshedLimit: limit(), modals, toasts: h.toasts });
      assert.equal(o.refreshedLimit, 4);
      assert.equal(modals, 0);
    });
  }

  await check('G04 从列表发起支付应尊重收费单不可支付状态', async o => {
    let calls = 0;
    const appointment = { ...record, status: 'pending_payment', appointmentCharge: { canPay: false } };
    const h = page('booking/index.js', {
      getAppointments: async () => [appointment],
      payAppointmentDeposit: async () => { calls++; throw Error('收费单不可支付'); },
    });
    await h.page.loadPage();
    await h.page.handlePrimaryAction({ detail: h.page.data.upcomingAppointments[0] });
    Object.assign(o, { calls, toasts: h.toasts });
    assert.equal(calls, 0);
  });

  await check('G05 时段页刷新失败有提示并可重新加载', async o => {
    let calls = 0;
    const h = page('time-select.js', {
      getScheduleDates: async () => {
        if (++calls === 2) throw Error('日期刷新超时');
        return ['2026-11-20'];
      },
      getDaySlots: async () => [{ id: 's', scheduleId: 'schedule', label: '09:00-09:30', status: 'available' }],
    });
    await h.page.loadPage();
    await h.page.loadPage({ silent: true });
    assert.ok(h.toasts.includes('日期刷新超时'));
    await h.page.loadPage();
    Object.assign(o, { calls, date: h.page.data.selectedDate, sections: h.page.data.timeSlotSections.length });
    assert.ok(o.sections > 0);
  });

  await check('G06 确认页复用既有预约时不发起支付', async o => {
    const session = create();
    let calls = 0;
    const h = loadPage('confirm.js', session, { ...confirmApi(session), getFamilyMembers: async () => members,
      createAppointment: async () => ({ data: { id: 'a', reused: true, status: 'pending_payment' } }),
      payAppointmentDeposit: async () => { calls++; } });
    await h.page.loadPage();
    await h.page.submitAppointment();
    Object.assign(o, { calls, modals: h.modals.length, navigation: h.nav });
    assert.equal(calls, 0);
    assert.equal(o.modals, 0);
    assert.ok(h.nav.some(url => url.includes('/booking/')));
  });

  await check('G07 已退款结果明确提示且不进入重试流程', async o => {
    const h = page('success.js', { getAppointmentDetail: async () => response({ ...record, status: 'refunded' }) });
    await h.page.loadPage();
    Object.assign(o, { error: h.page.data.loadError, retry: h.page.data.canRetryLoad });
    assert.match(o.error, /已退款/);
    assert.equal(o.retry, false);
  });

  fs.writeFileSync(path.join(__dirname, destination, 'new-cases.json'), JSON.stringify(results, null, 2));
  for (const r of results) console.log(r.passed ? 'PASS' : 'FAIL', r.id, JSON.stringify(r.observed), r.error || '');
  process.exitCode = results.some(r => !r.passed) ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
