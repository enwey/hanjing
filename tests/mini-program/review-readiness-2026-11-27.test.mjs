import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = (name) => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const routes = source('hanjing-clinic-backend/routes/client.js');

test('privacy consent resolves concurrent requests only from the matching authorization button', () => {
  const component = {};
  runInNewContext(source('mp-weixin-rewrite/components/business/hj-privacy-popup/index.js'), {
    Component: definition => Object.assign(component, definition.methods, definition.lifetimes),
    wx: { showToast() {} }
  });
  component.setData = () => {};
  component.triggerEvent = () => {};
  assert.match(source('mp-weixin-rewrite/components/business/hj-privacy-popup/index.wxml'), /id="agree-btn"[^>]*open-type="agreePrivacyAuthorization"/);
  const results = [];
  component.requestAuthorization(value => results.push(value.event + ':' + value.buttonId));
  component.requestAuthorization(value => results.push(value.event + ':' + value.buttonId));
  component.handleAgree();
  assert.deepEqual(results, ['agree:agree-btn', 'agree:agree-btn']);
  component.requestAuthorization(value => results.push(value.event));
  component.detached();
  assert.equal(results.at(-1), 'disagree');
});

test('commission calculation ignores old second-tier order rates and still grants the direct rate', async () => {
  const js = source('hanjing-clinic-backend/backend-referrals.js').split('export async function createReferralCommissions')[1];
  const run = runInNewContext('(async function createReferralCommissions' + js.trim() + ')', {
    getDistributionFeatureConfig: async () => ({ enableDistribution: true })
  });
  const grants = [];
  await run({ execute: async (sql, args) => {
    if (sql.includes('FROM orders WHERE')) return [[{ id: 1, pay_at: 'now', pay_amount: 10000 }]];
    if (sql.includes('FROM order_items')) return [[{ id: 1, price: 10000, quantity: 1, is_distribution_snapshot: 1, commission_rate_level1_snapshot: 10, commission_rate_level2_snapshot: 5 }]];
    if (sql.includes('FROM distribution_relationships')) return [[{ parent_user_id: 5 }]];
    if (sql.includes("FROM distributors WHERE user_id=")) return [[{ id: 7 }]];
    if (sql.includes('INSERT INTO distribution_orders')) grants.push([args[1], args[4], args[5]]);
    if (sql.includes('COUNT(DISTINCT order_id)')) return [[{ n: 1 }]];
    return [[]];
  } }, { id: 1 }, 8);
  assert.deepEqual(grants, [[7, 1000, 1]]);
});

test('an image message stores only its owned private path and never a signed URL', async () => {
  const code = source('hanjing-clinic-backend/im-access.js').split('export async function validateImText')[1];
  const run = runInNewContext('(async function validateImText' + code.trim() + ')', {
    privateUploadPath: value => new URL(value, 'https://local.example').pathname,
    get: async (_sql, [path, userId]) => path.endsWith('owned.jpg') && userId === 4
  });
  assert.equal(await run('普通咨询', 4), '普通咨询');
  assert.equal(await run('[image]/uploads/medical-attachments/owned.jpg?asset_token=old', 4), '[image]/uploads/medical-attachments/owned.jpg');
  await assert.rejects(run('[image]/uploads/medical-attachments/owned.jpg', 5), { statusCode: 400 });
  await assert.rejects(run('[image]/uploads/admin/images/picture.jpg', 4), { statusCode: 400 });
});

test('a report targets a single published comment and rejects a foreign target', async () => {
  const code = routes.slice(routes.indexOf("app.post('/api/v1/community/posts/:id/report'"));
  let handler;
  let matched = false;
  const saved = [];
  runInNewContext(code.slice(0, code.indexOf('\n});') + 4), {
    app: { post(_path, _auth, fn) { handler = fn; } },
    authenticateWxToken() {},
    escapeHtml: value => value,
    notifyBusiness: async () => {},
    transaction: operation => operation({
      execute: async (sql, args) => {
        if (sql.includes('FROM community_posts')) return [[{ id: 3 }]];
        if (sql.includes('FROM post_comments')) return [matched ? [{ id: 9 }] : []];
        if (sql.includes('INSERT INTO community_reports')) {
          saved.push(args);
          return [{ insertId: 11 }];
        }
        return [[]];
      }
    }),
    console
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json() {} };
  const req = { params: { id: 3 }, user: { id: 5 }, body: { reason: '违规', commentId: '9' } };
  await handler(req, res);
  assert.equal(res.code, 404);
  assert.equal(saved.length, 0);
  matched = true;
  await handler(req, res);
  assert.deepEqual(Array.from(saved[0]), [3, 5, '9', '违规']);
});


test('sensitive data dialog allows explicit confirmation and treats cancellation and failure as refusal', async () => {
  let answer;
  const module = { exports: {} };
  runInNewContext(source('mp-weixin-rewrite/common/utils/confirm-sensitive-data.js'), {
    module,
    wx: { showModal(options) {
      if (answer === 'fail') options.fail();
      else options.success({ confirm: answer });
    } }
  });
  for (const result of [true, false, 'fail']) {
    answer = result;
    assert.equal(await module.exports('处理资料', '资料用途'), result === true);
  }
});
