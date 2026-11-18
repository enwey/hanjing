const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

process.env.TZ = 'Asia/Tokyo';
const now = Date.parse('2026-11-18T15:30:00Z');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const helper = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const fixture = { exports: {} };
const originalOutput = 'artifacts/appointment-flow-round3-2026-11-18';
const output = path.join(__dirname, process.env.APPOINTMENT_ROUND3_OUTPUT || originalOutput);
const setup = fs.readFileSync(helper, 'utf8').split('\n(async()=>{')[0]
  .replace('artifacts/appointment-audit-2026-11-18', process.env.APPOINTMENT_ROUND3_OUTPUT || originalOutput)
  .replace('Page: p =>', 'Date, Page: p =>');
vm.runInNewContext(setup + '\nmodule.exports={create,loadPage,gate};', {
  require: createRequire(helper), __dirname, module: fixture, Date: Clock, Buffer, console,
  structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { create, loadPage, gate } = fixture.exports;
const results = [];
const doctor = { id: 'd', name: '测试医生', storeIds: ['s'] };
const dailySchedule = { id: 'schedule', date: '2026-11-18', startTime: '23:45', endTime: '23:59', status: 'available' };

async function check(id, run) {
  const observed = {};
  try {
    await run(observed);
    results.push({ id, passed: true, observed });
  } catch (error) {
    results.push({ id, passed: false, observed, error: error.message });
  }
}

function doctorDetail(api, storeId = 's') {
  const harness = loadPage('doctor-detail.js', create(), { getDoctors: async () => [doctor], ...api });
  harness.page.options = { id: 'd', storeId };
  return harness;
}

async function main() {
  await check('C01 医生详情按北京时间查询当天排班', async observed => {
    const h = doctorDetail({ getSchedules: async ({ startDate }) => {
      observed.startDate = startDate;
      return startDate <= dailySchedule.date ? [dailySchedule] : [];
    } }, '');
    await h.page.loadPage();
    h.page.openBooking();
    Object.assign(observed, { canBook: h.page.data.hasFutureSchedules, navigation: h.nav });
    assert.equal(observed.startDate, dailySchedule.date);
    assert.equal(observed.canBook, true);
  });

  for (const storeId of ['s', '']) {
    await check('C02 医生详情排班故障可区别于无排班 ' + (storeId ? '指定门店' : '全部门店'), async observed => {
      let calls = 0;
      const h = doctorDetail({ getSchedules: async () => {
        if (++calls === 1) throw Error('排班请求超时');
        return [dailySchedule];
      } }, storeId);
      await h.page.loadPage();
      Object.assign(observed, { doctorLoaded: h.page.data.doctorLoaded, rows: h.page.data.scheduleRows.length,
        canBook: h.page.data.hasFutureSchedules, error: h.page.data.loadError || '', toasts: h.toasts });
      assert.ok(observed.error || observed.toasts.length, '故障降级为无排班且无反馈');
      await h.page.retryLoad();
      assert.equal(h.page.data.loadError, '');
      assert.equal(h.page.data.hasFutureSchedules, true);
      observed.retryRecovered = true;
    });
  }

  await check('C03 医生资料故障显示错误并可重试', async observed => {
    let calls = 0;
    const h = doctorDetail({ getDoctors: async () => {
      if (++calls === 1) throw Error('医生请求超时');
      return [doctor];
    }, getSchedules: async () => [] });
    try { await h.page.loadPage(); } catch (error) { observed.rejected = error.message; }
    Object.assign(observed, { error: h.page.data.loadError || '', toasts: h.toasts, retry: typeof h.page.retryLoad });
    assert.ok(observed.error || observed.toasts.length, '医生请求失败未由页面处理');
    await h.page.retryLoad();
    assert.equal(h.page.data.doctorLoaded, true);
    assert.equal(h.page.data.loadError, '');
    observed.retryRecovered = true;
  });

  await check('C04 医生后来返回的旧排班不能盖掉新排班', async observed => {
    const old = gate();
    const started = gate();
    let calls = 0;
    const h = doctorDetail({ getSchedules: () => {
      if (++calls === 2) { started.resolve(); return old.promise; }
      return Promise.resolve([]);
    } });
    await h.page.loadPage();
    const first = h.page.onShow();
    await started.promise;
    await h.page.onShow();
    assert.equal(h.page.data.hasFutureSchedules, false);
    old.resolve([{ ...dailySchedule, date: '2026-11-19' }]);
    await first;
    Object.assign(observed, { calls, canBook: h.page.data.hasFutureSchedules });
    assert.equal(observed.canBook, false);
  });

  await check('C05 医生确实无排班时阻止预约', async observed => {
    const h = doctorDetail({ getSchedules: async () => [] });
    await h.page.loadPage();
    h.page.openBooking();
    Object.assign(observed, { doctorLoaded: h.page.data.doctorLoaded, navigation: h.nav });
    assert.equal(observed.doctorLoaded, true);
    assert.equal(h.nav.length, 0);
  });

  await check('C06 医生详情带门店进入时段页', async observed => {
    const h = doctorDetail({ getSchedules: async () => [{ ...dailySchedule, date: '2026-11-19' }] });
    await h.page.loadPage();
    h.page.openBooking();
    observed.navigation = h.nav;
    assert.equal(h.nav[0], '/pages/appointment/time-select?doctorId=d&storeId=s');
  });

  await check('C07 时段故障后重新加载，恢复可点选', async observed => {
    let calls = 0;
    const h = loadPage('time-select.js', create(), {
      getDoctors: async () => [doctor], getScheduleDates: async () => ['2026-11-18'],
      getDaySlots: async () => {
        if (++calls === 1) throw Error('时段加载超时');
        return [{ id: 'slot', scheduleId: 'schedule', label: '23:45-23:59', status: 'available' }];
      },
    });
    h.page.options = { doctorId: 'd', storeId: 's' };
    await h.page.loadPage();
    assert.equal(h.page.data.loadError, '时段加载超时');
    await h.page.loadPage();
    h.page.handleTimeSlotTap({ currentTarget: { dataset: { timeSlotId: 'slot' } } });
    Object.assign(observed, { calls, navigation: h.nav, draftDate: h.draftStore.getDraft().appointmentDate });
    assert.equal(h.page.data.loadError, '');
    assert.equal(h.nav.length, 1);
    assert.equal(observed.draftDate, '2026-11-18');
  });

  await check('C08 改约所选日期失效后回退到原预约日', async observed => {
    let dates = ['2026-11-20', '2026-11-21'];
    const h = loadPage('reschedule.js', create(), {
      getAppointmentDetail: async () => ({ data: { appointment: { id: 'a', doctorId: 'd', storeId: 's',
        appointmentDate: '2026-11-20', appointmentTime: '09:00-09:30' } } }),
      getScheduleDates: async () => dates,
      getSchedules: async ({ startDate }) => [{ id: startDate, status: 'available' }],
      getTimeSlots: async () => [{ id: 'slot', label: '10:00-10:30', status: 'available' }],
    });
    h.page.options = { id: 'a' };
    await h.page.loadPage();
    await h.page.selectDate({ detail: '2026-11-21' });
    assert.equal(h.page.data.selectedDate, '2026-11-21');
    dates = ['2026-11-20'];
    await h.page.onShow();
    observed.date = h.page.data.selectedDate;
    assert.equal(observed.date, '2026-11-20');
    assert.equal(h.page.data.selectedTimeSlotId, '');
  });

  await check('C09 已完成预约连续点击只发一次评价', async observed => {
    const pending = gate();
    let calls = 0;
    const h = loadPage('detail.js', create(), {
      getBookingSettings: async () => ({}),
      getAppointmentDetail: async () => ({ data: { appointment: { id: 'a', status: 'completed' } } }),
      submitAppointmentEvaluation: () => { calls++; return pending.promise; },
    });
    h.page.options = { id: 'a' };
    await h.page.loadPage();
    const first = h.page.submitEvaluation();
    const second = h.page.submitEvaluation();
    pending.resolve({});
    await Promise.all([first, second]);
    Object.assign(observed, { calls, toasts: h.toasts });
    assert.equal(calls, 1);
  });

  await check('C10 评价失败后可以重试', async observed => {
    let calls = 0;
    const h = loadPage('detail.js', create(), {
      getBookingSettings: async () => ({}),
      getAppointmentDetail: async () => ({ data: { appointment: { id: 'a', status: 'completed' },
        evaluation: calls > 1 ? { rating: 5 } : null } }),
      submitAppointmentEvaluation: async () => {
        if (++calls === 1) throw Error('评价请求超时');
      },
    });
    h.page.options = { id: 'a' };
    await h.page.loadPage();
    await h.page.submitEvaluation();
    assert.equal(h.page.data.evaluationSubmitting, false);
    await h.page.submitEvaluation();
    await h.page.submitEvaluation();
    Object.assign(observed, { calls, toasts: h.toasts });
    assert.equal(calls, 2);
    assert.deepEqual(Array.from(h.toasts), ['评价请求超时', '评价已提交']);
  });

  fs.writeFileSync(path.join(output, 'new-cases.json'), JSON.stringify(results, null, 2));
  for (const result of results) console.log(result.passed ? 'PASS' : 'FAIL', result.id, JSON.stringify(result.observed));
  process.exitCode = results.some(result => !result.passed) ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
