import assert from 'node:assert/strict';
import test from 'node:test';

import { load } from './treatment-page-harness.mjs';

const record = { deviceModel: 'D1', doctorAdvice: '复查', isRealTreatmentRecord: true };
const entries = [{ date: '2026-11-18', wearDuration: 8, painScore: 0 }];
const event = (range) => ({ currentTarget: { dataset: { range } } });
const tick = () => new Promise(setImmediate);
test('首页未登录不取数据', () => {
  const { page, calls } = load('', {}, false);
  page.onShow();
  assert.equal(page.data.isLoggedIn, false);
  assert.equal(calls.length, 0);
});

test('首页选择本人、切换家人、进入日历和两类睡眠页面', async () => {
  const { page, calls, storage } = load('');
  page.onShow();
  await tick();
  assert.equal(page.data.heroDeviceText, 'D1');
  assert.equal(calls.find(({ key }) => key === 'getTreatmentRecord').params.patientId, 'A');
  await page.handleMemberChange({ detail: { value: 1 } });
  assert.equal(storage.get('rewrite_current_patient_id'), 'B');
  assert.equal(calls.filter(({ key }) => key === 'getTreatmentRecord').at(-1).params.patientId, 'B');
  page.goCalendar();
  page.goSleepTrend();
  page.goSleepReport();
  assert.deepEqual(calls.filter(({ url }) => url).map(({ url }) => url), ['calendar', 'sleep-trend', 'sleep-report'].map((name) => `/pages/treatment/${name}/index`));
});

test('无设备治疗记录时首页显示未开始', async () => {
  const { page } = load('', { getTreatmentRecord: () => null, getWearingRecords: () => [], getWearingSummary: () => ({}) });
  await page.loadPage();
  assert.equal(page.data.heroBadgeText, '未开始');
});

test('首页仅在存在主治医生姓名时显示主治信息', async () => {
  for (const [doctorName, expected] of [['张三', '主治：张三 医生'], ['', ''], ['   ', ''], ['--', ''], [null, '']]) {
    const { page } = load('', { getTreatmentRecord: () => ({ ...record, doctorName }) });
    await page.loadPage();
    assert.equal(page.data.heroDoctorText, expected);
  }
});

for (const name of ['', 'calendar', 'sleep-trend', 'sleep-report', 'timeline', 'doctor-advice', 'adjust-detail']) {
  const fail = () => { throw new Error('模拟接口故障'); };
  test(`${name || '首页'} 首次加载失败显示错误`, async () => {
    const { page } = load(name, { getFamilyMembers: fail, getWearingRecords: fail, getTreatmentRecord: fail, getSleepReport: fail });
    await (name ? page.onShow() : page.loadPage());
    assert.equal(page.data.loading, false);
    assert.equal(page.data.loadError, '模拟接口故障');
  });
}

for (const [name, verify] of [
  ['calendar', (page) => assert.ok(page.data.dayCells.length >= 28)],
  ['sleep-trend', (page) => assert.equal(page.data.chartItems[0].durationLabel, '8')],
  ['sleep-report', (page) => assert.equal(page.data.report.score, 90)],
  ['timeline', (page) => assert.equal(page.data.hasLoaded, true)],
  ['doctor-advice', (page) => assert.equal(page.data.adviceSections[0].content, '复查')],
  ['adjust-detail', (page) => assert.equal(page.data.adjustmentHistory[0].value, '2 mm')],
]) {
  test(`${name} 成功加载及治疗人参数`, async () => {
    const { page, calls } = load(name);
    await page.onShow();
    assert.equal(page.data.loading, false);
    assert.ok(calls.length);
    assert.ok(calls.filter(({ key }) => key !== 'getFamilyMembers').every(({ params }) => params.patientId === (name === 'adjust-detail' ? 'B' : 'A')));
    verify(page);
  });
}

