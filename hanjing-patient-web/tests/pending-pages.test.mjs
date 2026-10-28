import test from "node:test";
import assert from "node:assert/strict";
import { page } from "../src/pages.js";
import { fixture, routeParams } from "./fixtures.mjs";
import { withdrawalAmounts } from "../src/pending-interactions.js";
const ctx = (name, params = {}, overrides = {}) => ({
  page: name,
  params: new URLSearchParams({ ...routeParams[name], ...params }),
  get: async (path) => overrides[path.split("?")[0]] ?? fixture(path),
});
test("sleep report isolates invalid patient and does not fetch other patient data", async () => {
  let calls = [];
  const c = ctx("treatmentReport", { patientId: "999" });
  const get = c.get;
  c.get = (p) => {
    calls.push(p);
    return get(p);
  };
  assert.match(await page(c), /无法访问所选就诊人/);
  assert.ok(!calls.some((x) => x.startsWith("/treatment/")));
});
test("withdrawal honors server rules, integer cents and minimum fee", () => {
  const rules = {
    availableCommission: 10000,
    minWithdrawAmount: 1000,
    withdrawFeeRates: { bank: 0.01 },
  };
  assert.deepEqual(withdrawalAmounts("10", rules), {
    valid: true,
    amount: 1000,
    fee: 100,
    net: 900,
  });
  for (const n of ["1", "101", "10.001", "NaN", "-3", ""])
    assert.equal(withdrawalAmounts(n, rules).valid, false);
  assert.equal(
    withdrawalAmounts("10", { ...rules, withdrawFeeRates: {} }).valid,
    false,
  );
});
test("membership uses currentLevel contract", async () => {
  const html = await page(
    ctx(
      "membership",
      {},
      {
        "/user/member-info": {
          currentLevel: "normal",
          points: 5,
          totalSpent: 0,
        },
      },
    ),
  );
  assert.match(html, /在线预约/);
  assert.match(html, /当前权益/);
});
test("commissions filter uses pending settlement status, not payment status", async () => {
  const html = await page(ctx("commissions", { filter: "pending" }));
  assert.match(html, /待结算/);
  assert.ok(!html.includes("待支付"));
  assert.match(html, /¥5.00/);
  const overview = await page(ctx("distribution", {}, {"/distribution/orders": [{orderNo: "TEST", status: "pending", commission: 500}]}));
  assert.match(overview, /待结算/);
  assert.ok(!overview.includes("待支付"));
});
test("missing score is not assigned an invented sleep quality", async () => {
  const html = await page(ctx("treatmentReport"));
  assert.match(html, /待评估/);
});
test("publish mirrors six mini categories and six optional tags", async () => {
  const html = await page(ctx("publish"));
  for (const text of [
    "睡眠科普",
    "治疗知识",
    "设备介绍",
    "患者故事",
    "阻鼾器配戴",
    "科普问答",
    "标签（最多3个）",
    "data-publish-content",
  ])
    assert.ok(html.includes(text), text);
});
test("profile and family forms include identity and clinic data", async () => {
  const profile = await page(ctx("editProfile"));
  assert.match(profile, /avatarFile/);
  assert.match(profile, /name="idCard"/);
  const member = await page(ctx("member", { id: "" }));
  for (const name of ["avatarFile", "storeId", "cardNo", "region", "address"])
    assert.ok(member.includes(`name="${name}"`));
});
test("order detail includes logistics fields, preserves action eligibility", async () => {
  const html = await page(ctx("order"));
  for (const label of [
    "下单时间",
    "支付方式",
    "运单号",
    "优惠减免",
    "取消订单",
  ])
    assert.ok(html.includes(label));
  assert.ok(!html.includes('data-action="receive-order"'));
});
