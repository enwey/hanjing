import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WECHAT_NOTIFICATION_EVENTS, validateNotificationConfig, defaultNotificationMapping, normalizeNotificationPage } from '../wechat-notification-config.js';

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
