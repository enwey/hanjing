const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const helper = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const destination = process.env.APPOINTMENT_ROUND6_OUTPUT || 'artifacts/appointment-flow-round6-2026-11-18';
const fixture = { exports: {} };
const setup = fs.readFileSync(helper, 'utf8').split('\n(async()=>{')[0]
  .replace('artifacts/appointment-audit-2026-11-18', destination)
  .replace('Page: p =>', 'Date, Page: p =>');
let now = Date.parse('2026-11-20T05:30:00+08:00');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
vm.runInNewContext(setup + '\nmodule.exports={create,loadPage};', {
  require: createRequire(helper), __dirname, module: fixture, Date: Clock, Buffer, console,
  structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { create, loadPage } = fixture.exports;
const record = { id: 'a', doctorId: 'd', storeId: 's', status: 'pending',
  appointmentDate: '2026-11-20', appointmentTime: '09:00-09:30' };
const basics = { getBookingSettings: async () => ({}), getStores: async () => [], getDoctors: async () => [] };
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

function openPage(file, status, overrides = {}) {
  const h = loadPage(file, create(), { ...basics,
    getAppointmentDetail: async () => ({ data: { appointment: { ...record, status } } }), ...overrides });
  h.page.options = { id: 'a' };
  return h;
}

async function main() {
  for (const status of ['pending', 'checked_in', 'refunded']) {
    await check('F01 结果页按状态展示 ' + status, async o => {
      const h = openPage('success.js', status);
      await h.page.loadPage();
      Object.assign(o, { error: h.page.data.loadError, record: h.page.data.appointment?.status || null });
      if (status === 'refunded') {
        assert.equal(o.record, null);
        assert.match(o.error, /已退款/);
      } else {
        assert.equal(o.record, status);
        assert.equal(o.error, '');
        if (status === 'checked_in') assert.equal(h.page.data.resultTitle, '就诊中');
      }
    });
  }

  await check('F02 结果页首次超时后具备原页恢复能力', async o => {
    let calls = 0;
    const h = openPage('success.js', 'pending', { getAppointmentDetail: async () => {
      if (++calls === 1) throw Error('预约结果请求超时');
      return { data: { appointment: record } };
    } });
    await h.page.loadPage();
    assert.equal(h.page.data.loadError, '预约结果请求超时');
    await h.page.onShow();
    const layout = fs.readFileSync(path.join(__dirname, '../../mp-weixin-rewrite/pages/appointment/success.wxml'), 'utf8');
    const errorBranch = layout.match(/wx:elif="\{\{loadError\}\}"[\s\S]*?<\/view>/)?.[0] || '';
    Object.assign(o, { calls, error: h.page.data.loadError, retry: /重试/.test(errorBranch) });
    assert.ok(o.retry || calls > 1, '结果页无重试且再次显示未发起加载');
    await h.page.retryLoad();
    assert.equal(calls, 2);
    assert.equal(h.page.data.appointment.status, 'pending');
    o.recovered = true;
  });

  await check('F03 已提醒状态在详情中不应提供后端不支持的改约入口', async o => {
    const h = openPage('detail.js', 'reminded');
    await h.page.loadPage();
    Object.assign(o, { status: h.page.data.statusKey, sharedFooter: h.page.data.showRescheduleCancelFooter });
    if (o.sharedFooter) h.page.openReschedule();
    o.navigation = h.nav;
    assert.equal(h.page.data.canReschedule, false);
    assert.equal(h.nav.length, 0);
  });

  await check('F04 预约详情本身成功且设置超时时仍能查看记录', async o => {
    let calls = 0;
    const h = openPage('detail.js', 'completed', {
      getAppointmentDetail: async () => {
        calls++;
        return { data: { appointment: { ...record, status: 'completed', patientName: '测试就诊人' } } };
      },
      getBookingSettings: async () => { throw Error('预约设置请求超时'); },
    });
    await h.page.loadPage();
    Object.assign(o, { calls, loaded: h.page.data.appointmentLoaded, error: h.page.data.loadError });
    assert.equal(o.loaded, true);
  });

  await check('F05 改约入口和提交检查使用一致的时限', async o => {
    const h = openPage('detail.js', 'pending', { getBookingSettings: async () => ({ data: { cancelLimitHours: 4 } }) });
    await h.page.loadPage();
    h.page.openReschedule();
    const source = fs.readFileSync(path.join(__dirname, '../../hanjing-clinic-backend/routes/client.js'), 'utf8');
    const route = source.split("app.post('/api/v1/appointments/:id/reschedule'")[1]?.split('const newSchedule')[0] || '';
    Object.assign(o, { hoursUntilVisit: 3.5, setting: 4, navigation: h.nav, toasts: h.toasts,
      serverUsesTwoHours: /< 2 \* 60 \* 60 \* 1000/.test(route) });
    assert.equal(o.serverUsesTwoHours, true);
    assert.equal(h.nav.length, 1, '原预约还有3.5小时，入口按4小时拒绝，后端改约规则为2小时');
    const list = openPage('booking/index.js', 'pending', {
      getBookingSettings: async () => ({ data: { cancelLimitHours: 4 } }),
      getAppointments: async () => [record],
    });
    await list.page.loadPage();
    await list.page.handlePrimaryAction({ detail: record });
    await list.page.cancelAppointment({ detail: record });
    Object.assign(o, { listNavigation: list.nav, listCancelModals: list.modals.length });
    assert.equal(list.nav.length, 1);
    assert.equal(list.modals.length, 0);
  });

  for (const status of ['checked_in', 'refunded']) {
    await check('F06 详情已签到和退款不显示操作 ' + status, async o => {
      const h = openPage('detail.js', status);
      await h.page.loadPage();
      Object.assign(o, { status: h.page.data.statusKey, footer: h.page.data.showRescheduleCancelFooter,
        canCancel: h.page.data.canCancel });
      assert.equal(o.status, status);
      assert.equal(o.footer, false);
      assert.equal(o.canCancel, false);
    });
  }

  await check('F07 登录后预约列表正常加载并区分退款记录', async o => {
    const h = openPage('booking/index.js', 'pending', {
      getAppointments: async () => [record, { ...record, id: 'r', status: 'refunded' }],
    });
    await h.page.loadPage();
    Object.assign(o, { upcoming: h.page.data.upcomingAppointments.map(item => item.status),
      history: h.page.data.historyAppointments.map(item => item.status) });
    assert.equal(o.upcoming.join(','), 'pending');
    assert.equal(o.history.join(','), 'refunded');
  });

  fs.writeFileSync(path.join(__dirname, destination, 'new-cases.json'), JSON.stringify(results, null, 2));
  for (const r of results) console.log(r.passed ? 'PASS' : 'FAIL', r.id, JSON.stringify(r.observed), r.error || '');
  process.exitCode = results.some(r => !r.passed) ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
