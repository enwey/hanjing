const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const admin = path.join(root, 'hanjing-clinic-管理后台源码-20260607');
const source = fs.readFileSync(path.join(admin, 'src/views/appointment/workbench.vue'), 'utf8');
const { parse, compileTemplate } = require(path.join(admin, 'node_modules/@vue/compiler-sfc'));
const { descriptor, errors } = parse(source);
assert.equal(errors.length, 0);
assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'workbench.vue', id: 'workbench' }).errors, []);
const helper = source.slice(source.indexOf('async function skipPreExamCheckIn('), source.indexOf('async function handleCheckInSkip('));
const handler = source.slice(source.indexOf("const consultingId = ref('')"), source.indexOf('// Move patient down the queue'));
function setup(status, failStatus) {
  const calls = [], messages = [];
  let refreshes = 0;
  const context = {
    ref: value => ({ value }), selectedDoctorId: { value: 'doctor' },
    appointments: { value: [{ id: 'previous', doctorId: 'doctor', status: 'checked_in' }] },
    request: { put: async (url, body) => { calls.push([url, body.status]); if (body.status === failStatus) throw Error('test failure'); } },
    MessagePlugin: { success: value => messages.push(value), error: value => messages.push(value) },
    fetchAppointments: async () => { refreshes++; }, console: { error() {} }
  };
  vm.createContext(context);
  vm.runInContext((helper + handler).replaceAll(': QueueItem', '') + '\nglobalThis.run = triggerConsultOnly; globalThis.lock = consultingId;', context);
  return { context, calls, messages, refreshes: () => refreshes, item: { id: 'new', patientName: '测试患者', status } };
}
(async () => {
  const pending = setup('pending');
  await pending.context.run(pending.item);
  assert.deepEqual(pending.calls, [['/api/admin/appointments/new','confirmed'],['/api/admin/appointments/previous','confirmed'],['/api/admin/appointments/new','checked_in']]);
  assert.equal(pending.context.lock.value, '');
  const signed = setup('confirmed');
  await signed.context.run(signed.item);
  assert.equal(signed.calls.length, 2);
  const failed = setup('pending', 'confirmed');
  await failed.context.run(failed.item);
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.refreshes(), 1);
  assert.equal(failed.context.lock.value, '');
  const repeated = setup('pending');
  await Promise.all([repeated.context.run(repeated.item), repeated.context.run(repeated.item)]);
  assert.equal(repeated.calls.length, 3);
  const failedConsult = setup('pending', 'checked_in');
  await failedConsult.context.run(failedConsult.item);
  assert.equal(failedConsult.refreshes(), 1);
  assert.equal(failedConsult.context.lock.value, '');
  console.log('PASS: Vue template; unsigned admission; signed admission; failed sign-in; duplicate click; failed consultation refresh');
})().catch(error => { console.error(error); process.exitCode = 1; });
