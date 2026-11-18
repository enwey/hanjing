const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

const helper = path.join(__dirname, 'appointment-audit-2026-11-18.cjs');
const destination = process.env.APPOINTMENT_ROUND8_OUTPUT || 'artifacts/appointment-flow-round8-2026-11-18';
const fixture = { exports: {} };
const now = Date.parse('2026-11-20T05:30:00+08:00');
class Clock extends Date { static now() { return now; } }
const setup = fs.readFileSync(helper, 'utf8').split('\n(async()=>{')[0]
  .replace('artifacts/appointment-audit-2026-11-18', destination)
  .replace('Page: p =>', 'Date, Page: p =>');
vm.runInNewContext(setup + '\nmodule.exports={create,loadPage,confirmApi,members};', {
  require: createRequire(helper), __dirname, module: fixture, Date: Clock, Buffer, console,
  structuredClone, queueMicrotask, setImmediate, setTimeout, clearTimeout,
});
const { create, loadPage, confirmApi, members } = fixture.exports;
const record = { id: 'a', status: 'pending', appointmentDate: '2026-11-20', appointmentTime: '09:00-09:30' };
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

async function main() {
  for (const file of ['booking/index.js', 'detail.js']) {
    await check('H01 识别后端实际返回的文字取消时限 ' + file, async o => {
      const h = loadPage(file, create(), { ...basics,
        getBookingSettings: async () => ({ data: { cancelLimit: '就诊前4小时' } }),
        getAppointments: async () => [record],
        getAppointmentDetail: async () => ({ data: { appointment: record } }),
      });
      h.page.options = { id: 'a' };
      await h.page.loadPage();
      const action = h.page.cancelAppointment({ detail: record });
      const modals = h.modals.length;
      if (modals) await h.modals[0].success({ confirm: false });
      await action;
      Object.assign(o, { configured: '就诊前4小时', hoursUntilVisit: 3.5, modals,
        effectiveHours: file.startsWith('booking') ? h.page.data.cancelLimitHours : h.page.cancelLimitHours });
      assert.equal(modals, 0);
    });
  }

  await check('H02 取消接口采用预约设置的截止规则', async o => {
    const source = fs.readFileSync(path.join(__dirname, '../../hanjing-clinic-backend/routes/client.js'), 'utf8');
    const settings = source.match(/const cancelLimit = await getBookingCancelLimit\(\);[\s\S]*?\.\.\.cancelLimit/)?.[0] || '';
    const cancel = source.split("app.post('/api/v1/appointments/:id/cancel'")[1]?.split("app.post('/api/v1/appointments/:id/reschedule'")[0] || '';
    Object.assign(o, { configReturned: Boolean(settings),
      routeHardcodesTwoHours: /< 2 \* 60 \* 60 \* 1000/.test(cancel),
      routeReadsConfiguredLimit: cancel.includes('await getBookingCancelLimit()') });
    assert.equal(o.configReturned, true);
    assert.equal(o.routeHardcodesTwoHours, false);
    assert.equal(o.routeReadsConfiguredLimit, true);
    const helper = source.match(/async function getBookingCancelLimit\(\) \{[\s\S]*?\n\}/)[0];
    for (const [value, expected] of [['就诊前4小时', 4], ['就诊前1天', 24], ['', 2]]) {
      const readLimit = vm.runInNewContext(helper + '\ngetBookingCancelLimit', {
        get: async () => ({ key_value: value }),
      });
      const rule = await readLimit();
      const { getCancelLimitHours } = require('../../mp-weixin-rewrite/common/utils/appointment-time');
      assert.equal(rule.cancelLimitHours, expected);
      assert.equal(getCancelLimitHours({ cancelLimit: rule.cancelLimit }), expected);
    }
  });

  await check('H03 详情支付处理函数拦截不可支付收费单', async o => {
    let calls = 0;
    const h = loadPage('detail.js', create(), { ...basics,
      getAppointmentDetail: async () => ({ data: { appointment: { ...record, status: 'pending_payment',
        appointmentCharge: { canPay: false } } } }),
      payAppointmentDeposit: async () => { calls++; throw Error('收费单不可支付'); },
    });
    h.page.options = { id: 'a' };
    await h.page.loadPage();
    await h.page.payDeposit();
    Object.assign(o, { buttonVisible: h.page.data.canPay, calls, toasts: h.toasts });
    assert.equal(o.buttonVisible, false);
    assert.equal(calls, 0);
  });

  await check('H04 时段页刷新失败后提供原页重试入口', async o => {
    let calls = 0;
    const h = loadPage('time-select.js', create(), { ...basics,
      getScheduleDates: async () => {
        if (++calls === 2) throw Error('可约日期刷新超时');
        return ['2026-11-20'];
      },
      getDaySlots: async () => [{ id: 's', scheduleId: 'x', status: 'available', label: '09:00-09:30' }],
    });
    h.page.options = { doctorId: 'd', storeId: 's' };
    await h.page.loadPage();
    assert.ok(h.page.data.timeSlotSections.length);
    await h.page.loadPage({ silent: true });
    Object.assign(o, { dates: h.page.data.scheduleDates.length, slots: h.page.data.timeSlotSections.length,
      error: h.page.data.loadError, toasts: h.toasts });
    assert.ok(o.error || o.slots > 0, '时段被清空，重试按钮所在的错误区域没有显示');
    await h.page.retryLoad();
    assert.equal(h.page.data.loadError, '');
    assert.ok(h.page.data.timeSlotSections.length);
  });

  await check('H05 确认页未返回所选医生时不按零挂号费继续创建', async o => {
    const hSession = create();
    let calls = 0;
    const h = loadPage('confirm.js', hSession, { ...confirmApi(hSession),
      getDoctors: async () => [],
      getFamilyMembers: async () => members,
      createAppointment: async () => { calls++; return { data: { id: 'a', status: 'pending_payment' } }; },
    });
    await h.page.loadPage();
    await h.page.submitAppointment();
    Object.assign(o, { calls, error: h.page.data.loadError, advertisedFee: h.page.data.consultFeeAmount,
      paymentPrompt: h.modals[0]?.content });
    assert.equal(calls, 0);
  });

  await check('H06 正常收费信息在确认按钮显示合计金额', async o => {
    const session = create();
    const h = loadPage('confirm.js', session, { ...confirmApi(session),
      getDoctors: async () => [{ id: '1', consultFee: 1200 }],
      getBookingSettings: async () => ({ data: { requireDeposit: true, depositAmount: 5000 } }),
      getFamilyMembers: async () => members,
    });
    await h.page.loadPage();
    o.button = h.page.data.buttonText;
    assert.match(o.button, /¥62\.00/);
  });

  await check('H07 用户关闭取消弹窗时不发送取消请求', async o => {
    let calls = 0;
    const h = loadPage('booking/index.js', create(), { ...basics, cancelAppointment: async () => { calls++; } });
    await h.page.cancelAppointment({ detail: record });
    assert.equal(h.modals.length, 1);
    await h.modals[0].success({ confirm: false });
    o.calls = calls;
    assert.equal(calls, 0);
  });

  fs.writeFileSync(path.join(__dirname, destination, 'new-cases.json'), JSON.stringify(results, null, 2));
  for (const r of results) console.log(r.passed ? 'PASS' : 'FAIL', r.id, JSON.stringify(r.observed), r.error || '');
  process.exitCode = results.some(r => !r.passed) ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
