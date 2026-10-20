import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WECHAT_NOTIFICATION_EVENTS, validateNotificationConfig, defaultNotificationMapping, normalizeNotificationPage } from '../wechat-notification-config.js';

test('notification deep links use registered mini-program detail pages', () => {
  assert.equal(normalizeNotificationPage('pages/order/detail/index?id=12'), 'pages/order/detail?id=12');
  assert.equal(normalizeNotificationPage('pages/appointment/detail/index?id=9'), 'pages/appointment/detail?id=9');
  assert.equal(normalizeNotificationPage('pages/treatment/index'), 'pages/treatment/index');
  assert.equal(normalizeNotificationPage(''), 'pages/profile/notifications/index');
});

test('catalog distinguishes implemented and planned triggers', () => {
  assert.equal(WECHAT_NOTIFICATION_EVENTS.length, 18);
  assert.equal(new Set(WECHAT_NOTIFICATION_EVENTS.map(row => row.event)).size, 18);
  assert.equal(WECHAT_NOTIFICATION_EVENTS.filter(row => row.connected).length, 8);
});
test('every event has valid editable field defaults', () => {
  for (const item of WECHAT_NOTIFICATION_EVENTS) {
    const config = { enabled: false, templateId: '', mapping: defaultNotificationMapping(item) };
    assert.deepEqual(validateNotificationConfig(item.event, config), config);
  }
});
test('template validation rejects unsupported types, missing templates and unimplemented triggers', () => {
  const valid = { enabled: true, templateId: 'valid_template_id', mapping: { character_string8: 'character_string6', thing3: 'thing1' } };
  assert.deepEqual(validateNotificationConfig('order_status', valid), valid);
  for (const value of [
    { ...valid, enabled: 'true' }, { ...valid, templateId: '' }, { ...valid, templateId: '<script>' },
    { ...valid, mapping: {} }, { ...valid, mapping: { thing1: 'private_diagnosis' } },
    { ...valid, mapping: { thing1: 'amount40' } }, { ...valid, mapping: { bad: 'thing1' } }
  ]) assert.throws(() => validateNotificationConfig('order_status', value), { statusCode: 400 });
  assert.throws(() => validateNotificationConfig('payment_due', valid), { statusCode: 400 });
  assert.throws(() => validateNotificationConfig('unknown', valid), { statusCode: 400 });
});
