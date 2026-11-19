const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const helper = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const destination = process.env.APPOINTMENT_ROUND4_OUTPUT || 'artifacts/appointment-flow-round4-2026-11-18';
const fixture = { exports: {} };
const setup = fs.readFileSync(helper, 'utf8').split('\n(async()=>{')[0]
  .replace('artifacts/appointment-audit-2026-11-18', destination);
vm.runInNewContext(setup + '\nmodule.exports={create,loadPage,gate};', {
  require: createRequire(helper), __dirname, module: fixture, Buffer, console,
  structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { create, loadPage, gate } = fixture.exports;
const record = { id: 'a', status: 'pending', appointmentDate: '2099-01-01', appointmentTime: '09:00-09:30' };
const basics = { getStores: async () => [], getDoctors: async () => [], getBookingSettings: async () => ({}) };
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

function detail(api) {
  const h = loadPage('detail.js', create(), { ...basics,
    getAppointmentDetail: async () => ({ data: { appointment: record } }), ...api });
  h.page.options = { id: 'a' };
  return h;
}

async function main() {
  await check('D01 门店名称接口失败不阻断已有医生列表', async observed => {
    const h = loadPage('doctor-list.js', create(), {
      getDoctors: async () => [{ id: 'd', name: '测试医生' }],
      getStores: async () => { throw Error('门店接口超时'); },
    });
    h.page.options = { storeId: 's' };
    await h.page.loadPage();
    Object.assign(observed, { doctors: h.page.data.doctors.length, error: h.page.data.loadError });
    assert.equal(observed.doctors, 1);
  });

  await check('D02 医生详情部分门店失败时保留成功门店', async observed => {
    const h = loadPage('doctor-detail.js', create(), {
      getDoctors: async () => [{ id: 'd', storeIds: ['ok', 'timeout'] }],
      getSchedules: async ({ storeId }) => {
        if (storeId === 'timeout') throw Error('超时');
        return [{ id: 'x', date: '2099-01-01', startTime: '09:00', endTime: '09:30', status: 'available' }];
      },
    });
    h.page.options = { id: 'd' };
    await h.page.loadPage();
    h.page.openBooking();
    Object.assign(observed, { rows: h.page.data.scheduleRows.length, error: h.page.data.loadError, nav: h.nav });
    assert.equal(observed.rows, 1);
    assert.match(observed.error, /部分门店/);
    assert.equal(h.nav.length, 1);
  });

  await check('D03 预约列表返回刷新失败时提示用户', async observed => {
    let calls = 0;
    const h = loadPage('booking/index.js', create(), { ...basics, getAppointments: async () => {
      if (++calls > 1) throw Error('预约列表刷新超时');
      return [record];
    } });
    await h.page.loadPage();
    await h.page.loadPage({ silent: true });
    Object.assign(observed, { calls, records: h.page.data.upcomingAppointments.length,
      error: h.page.data.loadError, toasts: h.toasts });
    assert.equal(observed.records, 1);
    assert.ok(observed.error || observed.toasts.length, '刷新失败后继续显示旧记录且无提示');
  });

  for (const page of ['booking/index.js', 'detail.js']) {
    await check('D04 连续点击取消只建立一个确认操作 ' + page, async observed => {
      let calls = 0;
      const api = { ...basics, getAppointments: async () => [record], cancelAppointment: async () => { calls++; } };
      const h = page === 'detail.js' ? detail(api) : loadPage(page, create(), api);
      await h.page.loadPage();
      const event = { detail: record };
      const first = h.page.cancelAppointment(event);
      const second = h.page.cancelAppointment(event);
      const modals = [...h.modals];
      for (const modal of modals) await modal.success({ confirm: true });
      await Promise.all([first, second]);
      Object.assign(observed, { modals: modals.length, calls, toasts: h.toasts });
      assert.equal(calls, 1);
      assert.equal(modals.length, 1);
    });

    await check('D08 取消请求进行中防重，失败后可重试 ' + page, async observed => {
      const request = gate();
      let calls = 0;
      const api = { ...basics, getAppointments: async () => [record],
        cancelAppointment: async () => {
          if (++calls === 1) {
            await request.promise;
            throw Error('取消请求超时');
          }
        } };
      const h = page === 'detail.js' ? detail(api) : loadPage(page, create(), api);
      await h.page.loadPage();
      const start = () => h.page.cancelAppointment({ detail: record });
      const first = start();
      const confirm = h.modals[0].success({ confirm: true });
      await Promise.resolve();
      await start();
      assert.equal(h.modals.length, 1);
      request.resolve();
      await Promise.all([first, confirm]);
      const retry = start();
      assert.equal(h.modals.length, 2);
      await h.modals[1].success({ confirm: true });
      await retry;
      Object.assign(observed, { calls, toasts: h.toasts });
      assert.equal(calls, 2);
      assert.ok(h.toasts.includes('取消请求超时'));
    });
  }

  await check('D05 取消弹窗等待中退出后不发请求', async observed => {
    let calls = 0;
    const session = create();
    const h = loadPage('booking/index.js', session, { ...basics, getAppointments: async () => [record], cancelAppointment: async () => { calls++; } });
    await h.page.loadPage();
    await h.page.cancelAppointment({ detail: record });
    assert.equal(h.modals.length, 1);
    session.store.logout();
    await h.modals[0].success({ confirm: true });
    observed.calls = calls;
    assert.equal(calls, 0);
  });

  await check('D06 评价写入成功但详情刷新超时，仍拦截再次提交', async observed => {
    let calls = 0;
    const h = detail({
      getAppointmentDetail: async () => {
        if (calls) throw Error('详情刷新超时');
        return { data: { appointment: { ...record, status: 'completed' } } };
      },
      submitAppointmentEvaluation: async () => { calls++; },
    });
    await h.page.loadPage();
    await h.page.submitEvaluation();
    await h.page.submitEvaluation();
    Object.assign(observed, { calls, error: h.page.data.loadError, toasts: h.toasts,
      evaluation: h.page.data.evaluation });
    assert.equal(calls, 1);
    assert.equal(observed.evaluation.rating, 5);
  });

  await check('D07 评价刷新尚未完成时继续拦截点击', async observed => {
    let calls = 0;
    const started = gate();
    const refresh = gate();
    const h = detail({
      getAppointmentDetail: async () => {
        if (calls) { started.resolve(); return refresh.promise; }
        return { data: { appointment: { ...record, status: 'completed' } } };
      },
      submitAppointmentEvaluation: async () => { calls++; },
    });
    await h.page.loadPage();
    const first = h.page.submitEvaluation();
    await started.promise;
    const second = h.page.submitEvaluation();
    refresh.resolve({ data: { appointment: { ...record, status: 'completed' }, evaluation: { rating: 5 } } });
    await Promise.all([first, second]);
    observed.calls = calls;
    assert.equal(calls, 1);
  });

  const output = path.join(__dirname, destination, 'new-cases.json');
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  for (const result of results) console.log(result.passed ? 'PASS' : 'FAIL', result.id, JSON.stringify(result.observed));
  process.exitCode = results.some(result => !result.passed) ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
