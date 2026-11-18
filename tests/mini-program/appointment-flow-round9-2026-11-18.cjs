const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const helper = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const destination = process.env.APPOINTMENT_ROUND9_OUTPUT || 'artifacts/appointment-flow-round9-2026-11-18';
const fixture = { exports: {} };
const setup = fs.readFileSync(helper, 'utf8').split('\n(async()=>{')[0]
  .replace('artifacts/appointment-audit-2026-11-18', destination);
vm.runInNewContext(setup + '\nmodule.exports={create,loadPage,confirmApi,members,gate};', {
  require: createRequire(helper), __dirname, module: fixture, Buffer, console,
  structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { create, loadPage, confirmApi, members, gate } = fixture.exports;
const record = { id: 'a', appointmentDate: '2099-01-01', appointmentTime: '09:00-09:30' };
const detailTemplate = fs.readFileSync(path.join(__dirname, '../../mp-weixin-rewrite/pages/appointment/detail.wxml'), 'utf8');
const { getCancelLimitHours } = require('../../mp-weixin-rewrite/common/utils/appointment-time');
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

function detail(appointment, overrides = {}) {
  const h = loadPage('detail.js', create(), {
    getBookingSettings: async () => ({}),
    getAppointmentDetail: async () => ({ data: { appointment } }),
    ...overrides,
  });
  h.page.options = { id: 'a' };
  return h;
}

async function main() {
  await check('I01 已提醒预约的取消入口与后端状态一致', async o => {
    const h = detail({ ...record, status: 'reminded' }, {
      cancelAppointment: async () => { o.calls++; throw Error('该预约状态下不支持取消'); },
    });
    const source = fs.readFileSync(path.join(__dirname, '../../hanjing-clinic-backend/routes/client.js'), 'utf8');
    const route = source.split("app.post('/api/v1/appointments/:id/cancel'")[1]?.split("app.post('/api/v1/appointments/:id/reschedule'")[0];
    const workflow = fs.readFileSync(path.join(__dirname, '../../hanjing-clinic-backend/appointment-workflow.js'), 'utf8');
    const statuses = workflow.match(/RESCHEDULABLE_STATUSES = new Set\(\[([^\]]+)\]/)?.[1] || '';
    await h.page.loadPage();
    Object.assign(o, { calls: 0, canCancel: h.page.data.canCancel && h.page.data.canCancelOrReschedule &&
      h.page.data.showRescheduleCancelFooter, backendAllows: !route.includes('RESCHEDULABLE_STATUSES.has(appt.status)') ||
      statuses.includes("'reminded'") });
    if (o.canCancel) {
      const action = h.page.cancelAppointment();
      await h.modals[0].success({ confirm: true });
      await action;
    }
    o.toasts = h.toasts;
    assert.equal(o.canCancel, o.backendAllows);
  });

  await check('I02 不可支付的待支付预约在详情仍可取消', async o => {
    const h = detail({ ...record, status: 'pending_payment', appointmentCharge: { canPay: false } });
    await h.page.loadPage();
    assert.match(detailTemplate, /wx:if="\{\{canPay \|\| showRescheduleCancelFooter\}\}"[\s\S]*?bindtap="cancelAppointment"/);
    Object.assign(o, { canPay: h.page.data.canPay, canCancel: h.page.data.canCancel,
      showFooter: h.page.data.showRescheduleCancelFooter });
    assert.equal(o.canPay, false);
    assert.equal(o.canCancel, true);
    assert.equal(o.showFooter, true);
  });

  await check('I03 详情确认取消前刷新到已取消时不再发送请求', async o => {
    let status = 'pending';
    let calls = 0;
    const h = detail(record, {
      getAppointmentDetail: async () => ({ data: { appointment: { ...record, status } } }),
      cancelAppointment: async () => { calls++; throw Error('该预约状态下不支持取消'); },
    });
    await h.page.loadPage();
    const action = h.page.cancelAppointment();
    assert.equal(h.modals.length, 1);
    status = 'cancelled';
    await h.page.onShow();
    await h.modals[0].success({ confirm: true });
    await action;
    Object.assign(o, { status: h.page.data.statusKey, calls, toasts: h.toasts });
    assert.equal(o.status, 'cancelled');
    assert.equal(calls, 0);
  });

  await check('I04 建单返回最新费用时支付弹窗应采用该金额', async o => {
    const session = create();
    const h = loadPage('confirm.js', session, {
      ...confirmApi(session),
      getDoctors: async () => [{ id: '1', consultFee: 1200 }],
      getFamilyMembers: async () => members,
      createAppointment: async () => ({ data: { id: 'a', status: 'pending_payment',
        consultFee: 3000, requireDeposit: true, depositAmount: 5000 } }),
    });
    await h.page.loadPage();
    await h.page.submitAppointment();
    o.prompt = h.modals[0]?.content;
    assert.match(o.prompt, /¥80\.00/);
  });

  await check('I05 取消规则兼容数字、天数和默认值', async o => {
    o.hours = [getCancelLimitHours({ cancelLimitHours: 4 }), getCancelLimitHours({ cancelLimit: '就诊前1天' }),
      getCancelLimitHours({ cancelLimit: '未知' })];
    assert.deepEqual(o.hours, [4, 24, 2]);
  });

  await check('I06 取消确认框关闭后可重新发起取消', async o => {
    const h = detail({ ...record, status: 'pending' });
    await h.page.loadPage();
    const first = h.page.cancelAppointment();
    await h.modals[0].success({ confirm: false });
    await first;
    const second = h.page.cancelAppointment();
    o.modals = h.modals.length;
    assert.equal(o.modals, 2);
    await h.modals[1].success({ confirm: false });
    await second;
  });

  await check('I07 时段重试过程中忽略较旧的日期返回', async o => {
    const older = gate();
    let calls = 0;
    const h = loadPage('time-select.js', create(), {
      getScheduleDates: async () => (++calls === 1 ? older.promise : ['2099-01-02']),
      getDoctors: async () => [],
      getDaySlots: async () => [],
    });
    h.page.options = { doctorId: 'd', storeId: 's' };
    const first = h.page.loadPage();
    await h.page.retryLoad();
    older.resolve(['2099-01-01']);
    await first;
    o.date = h.page.data.selectedDate;
    assert.equal(o.date, '2099-01-02');
  });

  fs.writeFileSync(path.join(__dirname, destination, 'new-cases.json'), JSON.stringify(results, null, 2));
  for (const r of results) console.log(r.passed ? 'PASS' : 'FAIL', r.id, JSON.stringify(r.observed), r.error || '');
  process.exitCode = results.some(r => !r.passed) ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
