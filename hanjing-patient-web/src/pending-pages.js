import { getEssLevelInfo } from "./ess-report.js";
import {
  esc,
  btn,
  link,
  action,
  panel,
  kv,
  records,
  empty,
  image,
  money,
  date,
  form,
  field,
  area,
  submit,
  pageHead,
  badge,
  safeUrl,
  patientSelect,
} from "./ui.js";
import { list, query } from "./api.js";

export const pendingRoutes = new Set([
  "assessments",
  "report",
  "treatmentReport",
  "treatmentTimeline",
  "treatmentAdvice",
  "treatmentAdjust",
  "devices",
  "device",
  "medical",
  "publish",
  "checkout",
  "orders",
  "order",
  "profile",
  "editProfile",
  "family",
  "member",
  "membership",
  "security",
  "notifications",
  "service",
]);
const stats = (pairs) =>
  `<div class="parity-stats">${pairs.map(([label, value]) => `<article><span>${esc(label)}</span><strong>${esc(value ?? "—")}</strong></article>`).join("")}</div>`;
const tabs = (route, options, value = "", params = {}) =>
  `<nav class="parity-tabs" aria-label="筛选">${options.map(([key, label]) => link(label, route, { ...params, filter: key }, `btn secondary${key === value ? " selected" : ""}`)).join("")}</nav>`;
const labels = {
  pending: "待支付",
  pending_payment: "待支付",
  paid: "待发货",
  shipping: "配送中",
  shipped: "待收货",
  completed: "已完成",
  cancelled: "已取消",
  refunding: "退款中",
  refunded: "已退款",
  settled: "已结算",
  frozen: "待结算",
  approved: "审核通过",
  rejected: "已驳回",
  processing: "处理中",
  success: "已到账",
};
const status = (value) =>
  `<span class="badge">${esc(labels[value] || value || "—")}</span>`;
const multiline = (text) =>
  `<p class="parity-copy">${esc(text || "暂无内容")}</p>`;
const orderItems = (items) =>
  records(
    items || [],
    (i) =>
      `<div class="parity-product-row">${image(i.productImage || i.imageUrl, i.productName, "parity-thumb")}<div><h3>${esc(i.productName)}</h3><p>数量 × ${esc(i.quantity)}</p></div><strong>${money(i.price)}</strong></div>`,
    "暂无商品信息",
  );
const limited = (value, max = 100) =>
  Math.min(max, Math.max(0, Number(value) || 0));
const progress = (value, max = 100) =>
  `<div class="parity-progress"><i style="width:${limited((Number(value) / max) * 100)}%"></i></div>`;
