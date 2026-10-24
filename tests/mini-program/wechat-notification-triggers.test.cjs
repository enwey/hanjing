const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const subscribe = read('mp-weixin-rewrite/common/utils/subscribe.js');
assert.match(subscribe, /appointment:\s*\['visit_reminder'\]/);
assert.match(subscribe, /withdraw:\s*\['withdraw_result', 'withdraw_paid'\]/);
assert.match(subscribe, /order:\s*\['order_shipped'\]/);
assert.match(subscribe, /distribution:\s*\['promoter_activated'\]/);

const withdraw = read('mp-weixin-rewrite/pages/distribution/withdraw/index.js');
assert.ok(withdraw.indexOf('await api.applyWithdraw(') < withdraw.indexOf("scene: 'withdraw'"));

const appointment = read('mp-weixin-rewrite/pages/appointment/confirm.js');
assert.match(appointment, /syncPaidAppointment\(appointmentId\)[\s\S]*this\.requestSubscribe/);
assert.match(appointment, /appointmentDraftStore\.clearDraft\(\)[\s\S]*this\.requestSubscribe/);

const product = read('mp-weixin-rewrite/pages/product/detail.js');
assert.match(product, /createdPayAmount === 0[\s\S]*scene: 'order'/);
assert.match(product, /syncPaidOrder\(orderId\)[\s\S]*scene: 'order'/);

const invite = read('mp-weixin-rewrite/pages/distribution/invite/index.js');
assert.match(invite, /if \(this\.data\.isDistributor\) return;[\s\S]*scene: 'distribution'/);

const admin = read('hanjing-clinic-backend/routes/admin.js');
for (const event of ['withdraw_result', 'withdraw_paid', 'order_shipped', 'promoter_activated']) {
  assert.match(admin, new RegExp(`event: '${event}'`));
}

const client = read('hanjing-clinic-backend/routes/client.js');
assert.match(client, /payAmount === 0[\s\S]*pay_at = CURRENT_TIMESTAMP/);
assert.match(client, /event: 'promoter_activated'/);

console.log('wechat notification trigger checks passed');
