import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const members = [{ id: 'A', name: '甲', relation: 'self' }, { id: 'B', name: '乙', relation: 'child' }];
const record = { deviceModel: 'D1', doctorAdvice: '复查', isRealTreatmentRecord: true };
const entries = [{ date: '2026-11-18', wearDuration: 8, painScore: 0 }];
const summary = { weekWorn: 1, weekAvg: 8, weekCompliance: 14, wornDays: 4 };
const wrap = (data) => ({ code: 0, message: 'success', data });
const testTime = new Date('2026-11-19T12:00:00+08:00').valueOf();
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [testTime])); }
  static now() { return testTime; }
}

export function load(name, overrides = {}, loggedIn = true, storage = new Map(), sharedStore, clock = TestDate) {
  const calls = [];
  const toasts = [];

  const defaults = {
    getFamilyMembers: () => members, getTreatmentRecord: () => record,
    getTimeline: () => [], getDeviceAdjustments: () => [{ id: '1', adjustmentValue: '2 mm' }],
    getWearingRecords: () => entries, getWearingSummary: () => summary,
    getSleepReport: () => ({ hasData: true, score: 90 }), submitWearingCheckin: () => ({}),
    ...overrides,
  };
  const api = Object.fromEntries(Object.entries(defaults).map(([key, impl]) => [key, async (params) => {
    calls.push({ key, params });
    return wrap(await impl(params));
  }]));
  const wx = {
    getStorageSync: (key) => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: (key) => storage.delete(key),
    showToast: (value) => toasts.push(value), navigateTo: ({ url }) => calls.push({ url }),
  };
  function loadDependency(path, require) {
    const module = { exports: {} };
    const url = new URL(`../../mp-weixin-rewrite/${path}.js`, import.meta.url);
    runInNewContext(readFileSync(url, 'utf8'), { module, require, wx }, { filename: url.pathname });
    return module.exports;
  }
  const service = loadDependency('services/patient-context-service', () => api);
  const store = sharedStore || loadDependency('stores/patient-context-store', () => service);
  let page;
  const file = new URL(`../../mp-weixin-rewrite/pages/treatment/${name ? `${name}/` : ''}index.js`, import.meta.url);
  runInNewContext(readFileSync(file, 'utf8'), {
    Page(value) { page = value; },
    require(path) {
      if (path.endsWith('/api/index')) return api;
      if (path.endsWith('patient-context-store')) return store;
      if (path.endsWith('patient-context-service')) return service;
      if (path.endsWith('session-store')) return { isLoggedIn: () => loggedIn };
      if (path.endsWith('date-time')) return { formatChinaDate: (value) => String(value).slice(0, 10) };
      if (path.endsWith('navigation')) return { openPage: (url) => calls.push({ url }) };
      throw new Error(path);
    },
    Date: clock,
    console: { error() {} },
    wx,
  }, { filename: file.pathname });
  page.setData = (fields) => Object.assign(page.data, fields);
  page.onLoad?.({ patientId: name === 'adjust-detail' ? 'B' : '' });
  return { page, calls, toasts, storage, store };
}