function reportInsights(r) {
  const out = [];
  if (r.compliance >= 85) out.push(["表现良好", "佩戴依从率较高，当前治疗执行情况良好。"]);
  else if (r.compliance < 60)
    out.push(["需要关注", "佩戴依从率偏低，建议固定佩戴时间，提高连续使用天数。"]);
  if (r.weekAvg >= 7) out.push(["表现良好", "平均佩戴时长已达到理想区间，可继续保持。"]);
  else if (r.weekAvg < 5)
    out.push(["需要关注", "平均佩戴时长偏低，建议逐步延长到每晚 6 到 8 小时。"]);
  if (r.avgPainScore >= 4)
    out.push(["需要关注", "平均痛感偏高，建议预约医生评估当前设备参数。"]);
  out.push(["建议提醒", "建议每周至少佩戴 6 晚，并持续观察趋势变化。"]);
  return out;
}
export function assessmentDescription(record) {
  const analysis = record.snoreAnalysis || record.analysis || {};
  const recommendation = record.recommendation || analysis.recommendation;
  if (recommendation) return recommendation;
  const score = record.essScore;
  if (record.type === "ess" && score !== null && score !== undefined && score !== "" && Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= 24) {
    return getEssLevelInfo(Number(score)).desc;
  }
  return "";
}
export async function pendingPage(c, original, titles) {
  if (!pendingRoutes.has(c.page)) return original;
  const get = c.get,
    p = c.params,
    filter = p.get("filter") || "",
    patientId = c.patientId || p.get("patientId") || "",
    q = query({ patientId }),
    head = (desc = "", actions = "") => pageHead(titles[c.page], desc, actions || (["membership","notifications","security","service"].includes(c.page) ? link("个人中心","profile") : ""));
  // Preserve the selected patient control produced by the existing scoped renderer.
  if (
    c.members &&
    p.get("patientId") &&
    !c.members.some((m) => String(m.id) === p.get("patientId"))
  )
    return original;
  const scope = c.members?.length ? patientSelect(c.members, patientId) : "";
  let body = original;
  if (c.page === "assessments" && patientId) {
    const rows = c.assessments || [];
    const shown = rows.filter((a) => !filter || a.type === filter);
    body =
      head("查看历次评估，了解睡眠变化。", btn("开始评估", "assessment")) +
      scope +
      tabs(
        c.page,
        [
          ["", "全部"],
          ["ess", "ESS嗜睡量表"],
          ["ai_snore", "AI鼾声分析"],
        ],
        filter,
        { patientId },
      ) +
      records(
        shown,
        (a) => {
          const isEss = a.type === "ess";
          const analysis = a.snoreAnalysis || a.analysis || {};
          const level = (isEss ? a.essLevel : analysis.riskLevel) || "normal";
          const label = (isEss
            ? {normal:"正常", mild:"轻度嗜睡", moderate:"中度嗜睡", severe:"重度嗜睡"}
            : {normal:"正常", low:"低风险", mild:"轻度风险", medium:"中度风险", moderate:"中度风险", high:"重度风险", severe:"重度风险"})[level] || "正常";
          const color = ["severe", "high"].includes(level) ? "#ef4444" : ["moderate", "medium"].includes(level) ? "#f59e0b" : level === "mild" ? "#2457e6" : "#22c55e";
          const summary = isEss ? `总分 ${a.essScore ?? "—"} 分` : `录音 ${analysis.duration || 0} 秒，鼾声占比 ${analysis.snoreRate || 0}%`;
          const description = assessmentDescription(a);
          return `<a class="assessment-record-card parity-record-summary" href="#/report${query({id:a.id,patientId})}" style="--record-level-color:${color}"><div class="assessment-record-left"><span class="assessment-record-dot" aria-hidden="true"></span><div class="assessment-record-info"><span class="assessment-record-type">${isEss ? "ESS 嗜睡量表" : "AI 鼾声分析"}</span><span class="assessment-record-desc">${esc(summary)}${description ? `，<span class="assessment-description">${esc(description)}</span>` : ""}</span><time class="assessment-record-date">${esc(a.createdAt || "")}</time></div></div><div class="assessment-record-right"><span class="assessment-record-level">${esc(label)}</span><span class="assessment-record-arrow" aria-hidden="true">›</span></div></a>`;
        },
        "暂无评估记录",
      );
  }
  if (
    [
      "treatmentReport",
      "treatmentTimeline",
      "treatmentAdvice",
      "treatmentAdjust",
    ].includes(c.page) &&
    patientId
  ) {
    const record = c.device;
    body = head("", link("治疗追踪", "treatment", { patientId })) + scope;
    if (c.page === "treatmentReport") {
      const range = p.get("range") === "month" ? "month" : "week",
        r = await get("/treatment/sleep-report" + q + "&range=" + range);
      body += `<nav class="parity-tabs treatment-range-options">${["week", "month"].map((v) => link(v === "week" ? "最近7天" : "最近30天", "treatmentReport", { patientId, range: v }, `btn secondary${range === v ? " selected" : ""}`).replace("<a ", range === v ? '<a aria-current="true" ' : "<a ")).join("")}</nav>`;
      const hasData = typeof r?.hasData === "boolean" ? r.hasData : !!(r && ((r.trend || []).length || [r.compliance, r.weekAvg, r.avgPainScore, r.streak, r.score].some(v => Number(v) > 0)));
      if (!hasData)
        body += empty(
          "暂无睡眠报告，完成佩戴打卡后查看。",
          btn("今日打卡", "wearing", { patientId }),
        );
      else {
        const score = r.score == null ? null : Number(r.score),
          level =
            score === null
              ? "待评估"
              : score >= 90
                ? "优秀"
                : score >= 75
                  ? "良好"
                  : score >= 60
                    ? "一般"
                    : "需改善";
        const [scoreBg, scoreColor] = score === null ? ["#f8fafc", "#64748b"] : score >= 90 ? ["#D3F5E3", "#1A9D5C"] : score >= 75 ? ["#EEF4FF", "#3B6BF5"] : score >= 60 ? ["#FFFBEB", "#F59E0B"] : ["#FEE2E2", "#EF4444"];
        const member = c.members?.find(m => String(m.id) === String(patientId));
        const relation = {self:"本人",spouse:"配偶",child:"子女",parent:"父母",sibling:"兄弟姐妹",other:"其他"}[member?.relation];
        body += `<div class="sleep-score-card" style="--sleep-score-bg:${scoreBg};--sleep-score-color:${scoreColor}">` +
          panel("睡眠健康评分", `<div class="parity-score"><strong>${esc(r.score ?? "—")}<small> / 100 分</small></strong><b>${level}</b></div>${progress(r.score)}<p>${esc(member?.name || "当前就诊人")}${relation ? `（${relation}）` : ""} · ${range === "week" ? "过去7天" : "过去30天"}</p>`) + `</div><h2 class="sleep-metrics-heading">核心指标</h2>` +
          `<div class="parity-stats sleep-metrics">${[
            ["平均时长", `${r.weekAvg ?? "—"} h`, r.weekAvg, 8, "#1A9D5C"],
            ["依从率", `${r.compliance ?? "—"}%`, r.compliance, 100, "#3B6BF5"],
            ["平均痛感", `${r.avgPainScore ?? "—"} / 10`, r.avgPainScore, 10, "#F59E0B"],
            ["连续天数", r.streak ?? "—", r.streak, 30, "#3B6BF5"],
          ].map(([label,value,amount,max,color]) => `<article style="--metric-color:${color}"><strong>${esc(value)}</strong><span>${label}</span>${progress(amount,max)}</article>`).join("")}</div>` +
          `<div class="sleep-report-columns">` + panel("趋势分布",
            `<div class="parity-chart sleep-report-chart">${(r.trend || []).map((t,index,trend) => `<div title="${esc(t.date)}：${esc(t.score)}分"><div><i style="height:${Math.max(8,limited(t.score))}%;background:${Number(t.score) >= 80 ? "#1A9D5C" : Number(t.score) >= 60 ? "#F59E0B" : "#EF4444"}"></i></div><small>${range === "week" || index === 0 || index === trend.length-1 || index % 5 === 0 ? esc(String(t.date).slice(-5)) : ""}</small></div>`).join("")}</div>`
          ) + panel("报告建议", reportInsights(r).map(([title,text]) => `<div class="parity-insight"><h3>${title}</h3><p>${esc(text)}</p></div>`).join("")) + `</div>`;
      }
    } else if (!record)
      body += empty(
        "暂无治疗记录，完成预约就诊后查看。",
        btn("前往预约", "stores"),
      );
    else if (c.page === "treatmentTimeline") {
      const rows = list(await get("/treatment/timeline" + q));
      body +=
        panel(
          "当前治疗",
          kv([
            ["设备型号", record.deviceModel],
            [
              "下颌前移量",
              record.adjustmentValue == null
                ? "—"
                : record.adjustmentValue + " mm",
            ],
            ["下次调整", record.nextAdjustDate],
          ]),
        ) +
        panel(
          "治疗历程",
          `<div class="parity-timeline">${records(rows, (t) => `<article><time>${esc(t.date)}</time><div><span class="badge">${esc({ initial: "初诊", followup: "复诊", adjustment: "调整", fitting: "适配" }[t.type] || t.typeLabel || "诊疗记录")}</span><h3>${esc(t.title)}</h3>${multiline(t.description)}${t.doctorName ? `<small>${esc(t.doctorName)} 医生</small>` : ""}</div></article>`, "暂无治疗时间线记录")}</div>`,
        );
    } else if (c.page === "treatmentAdvice") {
      const sections = [
        ["诊断", record.diagnosis],
        ["治疗方案", record.treatmentPlan],
        ["医生建议", record.doctorAdvice],
      ].filter((x) => x[1]);
      body += sections.length
        ? sections
            .map(([title, text]) =>
              panel(title, multiline(text), "parity-advice"),
            )
            .join("")
        : empty("医生暂未同步本次诊疗的医嘱内容");
      if (record.followupDate || record.nextAdjustDate)
        body += panel(
          "下次随访",
          `<h3>${esc(record.followupDate || record.nextAdjustDate)}</h3><p>请按时复诊，医生将评估治疗效果并调整参数。</p>`,
        );
      body += btn("预约复诊", "stores");
    } else {
      const rows = list(await get("/treatment/adjustments" + q));
      body +=
        panel(
          "当前设备参数",
          kv([
            ["设备型号", record.deviceModel],
            [
              "下颌前移量",
              record.adjustmentValue == null
                ? "—"
                : record.adjustmentValue + " mm",
            ],
            ["调整次数", rows.length + " 次"],
            ["下次调整", record.nextAdjustDate],
          ]),
        ) +
        panel(
          "调整历史",
          records(
            rows,
            (r) =>
              `<div class="pc-list-row"><div><small>${esc(r.date)}</small><h3>${esc(r.value ?? r.adjustmentValue ?? "—")} mm</h3>${multiline(r.note)}<small>${esc(r.doctor || r.doctorName || "")}</small></div><span>${Number(r.comfort) > 0 ? "佩戴感受 " + esc(r.comfort) + "/5" : "未记录佩戴感受"}</span></div>`,
            "暂无医生调整记录",
          ),
        );
    }
  }
  if (c.page === "orders") {
    const rows = list(await get("/orders")),
      shown = rows.filter((r) => !filter || r.status === filter);
    body =
      head("查看订单状态、商品与配送信息。", btn("健康商城", "products")) +
      tabs(
        "orders",
        [
          ["", "全部"],
          ["pending", "待支付"],
          ["paid", "待发货"],
          ["shipped", "待收货"],
          ["completed", "已完成"],
          ["refunding", "退款中"],
        ],
        filter,
      ) +
      records(
        shown,
        (a) =>
          panel(
            "",
            `<div class="pc-list-row"><small>${esc(a.orderNo)}</small>${status(a.status)}</div>${orderItems(a.items)}<div class="parity-order-total"><span>共 ${(a.items || []).reduce((n, i) => n + Number(i.quantity || 0), 0)} 件商品，合计 <strong>${money(a.payAmount)}</strong></span>${link("查看详情", "order", { id: a.id })}</div>`,
          ),
        "暂无订单",
      );
  }
  if (c.page === "order") {
    const a = c.order, s = a.shippingAddress || {}, pickup = s.deliveryMethod === "pickup";
    const stage = {pending:0,paid:1,shipping:1,shipped:2,completed:3}[a.status];
    const steps = pickup ? ["提交订单","等待取货","商品交付","订单完成"] : ["提交订单","准备发货","商品发出","订单完成"];
    const notes = {pending:"订单待支付，请联系门店完成付款。",paid:pickup?"订单已付款，请按门店安排取货。":"订单已付款，等待安排发货。",shipping:"商品正在准备中，请留意配送信息。",shipped:"商品已发出，收到后可确认收货。",completed:"订单已完成，感谢您的信任。",cancelled:"订单已取消。",refund_pending:"退款申请已提交，等待审核。",refunding:"退款处理中，请留意订单状态。",refunded:"订单已退款。"};
    const info = pairs => kv(pairs.filter(([,value])=>value!==undefined&&value!==null&&value!==""));
    body = head(a.orderNo, link("全部订单", "orders")) + `<div class="order-detail-layout">
      <section class="order-status-banner"><div><span class="order-section-label">订单状态</span><h2>${esc(labels[a.status] || a.status || "—")}</h2>${notes[a.status]?`<p>${esc(notes[a.status])}</p>`:""}</div>${stage!==undefined?`<ol class="order-progress" aria-label="订单进度">${steps.map((label,i)=>`<li class="${i<=stage?"is-done":""}" ${i===stage?'aria-current="step"':""}><i aria-hidden="true"></i><span>${label}</span></li>`).join("")}</ol>`:""}</section>
      <div class="order-detail-columns"><div class="order-detail-main">
      ${panel("商品信息",orderItems(a.items))}
      ${panel(pickup?"自提信息":"配送信息",info([
        ["配送方式",pickup?"门店自提":"快递配送"],["自提门店",s.storeName],["营业时间",s.storeBusinessHours],
        ["联系人",s.contactName||s.receiver],["联系电话",s.phone],[pickup?"自提地址":"收货地址",s.detailAddress||s.detail],
        ["快递公司",s.express_company],["运单号",s.tracking_number]
      ]))}
      ${panel("订单信息",info([["订单编号",a.orderNo],["下单时间",a.createdAt],["支付时间",a.payAt],["支付方式",{wechat:"微信支付",cash:"现金",balance:"余额"}[a.payMethod]||a.payMethod],["退款原因",s.refund_reason]]))}
      <div id="logistics"></div></div>
      <aside class="order-detail-summary">${panel("金额明细",`<div class="order-amount-row"><span>商品总价</span><strong>${money(a.totalAmount)}</strong></div>${Number(a.discountAmount)>0?`<div class="order-amount-row"><span>优惠减免</span><strong>−${money(a.discountAmount)}</strong></div>`:""}<div class="order-amount-total"><span>${a.payAt?"实付金额":"应付金额"}</span><strong>${money(a.payAmount)}</strong></div><div class="order-detail-actions">${a.status==="pending"?action("取消订单","cancel-order"):""}${a.status==="shipped"?action("确认收货","receive-order"):""}${["paid","shipping","shipped","completed"].includes(a.status)?action("申请退款","refund-order"):""}${action("查看物流","logistics")}</div>`)}
      </aside></div></div>`;
  }
  if (c.page === "membership") {
    const info = await get("/user/member-info"),
      levels = list(await get("/user/member-levels")),
      idx = levels.findIndex(
        (l) => l.level === (info.currentLevel || info.memberLevel),
      ),
      current = levels[idx],
      next = levels[idx + 1];
    body =
      head("查看当前会员权益及升级条件。") +
      panel(
        current?.title || "我的会员",
        stats([
          ["累计消费", money(info.totalSpent)],
          ["积分", info.points],
        ]) +
          (next
            ? `<p>再消费 ${money(Math.max(0, next.spentRequired - info.totalSpent))} 升级${esc(next.title)}</p>${progress(info.totalSpent, next.spentRequired)}`
            : ""),
        "parity-membership",
      ) +
      panel(
        "当前权益",
        `<div class="parity-benefits">${records(current?.benefits || [], (b) => `<article><h3>${esc(b.title)}</h3>${multiline(b.desc)}</article>`, "暂无权益说明")}</div>`,
      ) +
      panel(
        "等级体系",
        records(
          levels,
          (l) =>
            `<div class="pc-list-row"><div><h3>${esc(l.title)}</h3><p>累计消费满 ${money(l.spentRequired)}</p></div>${l.level === (info.currentLevel || info.memberLevel) ? '<span class="badge">当前</span>' : ""}</div>`,
          "暂无等级规则",
        ),
      );
  }
  if (c.page === "notifications") {
    const rows = list(await get("/user/notifications")),
      unread = rows.filter((a) => !a.isRead).length;
    body =
      head(
        `${unread} 条未读`,
        link("个人中心", "profile") + (unread ? action("全部标为已读", "read-all") : ""),
      ) +
      records(
        rows,
        (a) =>
          panel(
            "",
            `<div class="pc-list-row"><div><h3>${esc(a.title)} ${a.isRead ? "" : '<span class="badge">未读</span>'}</h3>${multiline(a.content)}<small>${esc(a.createdAt)}</small></div>${a.isRead ? "" : action("标为已读", "read", `data-id="${esc(a.id)}"`)}</div>`,
            a.isRead ? "account-notice" : "account-notice parity-unread",
          ),
        "暂无消息",
      );
  }
  if (c.page === "profile") {
    const serviceUnread = Number((await get("/im/unread-count"))?.unread || 0);
    const a = c.profile,
      notices = list(await get("/user/notifications")),
      unread = notices.filter((n) => !n.isRead).length;
    body =
      head("管理自己的睡眠健康，也照顾家人的就诊需要。") +
      panel(
        "",
        `<div class="profile-heading">${image(a.avatar, a.nickname, "avatar")}<div><h2>${esc(a.nickname || "患者")}</h2><p>${esc(a.memberLevelTitle || "普通会员")} · ${esc(a.phone || "未绑定手机")}</p></div>${link("编辑资料", "editProfile")}</div>`,
        "account-profile-card",
      ) +
      (!a.birthday || !a.gender
        ? panel(
            "完善资料",
            `<div class="pc-list-row"><p>完善资料，有助于客服和门诊更好地服务你。</p>${link("去完善", "editProfile")}</div>`,
            "account-setup-card",
          )
        : "") +
      [
        [
          "健康管理",
          [
            ["我的预约", "appointments"],
            ["就诊人管理", "family"],
            ["病历档案", "medical"],
            ["评估记录", "assessments"],
            ["阻鼾器管理", "devices"],
          ],
        ],
        [
          "我的服务",
          [
            ["我的订单", "orders"],
            ["会员权益", "membership"],
            [
              "消息通知" + (unread ? " · " + unread + "条未读" : ""),
              "notifications",
            ],
            [
              "在线客服" +
                (serviceUnread ? " · " + serviceUnread + "条未读" : ""),
              "service",
            ],
          ],
        ],
        [
          "账号设置",
          [
            ["账号安全", "security"],
          ],
        ],
      ]
        .map(([title, items]) =>
          panel(
            title,
            `<div class="parity-entry-grid">${items.map(([title, target]) => link(title, target)).join("")}</div>`,
            "account-menu-card",
          ),
        )
        .join("");
  }
  if (c.page === "family") {
    body =
      head("本人及家庭成员的就诊资料。", link("个人中心","profile") + btn("新增就诊人", "member")) +
      `<div class="pc-grid two">${records(
        c.members || [],
        (a) =>
          panel(
            "",
            `<div class="profile-heading">${image(a.avatar || a.avatarUrl, a.name, "avatar")}<div><h2>${esc(a.name)}</h2>${badge({ self: "本人", parent: "父母", spouse: "配偶", child: "子女", other: "其他" }[a.relation] || a.relation)}</div></div>${kv(
              [
                [
                  "性别",
                  a.gender === 1 || a.gender === "male"
                    ? "男"
                    : a.gender === 2 || a.gender === "female"
                      ? "女"
                      : "未填写",
                ],
                ["出生日期", a.birthday],
                ["联系电话", a.phone],
                ["身份证", a.idCard],
                ["就诊卡", a.cardNo],
                ["上次就诊", a.lastVisit],
              ],
            )}${a.hasSnore ? '<p class="badge">有打鼾</p>' : ""}<div>${link("查看与编辑", "member", { id: a.id })}</div>`,
            "account-member-card",
          ),
        "暂无已关联就诊人",
      )}</div>`;
  }
  if (c.page === "security") {
    body = body.replace(
      "<h2>登录密码</h2>",
      `<h2>${c.security.hasPassword ? "修改登录密码" : "设置登录密码"}</h2>`,
    );
    body = body.replace(
      '<section class="pc-panel ',
      `${panel(
        "账号信息",
        kv([
          ["绑定手机", c.security.phone || "未绑定"],
          ["登录密码", c.security.hasPassword ? "已设置" : "未设置"],
          [
            "实名认证",
            c.security.realNameVerified
              ? "已认证" +
                (c.security.realName ? "（" + c.security.realName + "）" : "")
              : "未认证",
          ],
        ]),
      )}<section class="pc-panel `,
    );
  }
  if (c.page === "medical") {
    body = body.replaceAll("上传病历图片", "补充病历图片");
  }
  if (c.page === "devices" && patientId) {
    const summary = await get("/treatment/wearing-summary" + q),
      maintenance = list(await get("/treatment/device-maintenance" + q));
    const rows = list(
      await get(
        "/treatment/records" +
          query({ patientId, treatmentId: p.get("id") || "" }),
      ),
    );
    body =
      head(
        "查看当前就诊人的设备与佩戴情况。",
        link("病历档案", "medical", { patientId }),
      ) +
      scope +
      (rows.length
        ? stats([
            ["佩戴天数", (summary?.wornDays ?? summary?.weekWorn ?? 0) + " 天"],
            ["上次维护", maintenance[0]?.date || "暂无记录"],
          ])
        : "") +
      records(
        rows,
        (a) =>
          panel(
            a.device?.name || a.deviceModel,
            `${badge(a.status)}${kv([
              ["设备型号", a.deviceModel],
              [
                "设备编号",
                a.serialNumber || a.device?.serialNumber || a.deviceProductId,
              ],
              ["绑定日期", a.startDate],
              [
                "当前前移量",
                a.adjustmentValue == null ? "—" : a.adjustmentValue + " mm",
              ],
              ["主治医生", a.doctorName],
              ["推荐复诊", a.followupDate || a.nextAdjustDate],
            ])}<div class="pc-actions">${btn("查看设备", "device", { id: a.id, patientId })}${link("佩戴数据", "treatmentTrend", { patientId })}</div>`,
          ),
        "当前就诊人暂无关联设备",
      );
  }

  if (c.page === "service") {
    const messages = list(await get("/im/messages"));
    body =
      head("在线咨询就诊与服务问题。", link("个人中心","profile") + action("刷新消息", "retry")) +
      panel(
        "",
        `<div class="messages" role="log" aria-label="客服对话">${records(
          messages,
          (a) => {
            const raw = String(a.text || ""),
              url = raw.startsWith("[image]")
                ? safeUrl(raw.slice(7))
                : raw.startsWith("/uploads/")
                  ? safeUrl(raw)
                  : "";
            return `<article class="message ${a.sender === "patient" ? "mine" : ""}"><small>${esc(a.senderName || "客服")} · ${esc(a.time)}</small>${url ? image(url, "消息图片") : multiline(raw)}</article>`;
          },
          "暂无消息",
        )}</div>${form("message", area("咨询内容", "text", "", 'maxlength="1000" placeholder="输入您的问题..."') + field("发送图片（选填）", "messageFile", "", "file", 'accept="image/jpeg,image/png,image/gif"') + submit("发送消息"))}`,
      );
  }
  const accountPage = ["profile","editProfile","family","member","membership","security","notifications","service"].includes(c.page);
  return `<div class="pending-page${accountPage ? " account-page" : ""}" data-pending-page="${esc(c.page)}">${body}</div>`;
}
