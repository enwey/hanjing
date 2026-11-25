import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WECHAT_NOTIFICATION_EVENTS, validateNotificationConfig, defaultNotificationMapping, normalizeNotificationPage } from '../wechat-notification-config.js';
import { buildTemplateData } from '../wechatSubscribe.js';

test('selected shipment and activation templates map independent values', () => {
  for (const [event, mapping, payload, expected] of [
    ['order_shipped', { character_string3: 'character_string7', thing5: 'thing6', character_string1: 'character_string6', time2: 'time7' },
      { trackingNo: 'SF123456', carrier: '顺丰', orderNo: 'ORDER123', shippedAt: '2026-11-25 12:30:00' }, ['SF123456', '顺丰', 'ORDER123', '2026-11-25 12:30:00']],
    ['promoter_activated', { thing4: 'thing3', time2: 'time3', thing5: 'thing2' },
      { promoterName: '李四', activatedAt: '2026-11-25 12:30:00', remark: '资格已生效' }, ['李四', '2026-11-25 12:30:00', '资格已生效']]
  ]) {
    validateNotificationConfig(event, { enabled: true, templateId: 'valid_template_id', mapping });
    const data = buildTemplateData(event, payload);
    assert.deepEqual(Object.values(mapping).map(source => data[source].value), expected);
  }
  for (const [event, count] of [['order_shipped', 5], ['promoter_activated', 2]]) {
    assert.equal(Object.keys(defaultNotificationMapping(WECHAT_NOTIFICATION_EVENTS.find(item => item.event === event))).length, count);
  }
});

test('withdraw review supports both date and time template fields without changing legacy defaults', () => {
  const definition = WECHAT_NOTIFICATION_EVENTS.find(item => item.event === 'withdraw_result');
  const mapping = { amount9: 'amount1', phrase8: 'phrase3', date2: 'date6', thing3: 'thing5' };
  validateNotificationConfig('withdraw_result', { enabled: true, templateId: 'valid_template_id', mapping });
  const data = buildTemplateData('withdraw_result', { amount: '¥10.00', status: '审核通过', time: '2026-11-25 10:30:00', remark: '等待打款' });
  assert.deepEqual(Object.fromEntries(Object.entries(mapping).map(([target, source]) => [target, data[source].value])), {
    amount9: '¥10.00', phrase8: '审核通过', date2: '2026-11-25 10:30:00', thing3: '等待打款'
  });
  assert.equal(data.time6.value, data.date6.value);
  assert.deepEqual(Object.keys(defaultNotificationMapping(definition)), ['amount1', 'phrase3', 'time6', 'thing5']);
});

test('visit reminder supplies patient, time, doctor, clinic and reminder independently', () => {
  const definition = WECHAT_NOTIFICATION_EVENTS.find(item => item.event === 'visit_reminder');
  const mapping = { name8: 'name1', time2: 'time3', name3: 'name2', thing4: 'thing71', thing5: 'thing72' };
  validateNotificationConfig('visit_reminder', { enabled: true, templateId: 'valid_template_id', mapping });
  const data = buildTemplateData('visit_reminder', { patientName: '张三', appointmentTime: '2026-11-25 15:30', doctorName: '李医生', storeName: '兴康明诊所' });
  assert.deepEqual(Object.fromEntries(Object.entries(mapping).map(([target, source]) => [target, data[source].value])), {
    name8: '张三', time2: '2026-11-25 15:30', name3: '李医生', thing4: '兴康明诊所', thing5: '请按预约时间到诊'
  });
  assert.deepEqual(Object.keys(defaultNotificationMapping(definition)), ['name1', 'date3', 'thing69', 'phrase14', 'character_string15']);
});

test('notification deep links use registered mini-program detail pages', () => {
  assert.equal(normalizeNotificationPage('pages/order/detail/index?id=12'), 'pages/order/detail?id=12');
  assert.equal(normalizeNotificationPage('pages/appointment/detail/index?id=9'), 'pages/appointment/detail?id=9');
  assert.equal(normalizeNotificationPage('pages/treatment/index'), 'pages/treatment/index');
  assert.equal(normalizeNotificationPage(''), 'pages/profile/notifications/index');
});

test('catalog exposes only implemented notification triggers', () => {
  assert.equal(WECHAT_NOTIFICATION_EVENTS.length, 5);
  assert.equal(new Set(WECHAT_NOTIFICATION_EVENTS.map(row => row.event)).size, 5);
  assert.deepEqual(WECHAT_NOTIFICATION_EVENTS.filter(row => row.connected).map(row => row.event), [
    'visit_reminder', 'withdraw_result', 'withdraw_paid', 'order_shipped', 'promoter_activated'
  ]);
});
test('every event has valid editable field defaults', () => {
  for (const item of WECHAT_NOTIFICATION_EVENTS) {
    const config = { enabled: false, templateId: '', mapping: defaultNotificationMapping(item) };
    assert.deepEqual(validateNotificationConfig(item.event, config), config);
  }
});
test('template validation accepts connected events and rejects removed events or invalid input', () => {
  const valid = { enabled: true, templateId: 'valid_template_id', mapping: { name8: 'name1', thing3: 'thing69' } };
  assert.deepEqual(validateNotificationConfig('visit_reminder', valid), valid);
  for (const event of ['withdraw_result', 'withdraw_paid', 'order_shipped', 'promoter_activated']) {
    const definition = WECHAT_NOTIFICATION_EVENTS.find(item => item.event === event);
    const connected = { enabled: true, templateId: 'valid_template_id', mapping: defaultNotificationMapping(definition) };
    assert.deepEqual(validateNotificationConfig(event, connected), connected);
  }
  for (const value of [
    { ...valid, enabled: 'true' }, { ...valid, templateId: '' }, { ...valid, templateId: '<script>' },
    { ...valid, mapping: {} }, { ...valid, mapping: { thing1: 'private_diagnosis' } },
    { ...valid, mapping: { thing1: 'name1' } }, { ...valid, mapping: { bad: 'name1' } }
  ]) assert.throws(() => validateNotificationConfig('visit_reminder', value), { statusCode: 400 });
  for (const event of ['appointment_created', 'appointment_paid', 'appointment_changed', 'appointment_status', 'revisit_reminder', 'order_status', 'refund_result', 'payment_due', 'commission_settled', 'device_arrived', 'report_ready', 'service_reply', 'after_sales_updated']) {
    assert.throws(() => validateNotificationConfig(event, valid), { statusCode: 400 });
  }
  assert.throws(() => validateNotificationConfig('unknown', valid), { statusCode: 400 });
});
