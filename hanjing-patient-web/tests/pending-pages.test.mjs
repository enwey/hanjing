import test from "node:test";
import assert from "node:assert/strict";
import { page } from "../src/pages.js";
import { fixture, routeParams } from "./fixtures.mjs";
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
    "配送信息",
    "order-progress",
    "应付金额",
    "取消订单",
  ])
    assert.ok(html.includes(label));
  assert.ok(!html.includes('data-action="receive-order"'));
});


test("assessment descriptions preserve mini recommendations and cover ESS score ranges", async () => {
  const { assessmentDescription } = await import("../src/pending-pages.js");
  assert.equal(assessmentDescription({type: "ess", essScore: 0, recommendation: "服务端说明"}), "服务端说明");
  assert.equal(assessmentDescription({type: "ai_snore", snoreAnalysis: {recommendation: "鼾声建议"}}), "鼾声建议");
  assert.equal(assessmentDescription({type: "ai_snore", analysis: {recommendation: "历史建议"}}), "历史建议");
  for (const [score, text] of [[0,"正常范围"],[5,"正常范围"],[6,"轻度"],[10,"轻度"],[11,"中度"],[15,"中度"],[16,"重度"],[24,"重度"]])
    assert.ok(assessmentDescription({type:"ess",essScore:score}).includes(text));
  for (const score of [null, undefined, "", "invalid", -1, 25])
    assert.equal(assessmentDescription({type:"ess",essScore:score}), "");
  const html = await page(ctx("assessments", {}, {"/assessments": [{id: 1, type:"ess",essScore:0,essLevel:"normal",recommendation:"建议 <script>"}]}));
  assert.match(html, /class="assessment-description"/);
  assert.ok(html.includes("建议 &lt;script&gt;"));
});


test("assessment cards follow mini structure and navigate with patient context", async () => {
  const html = await page(ctx("assessments"));
  assert.match(html, /总分 5 分/);
  assert.match(html, /录音 .* 秒，鼾声占比/);
  assert.match(html, /assessment-record-right/);
  assert.match(html, /href="#\/report\?id=.*patientId=/);
  assert.ok(!html.includes("查看报告"));
});


test("sleep report mirrors mini metric bars, risk colors, advice titles and month labels", async () => {
 const report={hasData:true,score:59,weekAvg:4,compliance:50,avgPainScore:4,streak:3,trend:Array.from({length:30},(_,i)=>({date:`10-${i+1}`,score:[0,60,80][i%3]}))};
 const html=await page(ctx("treatmentReport",{range:"month"},{"/treatment/sleep-report":report}));
 for(const text of ["sleep-report-columns","核心指标","需要关注","建议提醒","#FEE2E2","#1A9D5C","#F59E0B","#EF4444","height:8%"])
  assert.ok(html.includes(text),text);
 assert.equal((html.match(/--metric-color:/g)||[]).length,4);
 const legacy={...report};delete legacy.hasData;
 assert.match(await page(ctx("treatmentReport",{}, {"/treatment/sleep-report":legacy})), /核心指标/);
 assert.ok(!(await page(ctx("treatmentReport",{}, {"/treatment/sleep-report":{...report,hasData:false}}))).includes('sleep-report-columns'));
});
