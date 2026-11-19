import test from 'node:test';
import assert from 'node:assert/strict';
import { attachAppointmentReferral, createReferralCommissions } from '../../hanjing-clinic-backend/backend-referrals.js';

const code = 'BP' + 'a'.repeat(24);
const asSettings = (values) => Object.entries(values).map(([key_name, key_value]) => ({key_name, key_value}));
const settings = {distribution_settle_days:'0', enable_distribution:'true', min_withdraw:'1', withdraw_fee_rate:'0'};
const item = {id:1, price:100, quantity:1, backend_referral_enabled_snapshot:1, backend_rate_x_snapshot:20, backend_rate_y_snapshot:8};

function fixture({order = {id:1, pay_at:'paid', pay_amount:100, referral_promoter_id:2, appointment_id:3}, items = [item], direct, referrer = {id:2}, converted, config = settings, failOn} = {}) {
  const writes = [];
  const conn = { async execute(query, args) {
    const sql = query.trim().replace(/\s+/g, ' ');
    if (failOn && sql.startsWith(failOn)) throw new Error('fixture write failure');
    if (!sql.startsWith('SELECT')) { writes.push({sql, args}); return [[]]; }
    if (sql.startsWith('SELECT id FROM users')) return [[{id:4}]];
    if (sql.startsWith('SELECT * FROM orders')) return [[order]];
    if (sql.startsWith('SELECT * FROM order_items')) return [items];
    if (sql.startsWith('SELECT * FROM distribution_relationships')) return [[direct]];
    if (sql.includes('FROM system_settings')) return [asSettings(config)];
    if (sql.startsWith('SELECT nickname')) return [[{nickname:'Fixture buyer'}]];
    if (sql.startsWith('SELECT * FROM distributors')) return [[referrer?.id === args[0] ? referrer : undefined]];
    if (sql.startsWith('SELECT order_id FROM promoter_conversions')) return [[converted]];
    if (sql.startsWith('SELECT id FROM distribution_orders')) return [[]];
    if (sql.startsWith('SELECT COUNT(DISTINCT order_id)')) return [[{n:1}]];
    assert.fail(`Unexpected SQL: ${sql}`);
  }};
  return {writes, run:()=>createReferralCommissions(conn,{id:1},4)};
}

for (const [name, value] of [['wrong length', 'BPab'], ['invalid characters', 'BP' + 'g'.repeat(24)], ['non-string', {code}], ['whitespace only', ' ']]) {
  test(`appointment rejects ${name} before querying the database`, async () => {
    await assert.rejects(attachAppointmentReferral({execute:()=>assert.fail('unexpected SQL')},3,value), {referralInvalid:true});
  });
}
test('appointment rejects missing active source and never attempts to write', async () => {
  let calls = 0;
  await assert.rejects(attachAppointmentReferral({async execute(sql, args) {
    calls++;
    assert.match(sql,/d\.status = 'active'/);
    assert.deepEqual(args,[code, code]);
    return [[]];
  }},3,code), {referralInvalid:true});
  assert.equal(calls,1);
});
test('appointment writes active source and normalized code', async () => {
  const calls = [];
  await attachAppointmentReferral({async execute(sql,args) { calls.push({sql,args}); return [[{distributor_id:2}]]; }},3,` ${code} `);
  assert.equal(calls.length,2);
  assert.match(calls[1].sql,/^UPDATE appointments/);
  assert.deepEqual(calls[1].args,[2,code,3]);
});

const paid = {id:1, pay_at:'paid', pay_amount:100, referral_promoter_id:2, appointment_id:3};
for (const [name, state] of [['missing order', null], ['unpaid', {...paid,pay_at:null}], ['zero payment', {...paid,pay_amount:0}], ['already processed', {...paid,distribution_processed:1}]]) {
  test(`${name} produces no commission writes`, async () => {
    const f = fixture({order:state});
    await f.run();
    assert.deepEqual(f.writes,[]);
  });
}
for (const [name, options] of [
  ['feature disabled', {config:{...settings,enable_distribution:'false'}}],
  ['ineligible item', {items:[{...item, backend_referral_enabled_snapshot:0}]}],
  ['inactive referrer', {referrer:null}],
  ['appointment already converted', {converted:{order_id:9}}]
]) {
  test(`${name} records processing without referral or ledger writes`, async () => {
    const f = fixture(options);
    await f.run();
    assert.equal(f.writes.length,1);
    assert.match(f.writes[0].sql,/distribution_processed=1/);
  });
}
for (const [name, config] of [['missing settings', {}], ['invalid setting', {...settings, withdraw_fee_rate:'100'}]]) {
  test(`${name} stops processing before any write`, async () => {
    const f = fixture({config});
    await assert.rejects(f.run(),{statusCode:503});
    assert.deepEqual(f.writes,[]);
  });
}
test('X creates one relationship and one pending ledger entry', async () => {
  const f = fixture();
  await f.run();
  assert.equal(f.writes.filter(x=>x.sql.startsWith('INSERT INTO distribution_relationships') && x.sql.includes('VALUES(NULL')).length,1);
  assert.deepEqual(f.writes.find(x=>x.sql.startsWith('INSERT INTO distribution_orders')).args.slice(3,7),[100,20,3,'referral_new']);
});
test('Y preserves existing relationship and records the Y amount', async () => {
  const f = fixture({direct:{parent_distributor_id:9}});
  await f.run();
  assert.equal(f.writes.some(x=>x.sql.startsWith('INSERT INTO distribution_relationships')),false);
  assert.deepEqual(f.writes.find(x=>x.sql.startsWith('INSERT INTO distribution_orders')).args.slice(3,7),[100,8,4,'referral_existing']);
});
test('ledger write failure propagates before marking order processed', async () => {
  const f = fixture({failOn:'INSERT INTO distribution_orders'});
  await assert.rejects(f.run(),/fixture write failure/);
  assert.equal(f.writes.some(x=>x.sql.includes('distribution_processed=1')),false);
  assert.equal(f.writes.some(x=>x.sql.includes('total_commission=')),false);
});
test('large mixed order allocates cents by exact integer remainders (FLOW-18)', async () => {
  const f = fixture({order:{...paid,pay_amount:1999999989},items:[
    {...item,price:999999991,backend_rate_x_snapshot:100},
    {...item,id:2,price:999999999,backend_referral_enabled_snapshot:0}
  ]});
  await f.run();
  assert.equal(f.writes.find(x=>x.sql.startsWith('INSERT INTO distribution_orders')).args[4],999999991);
});