test('日历打卡失败保留表单，重试成功，同步触发只提交一次', async () => {
  let attempts = 0;
  const { page, calls, toasts } = load('calendar', { submitWearingCheckin: () => {
    if (++attempts === 1) throw new Error('模拟保存失败');
    return {};
  } });
  await page.onShow();
  page.openCheckinModal();
  page.setData({ selectedWearDuration: 8, selectedPainScore: 0, checkinNote: '复测' });
  await page.submitCheckin();
  assert.equal(page.data.checkinVisible, true);
  assert.equal(page.data.isSubmittingCheckin, false);
  assert.equal(toasts[0].title, '模拟保存失败');
  await Promise.all([page.submitCheckin(), page.submitCheckin()]);
  const writes = calls.filter(({ key }) => key === 'submitWearingCheckin');
  assert.equal(writes.length, 2);
  assert.equal(writes[1].params.patientId, 'A');
  assert.equal(writes[1].params.wearDuration, 8);
  assert.equal(writes[1].params.painScore, 0);
  assert.equal(writes[1].params.note, '复测');
  assert.equal(page.data.checkinVisible, false);
  assert.equal(toasts[1].title, '打卡成功');
});

test('睡眠报告快速切换后保留最新范围的分数', async () => {
  let finishWeek;
  const oldResponse = new Promise((resolve) => { finishWeek = resolve; });
  const { page } = load('sleep-report', { getSleepReport: ({ range }) => range === 'week' ? oldResponse : { score: 92 } });
  const loading = page.onShow();
  await tick();
  await page.selectDateRange(event('month'));
  assert.equal(page.data.report.score, 92);
  finishWeek({ score: 61 });
  await loading;
  assert.equal(page.data.selectedRange, 'month');
  assert.equal(page.data.report.rangeLabel, '过去30天');
  assert.equal(page.data.report.score, 92);
});

test('从日历返回睡眠趋势保留本月筛选', async () => {
  const { page } = load('sleep-trend');
  await page.onShow();
  page.switchToMonth();
  assert.equal(page.data.selectedRange, 'month');
  page.openCalendar();
  await page.onShow();
  assert.equal(page.data.selectedRange, 'month');
});

test('首页慢响应不会用旧治疗人资料覆盖新治疗人', async () => {
  let finishOld;
  const oldResponse = new Promise((resolve) => { finishOld = resolve; });
  let slow = false;
  const { page } = load('', { getTreatmentRecord: ({ patientId }) => {
    if (slow && patientId === 'A') return oldResponse;
    return { ...record, deviceModel: `设备-${patientId}` };
  } });
  await page.loadPage();
  slow = true;
  const loading = page.loadPage({ silent: true });
  await tick();
  await page.handleMemberChange({ detail: { value: 1 } });
  assert.equal(page.data.heroDeviceText, '设备-B');
  finishOld({ ...record, deviceModel: '设备-A' });
  await loading;
  assert.equal(page.selectedPatientId, 'B');
  assert.equal(page.data.heroDeviceText, '设备-B');
});


test('首页切到家人后，日历读取和打卡都使用家人 ID', async () => {
  const storage = new Map();
  const { page: home } = load('', {}, true, storage);
  await home.loadPage();
  await home.handleMemberChange({ detail: { value: 1 } });
  home.goCalendar();
  const { page, calls } = load('calendar', {}, true, storage);
  await page.onShow();
  page.openCheckinModal();
  await page.submitCheckin();
  assert.deepEqual(calls.filter(({ key }) => ['getWearingRecords', 'submitWearingCheckin'].includes(key)).map(({ params }) => params.patientId), ['B', 'B', 'B']);
});

test('睡眠趋势本月图表排除上月记录', async () => {
  const { page } = load('sleep-trend', { getWearingRecords: () => [
    ...entries, { date: '2026-10-31', wearDuration: 6, painScore: 1 },
  ] });
  await page.onShow();
  page.switchToMonth();
  assert.equal(page.data.chartItems.map(({ dateLabel }) => dateLabel).join(','), '11-18');
  assert.equal(page.data.wornDaysLabel, '1');
  assert.equal(page.data.avgDurationLabel, '8');
  assert.equal(page.data.complianceLabel, '5');
});


test('切换治疗人失败保留原治疗人及打卡归属', async () => {
  const { page, calls, storage } = load('', {
    getTreatmentRecord: ({ patientId }) => {
      if (patientId === 'B') throw new Error('家人资料加载失败');
      return record;
    },
  });
  await page.loadPage();
  await page.handleMemberChange({ detail: { value: 1 } });
  assert.equal(page.selectedPatientId, 'A');
  assert.equal(page.data.memberIndex, 0);
  assert.equal(storage.get('rewrite_current_patient_id'), 'A');
  await page.submitCheckin();
  assert.equal(calls.find(({ key }) => key === 'submitWearingCheckin').params.patientId, 'A');
});

