import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseWechatXml, validateWechatV2Response } from '../wechatPay.js';

const config = { appId: 'fixture-app', mchId: 'fixture-merchant', apiV2Key: 'fixture-key-not-a-real-credential' };
function signed(fields, algorithm = 'HMAC-SHA256') {
  const body = { appid: config.appId, mch_id: config.mchId, return_code: 'SUCCESS', result_code: 'SUCCESS', sign_type: algorithm, ...fields };
  const source = Object.keys(body).sort().map(key => key + '=' + body[key]).join('&') + '&key=' + config.apiV2Key;
  body.sign = (algorithm === 'MD5' ? crypto.createHash('md5') : crypto.createHmac('sha256', config.apiV2Key)).update(source).digest('hex').toUpperCase();
  return body;
}

test('V2 XML reads the root, CDATA and escaped text without turning amounts into numbers early', () => {
  assert.deepEqual(parseWechatXml('<xml><total_fee>00100</total_fee><body><![CDATA[A & B]]></body><detail>A &amp; B</detail></xml>'),
    { total_fee: '00100', body: 'A & B', detail: 'A & B' });
  assert.throws(() => parseWechatXml('<xml><a>1</a><a>2</a></xml>'));
  assert.throws(() => parseWechatXml('<!DOCTYPE xml><xml><a>1</a></xml>'));
});

test('a successful query never changes NOTPAY, USERPAYING or CLOSED to SUCCESS', () => {
  for (const trade_state of ['NOTPAY', 'USERPAYING', 'CLOSED', 'REVOKED', 'PAYERROR']) {
    const response = validateWechatV2Response(signed({ trade_state }), config, '/pay/orderquery');
    assert.equal(response.trade_state, trade_state);
  }
  assert.equal(validateWechatV2Response(signed({}), config, '/pay/orderquery').trade_state, '');
});

test('V2 payment results require a signature, correct merchant and unchanged amount', () => {
  const result = signed({ out_trade_no: 'fixture-order', transaction_id: 'fixture-tx', total_fee: '1000', fee_type: 'CNY' });
  assert.equal(validateWechatV2Response(result, config, '/pay/micropay').trade_state, 'SUCCESS');
  assert.deepEqual(validateWechatV2Response(result, config, '/pay/micropay').amount, { total: 1000, currency: 'CNY' });
  assert.throws(() => validateWechatV2Response({ ...result, total_fee: '1' }, config, '/pay/micropay'));
  assert.throws(() => validateWechatV2Response({ ...result, sign: '' }, config, '/pay/micropay'));
  assert.throws(() => validateWechatV2Response(signed({ mch_id: 'other' }), config, '/pay/orderquery'));
  assert.equal(validateWechatV2Response(signed({ trade_state: 'NOTPAY' }, 'MD5'), config, '/pay/orderquery').trade_state, 'NOTPAY');
});
