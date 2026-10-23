const appointmentFields = { name1: '就诊人', date3: '预约时间', thing69: '医生或门店', phrase14: '预约状态', character_string15: '预约编号' };
const orderFields = { character_string6: '订单编号', phrase2: '订单状态', thing1: '商品或服务', amount40: '金额', thing5: '备注' };
const withdrawFields = { amount1: '金额', phrase3: '状态', time6: '时间', thing5: '备注' };
const refundFields = { character_string2: '订单编号', amount1: '退款金额', time7: '时间', phrase4: '退款状态', thing5: '备注' };

// "connected" describes existing call sites, not guaranteed delivery or authorization.
export const WECHAT_NOTIFICATION_EVENTS = [
  ['appointment_created', '预约成功', '预约', true, '用户或运营创建预约后', appointmentFields],
  ['appointment_paid', '预约支付成功', '预约', true, '预约支付核验成功后', appointmentFields],
  ['appointment_changed', '预约改期', '预约', true, '预约日期或时段调整后', appointmentFields],
  ['appointment_status', '预约状态变更', '预约', true, '预约确认、取消等已接入的状态操作', appointmentFields],
  ['visit_reminder', '就诊提醒', '就诊', true, '预约开始前一小时内，由定时任务检查', appointmentFields],
  ['revisit_reminder', '复诊调整提醒', '就诊', true, '器械下次调整日期为今天或明天', appointmentFields],
  ['order_status', '订单状态通知', '订单', true, '付款、到店及已接入的订单状态操作', orderFields],
  ['refund_result', '退款结果', '订单', true, '部分预约退款及订单退款流程；并非所有退款入口', refundFields],
  ['withdraw_result', '提现审核结果', '推广', false, '提现审核完成后（待接入发送触发点）', withdrawFields],
  ['withdraw_paid', '提现到账', '推广', false, '实际打款确认后（待接入发送触发点）', withdrawFields],
  ['commission_settled', '佣金到账', '推广', false, '佣金结算入账后（待接入发送触发点）', { amount1: '金额', thing2: '备注', time3: '时间', phrase4: '状态' }],
  ['payment_due', '运营开单待付款', '订单', true, '运营生成小程序待支付订单后', orderFields],
  ['order_shipped', '发货通知', '订单', false, '实际填写物流并发货后；独立通知待接入', orderFields],
  ['device_arrived', '定制器械到店', '就诊', false, '定制器械验收入库后；独立通知待接入', orderFields],
  ['report_ready', '报告已出具', '就诊', false, '报告审核发布后，不在通知中展示诊断结果', { thing1: '标题', thing2: '备注' }],
  ['service_reply', '咨询回复', '咨询', false, '客服或医生回复后，不在通知中展示病情', { thing1: '标题', thing2: '备注' }],
  ['promoter_activated', '推广资格生效', '推广', false, '满足邀请绑定条件且资格生效后', { thing1: '标题', thing2: '备注' }],
  ['after_sales_updated', '售后处理进度', '订单', false, '售后工单状态更新后', { thing1: '标题', thing2: '备注' }]
].map(([event, title, group, connected, trigger, fields]) => ({ event, title, group, connected, trigger, fields }));

export const notificationConfigKey = event => `wechat_notification_${event}`;

export function normalizeNotificationPage(page) {
  return String(page || 'pages/profile/notifications/index')
    .replace(/^pages\/(appointment|order)\/detail\/index(?=\?|$)/, 'pages/$1/detail');
}

export function validateNotificationConfig(event, input) {
  const definition = WECHAT_NOTIFICATION_EVENTS.find(item => item.event === event);
  const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
  if (!definition) fail('未知通知类型');
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('配置格式不正确');
  if (typeof input.enabled !== 'boolean') fail('启用状态必须为布尔值');
  if (input.enabled && !definition.connected) fail('该通知发送触发点尚未接入，不能启用');
  const templateId = typeof input.templateId === 'string' ? input.templateId.trim() : '';
  if (templateId && !/^[A-Za-z0-9_-]{10,128}$/.test(templateId)) fail('模板ID格式不正确');
  if (input.enabled && !templateId) fail('启用前请填写模板ID');
  const mapping = input.mapping;
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) || !Object.keys(mapping).length || Object.keys(mapping).length > 10) fail('请配置1至10个模板字段');
  for (const [target, source] of Object.entries(mapping)) {
    if (!/^(thing|name|phrase|date|time|amount|character_string|number|phone_number|letter|symbol)\d+$/.test(target)) fail('微信字段名格式不正确');
    if (!Object.hasOwn(definition.fields, source)) fail('数据来源不属于当前通知');
    // Types must match; renumbering is safe, changing semantic types is not.
    if (target.replace(/\d+$/, '') !== source.replace(/\d+$/, '')) fail('模板字段与业务来源的类型必须一致');
  }
  return { enabled: input.enabled, templateId, mapping: { ...mapping } };
}

export function defaultNotificationMapping(definition) {
  return Object.fromEntries(Object.keys(definition.fields).map(key => [key, key]));
}