test('切换到30天失败时不显示旧7天报告', async () => {
  const { page } = load('sleep-report', {
    getSleepReport: ({ range }) => {
      if (range === 'month') throw new Error('30天报告加载失败');
      return { score: 61 };
    },
  });
  await page.onShow();
  await page.selectDateRange(event('month'));
  assert.equal(page.data.selectedRange, 'month');
  assert.equal(page.data.report, null);
  assert.equal(page.data.loadError, '30天报告加载失败');
});

test('独立 TRT-01：家人和本人往返切换，同一日历实例打卡归属随最新选择', async () => {
  const storage = new Map();
  const { page: home, store } = load('', {}, true, storage);
  await home.loadPage();
  const { page: calendar, calls } = load('calendar', {}, true, storage, store);
  for (const value of [1, 0]) {
    await home.handleMemberChange({ detail: { value } });
    home.goCalendar();
    await calendar.onShow();
    calendar.openCheckinModal();
    await calendar.submitCheckin();
  }
  const writes = calls.filter(({ key }) => key === 'submitWearingCheckin');
  assert.deepEqual(writes.map(({ params }) => params.patientId), ['B', 'A']);
});

test('独立 TRT-02：旧请求迟到失败后保留家人资料，且不弹出旧错误', async () => {
  let rejectOld;
  const pending = new Promise((resolve, reject) => { rejectOld = reject; });
  let delay = false;
  const { page, toasts } = load('', { getTreatmentRecord: ({ patientId }) =>
    delay && patientId === 'A' ? pending : { ...record, deviceModel: patientId }
  });
  await page.loadPage();
  delay = true;
  const old = page.loadPage({ silent: true });
  await tick();
  await page.handleMemberChange({ detail: { value: 1 } });
  rejectOld(new Error('本人请求超时'));
  await old;
  assert.equal(page.data.memberIndex, 1);
  assert.equal(page.data.heroDeviceText, 'B');
  assert.equal(toasts.length, 0);
});

test('独立 TRT-03：从有设备的本人切到空记录的家人，设备与状态一起更新', async () => {
  const { page } = load('', { getTreatmentRecord: ({ patientId }) => patientId === 'A' ? record : null });
  await page.loadPage();
  assert.equal(page.data.heroBadgeText, '治疗中');
  await page.handleMemberChange({ detail: { value: 1 } });
  assert.equal(page.data.heroBadgeText, '未开始');
  assert.equal(page.data.heroDeviceText, '暂无治疗记录');
  assert.equal(page.data.hasTreatmentRecord, false);
});

test('独立 TRT-04：30天慢响应不能覆盖后来选中的7天', async () => {
  let finishMonth;
  const pending = new Promise((resolve) => { finishMonth = resolve; });
  const { page } = load('sleep-report', { getSleepReport: ({ range }) => range === 'month' ? pending : { score: 73 } });
  await page.onShow();
  const month = page.selectDateRange(event('month'));
  await tick();
  await page.selectDateRange(event('week'));
  finishMonth({ score: 96 });
  await month;
  assert.equal(page.data.report.rangeLabel, '过去7天');
  assert.equal(page.data.report.score, 73);
});

test('独立 TRT-05：返回趋势页时保留本月，并显示刷新后的时长', async () => {
  let duration = 6;
  const { page } = load('sleep-trend', { getWearingRecords: () => [{ date: '2026-11-18', wearDuration: duration }] });
  await page.onShow();
  page.switchToMonth();
  page.openCalendar();
  duration = 9;
  await page.onShow();
  assert.equal(page.data.selectedRange, 'month');
  assert.equal(page.data.chartItems[0].durationLabel, '9');
  page.switchToWeek();
  assert.equal(page.data.selectedRange, 'week');
});

test('独立 TRT-06：当月无记录时不混入上月或上一年的同月数据', async () => {
  const { page } = load('sleep-trend', { getWearingRecords: () => [
    { date: '2026-10-31', wearDuration: 9 },
    { date: '2025-11-18', wearDuration: 8 },
  ] });
  await page.onShow();
  page.switchToMonth();
  assert.equal(page.data.chartItems.length, 0);
  assert.equal(page.data.wornDaysLabel, '0');
  assert.equal(page.data.avgDurationLabel, '0');
  assert.equal(page.data.complianceLabel, '0');
});
