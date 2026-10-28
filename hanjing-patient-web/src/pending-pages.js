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
  "live",
  "room",
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
  "coupons",
  "service",
  "distribution",
  "team",
  "commissions",
  "withdraws",
  "withdraw",
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
  if (r.compliance >= 85) out.push("佩戴依从率较高，当前治疗执行情况良好。");
  else if (r.compliance < 60)
    out.push("佩戴依从率偏低，建议固定佩戴时间，提高连续使用天数。");
  if (r.weekAvg >= 7) out.push("平均佩戴时长已达到理想区间，可继续保持。");
  else if (r.weekAvg < 5)
    out.push("平均佩戴时长偏低，建议逐步延长到每晚 6 到 8 小时。");
  if (r.avgPainScore >= 4)
    out.push("平均痛感偏高，建议预约医生评估当前设备参数。");
  out.push("建议每周至少佩戴 6 晚，并持续观察趋势变化。");
  return out;
}
export async function pendingPage(c, original, titles) {
  if (!pendingRoutes.has(c.page)) return original;
  const get = c.get,
    p = c.params,
    filter = p.get("filter") || "",
    patientId = c.patientId || p.get("patientId") || "",
    q = query({ patientId }),
    head = (desc = "", actions = "") => pageHead(titles[c.page], desc, actions);
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
        (a) =>
          panel(
            a.type === "ess" ? "ESS嗜睡量表" : "AI鼾声分析",
            `<div class="parity-record-summary"><div><p>${esc(a.createdAt || "")}</p><strong>${esc(a.type === "ess" ? (a.essScore ?? "—") : (a.snoreAnalysis?.riskScore ?? "—"))} <small>分</small></strong><p>${esc(a.type === "ess" ? { normal: "正常", mild: "轻度嗜睡", moderate: "中度嗜睡", severe: "重度嗜睡" }[a.essLevel] || a.essLevel || "" : { normal: "低风险", low: "低风险", mild: "轻度风险", moderate: "中风险", high: "高风险", severe: "高风险" }[a.snoreAnalysis?.riskLevel] || "")}</p></div>${link("查看报告", "report", { id: a.id, patientId })}</div>`,
          ),
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
      if (!r?.hasData)
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
        body +=
          panel(
            "睡眠健康评分",
            `<div class="parity-score"><strong>${esc(r.score ?? "—")}<small> / 100 分</small></strong><b>${level}</b></div>${progress(r.score)}<p>${esc(c.members?.find((m) => String(m.id) === String(patientId))?.name || "当前就诊人")} · ${range === "week" ? "过去7天" : "过去30天"}</p>`,
          ) +
          stats([
            ["平均时长", `${r.weekAvg ?? "—"} h`],
            ["依从率", `${r.compliance ?? "—"}%`],
            ["平均痛感", `${r.avgPainScore ?? "—"} / 10`],
            ["连续天数", r.streak],
          ]) +
          panel(
            "趋势分布",
            `<div class="parity-chart">${(r.trend || []).map((t) => `<div title="${esc(t.date)}：${esc(t.score)}分"><span>${esc(t.score)}</span><div><i style="height:${limited(t.score)}%"></i></div><small>${esc(String(t.date).slice(-5))}</small></div>`).join("")}</div>`,
          ) +
          panel(
            "报告建议",
            reportInsights(r)
              .map((t) => `<p class="parity-insight">${esc(t)}</p>`)
              .join(""),
          );
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
    const a = c.order,
      s = a.shippingAddress || {};
    body =
      head(a.orderNo, link("全部订单", "orders")) +
      panel(
        "订单状态",
        `${status(a.status)}${a.status === "pending" ? "<p>订单待支付，请联系门店完成付款。</p>" : ""}`,
      ) +
      panel("商品信息", orderItems(a.items)) +
      panel(
        "金额明细",
        kv([
          ["商品总价", money(a.totalAmount)],
          ["优惠减免", money(a.discountAmount)],
          [a.payAt ? "实付金额" : "应付金额", money(a.payAmount)],
        ]),
      ) +
      panel(
        "订单信息",
        kv([
          ["订单编号", a.orderNo],
          ["下单时间", a.createdAt],
          ["支付时间", a.payAt],
          [
            "支付方式",
            { wechat: "微信支付", cash: "现金", balance: "余额" }[
              a.payMethod
            ] || a.payMethod,
          ],
          ["配送方式", s.deliveryMethod === "pickup" ? "门店自提" : "快递配送"],
          ["自提门店", s.storeName],
          ["营业时间", s.storeBusinessHours],
          ["收货人", s.contactName || s.receiver],
          ["联系电话", s.phone],
          ["地址", s.detailAddress || s.detail],
          ["快递公司", s.express_company],
          ["运单号", s.tracking_number],
          ["退款原因", s.refund_reason],
        ]),
      ) +
      `<div class="pc-actions">${a.status === "pending" ? action("取消订单", "cancel-order") : ""}${a.status === "shipped" ? action("确认收货", "receive-order") : ""}${["paid", "shipping", "shipped", "completed"].includes(a.status) ? action("申请退款", "refund-order") : ""}${action("查看物流", "logistics")}</div><div id="logistics"></div>`;
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
        unread ? action("全部标为已读", "read-all") : "",
      ) +
      records(
        rows,
        (a) =>
          panel(
            "",
            `<div class="pc-list-row"><div><h3>${esc(a.title)} ${a.isRead ? "" : '<span class="badge">未读</span>'}</h3>${multiline(a.content)}<small>${esc(a.createdAt)}</small></div>${a.isRead ? "" : action("标为已读", "read", `data-id="${esc(a.id)}"`)}</div>`,
            a.isRead ? "" : "parity-unread",
          ),
        "暂无消息",
      );
  }
  if (c.page === "live") {
    const rows = list(await get("/live/rooms"));
    body =
      head("专家科普与睡眠健康分享。") +
      tabs(
        "live",
        [
          ["", "全部"],
          ["live", "直播中"],
          ["upcoming", "预告"],
          ["replay", "回放"],
        ],
        filter,
      ) +
      `<div class="pc-grid two">${records(
        rows.filter((r) => !filter || r.status === filter),
        (a) =>
          panel(
            "",
            `${image(a.cover, a.title, "article-cover")}<div class="pc-list-row">${a.status === "replay" ? badge("回放") : badge(a.status)}<small>${esc(a.startTime)}</small></div><h2>${esc(a.title)}</h2><p>${esc(a.anchorName)}${a.viewerCount != null ? " · " + esc(a.viewerCount) + "人观看" : ""}</p><p>${(a.tags || []).map((t) => `<span class="badge">${esc(t)}</span>`).join("")}</p>${link("查看详情", "room", { id: a.id })}`,
          ),
        "暂无直播",
      )}</div>`;
  }
  if (c.page === "room") {
    const a = await get("/live/rooms/" + encodeURIComponent(p.get("id") || "")),
      video = safeUrl(a.replayUrl);
    body =
      head("", link("直播中心", "live")) +
      panel(
        a.title,
        `${a.status === "replay" ? badge("回放") : badge(a.status)}<p>${esc(a.anchorName)} · ${esc(a.startTime)}</p>${a.viewerCount != null ? `<p>${esc(a.viewerCount)}人观看</p>` : ""}${multiline(a.description)}${video ? `<video controls preload="metadata" src="${esc(video)}" poster="${esc(safeUrl(a.cover))}"></video>` : '<p class="notice">请在微信小程序直播中心打开对应直播间观看。</p>'}`,
      ) +
      (Array.isArray(a.products) && a.products.length
        ? panel(
            "直播好物",
            records(
              a.products,
              (i) =>
                `<div class="pc-list-row"><h3>${esc(i.name)}</h3><strong>${money(i.price)}</strong>${link("查看商品", "product", { id: i.productId || i.id })}</div>`,
            ),
          )
        : "");
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
      ) +
      (!a.birthday || !a.gender
        ? panel(
            "完善资料",
            `<div class="pc-list-row"><p>完善资料，有助于客服和门诊更好地服务你。</p>${link("去完善", "editProfile")}</div>`,
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
            ["优惠券", "coupons"],
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
          "账号与推广",
          [
            ["账号安全", "security"],
            ["我的推广", "distribution"],
          ],
        ],
      ]
        .map(([title, items]) =>
          panel(
            title,
            `<div class="parity-entry-grid">${items.map(([title, target]) => link(title, target)).join("")}</div>`,
          ),
        )
        .join("");
  }
  if (c.page === "family") {
    body =
      head("本人及家庭成员的就诊资料。", btn("新增就诊人", "member")) +
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
  if (c.page === "coupons") {
    const mine = list(await get("/user/coupons" + query({ status: "all" })));
    body =
      head("查看优惠券及积分兑换权益。") +
      tabs(
        "coupons",
        [
          ["", "全部"],
          ["active", "可使用"],
          ["used", "已使用"],
          ["expired", "已过期"],
        ],
        filter,
      ) +
      panel(
        "我的优惠券",
        `<div class="pc-grid two">${records(
          mine.filter((a) => !filter || a.status === filter),
          (a) =>
            `<article class="parity-coupon"><strong>${a.type === "discount" ? esc(a.value) + "折" : money(a.amount ?? a.discountAmount ?? a.value)}</strong><div><h3>${esc(a.title)}</h3><p>满 ${money(a.minSpend)} 可用</p><small>有效期至 ${date(a.validEnd)}</small><p>${badge(a.status)}</p></div></article>`,
          "暂无优惠券",
        )}</div>`,
      ) +
      panel(
        "积分兑换",
        records(
          c.coupons || [],
          (a) =>
            `<div class="pc-list-row"><div><h3>${esc(a.title)}</h3><p>${esc(a.pointsCost)} 积分 · 满 ${money(a.minSpend)} 可用</p></div>${action("兑换", "redeem", `data-id="${esc(a.id)}"`)}</div>`,
          "暂无可兑换优惠券",
        ),
      );
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

  if (["team", "commissions", "withdraws"].includes(c.page)) {
    const d = await get("/distribution/info"),
      rows = list(await get("/distribution/" + c.page));
    body = head("", link("推广概览", "distribution"));
    if (c.page === "team")
      body +=
        stats([
          ["一级成员", d.teamCount ?? rows.length],
          ["二级成员", d.teamLevel2Count ?? "—"],
          [
            "团队销售额",
            money(rows.reduce((n, a) => n + Number(a.totalSales || 0), 0)),
          ],
        ]) +
        panel(
          "团队成员",
          records(
            rows,
            (a) =>
              `<div class="pc-list-row"><div class="profile-heading">${image(a.avatar, a.nickname, "avatar")}<div><h3>${esc(a.nickname || a.name || "用户")}</h3><p>${esc(a.orderCount ?? 0)}单 · 加入 ${date(a.joinedAt)}</p></div></div><div>${a.statusText ? badge(a.statusText) : ""}<strong>${money(a.totalSales)}</strong></div></div>`,
            "暂无团队成员",
          ),
        );
    if (c.page === "commissions")
      body +=
        stats([
          ["累计佣金", money(d.totalCommission)],
          ["待结算", money(d.frozenCommission)],
          ["已结算", money(d.availableCommission)],
        ]) +
        tabs(
          "commissions",
          [
            ["", "全部"],
            ["pending", "待结算"],
            ["settled", "已结算"],
            ["refunded", "已撤销"],
          ],
          filter,
        ) +
        panel(
          "",
          records(
            rows.filter((a) => !filter || a.status === filter),
            (a) =>
              `<div class="pc-list-row"><div><h3>${esc(a.productName || a.orderNo)}</h3><p>${esc(a.buyerName || "")} · ${date(a.createdAt)}</p><small>${Number(a.commissionLevel) === 2 ? "二级佣金" : "一级佣金"}</small></div><div><strong>+${money(a.commission)}</strong>${a.status === "pending" ? badge("待结算") : a.status === "refunded" ? badge("已撤销") : status(a.status)}</div></div>`,
            "暂无佣金记录",
          ),
        );
    if (c.page === "withdraws")
      body += panel(
        "",
        records(
          rows,
          (a) =>
            `<div class="pc-list-row"><div><h3>−${money(a.amount)}</h3><p>${esc(a.accountInfo?.bankName || "银行卡")} ${esc(a.accountInfo?.accountNoMasked || a.accountInfo?.accountNo || "")}</p><small>${date(a.createdAt)}</small>${a.rejectReason ? multiline(a.rejectReason) : ""}</div><div>${badge({ pending: "待审核", approved: "审核通过", paid: "已到账", success: "已到账", rejected: "已驳回", processing: "处理中" }[a.status] || a.status)}<small>手续费 ${money(a.serviceFee ?? a.fee)} · 到账 ${money(a.actualAmount)}</small></div></div>`,
          "暂无提现记录",
        ),
      );
  }
  if (c.page === "distribution") {
    const d = c.distribution,
      rules = await get("/distribution/rules"),
      rows = list(await get("/distribution/orders"));
    body =
      body.replace(
        "<h2>推广概览</h2>",
        `<h2>推广概览</h2>${stats([["团队成员", d.teamCount ?? 0]])}`,
      ) +
      panel(
        "近期推广订单",
        records(
          rows.slice(0, 5),
          (a) =>
            `<div class="pc-list-row"><div><h3>${esc(a.productName || a.name || a.orderNo)}</h3><p>${esc(a.buyerName || "")} · ${date(a.createdAt)}</p></div><div>+${money(a.commission ?? a.commissionAmount)}${badge({ pending: "待结算", settled: "已结算", refunded: "已退款" }[a.status] || a.status)}</div></div>`,
          "暂无推广订单",
        ),
      ) +
      panel(
        "分销规则与说明",
        `<h3>开通条件</h3>${multiline(rules?.qualificationText)}${[
          ["佣金规则", "commissionRules"],
          ["推广方式", "promotionWays"],
          ["提现规则", "withdrawRules"],
        ]
          .map(
            ([title, key]) =>
              `<h3>${title}</h3><ul>${(rules?.[key] || []).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`,
          )
          .join("")}`,
      );
  }
  if (c.page === "withdraw") {
    const d = c.distribution,
      rate = d.withdrawFeeRates?.bank,
      min = d.minWithdrawAmount,
      valid =
        Number.isFinite(Number(rate)) &&
        rate != null &&
        Number.isSafeInteger(min) &&
        min >= 0;
    body =
      head(
        "提现至银行卡，提交后请等待审核。",
        link("查看提现记录", "withdraws"),
      ) +
      stats([
        ["可提现佣金", money(d.availableCommission)],
        ["累计佣金", money(d.totalCommission)],
        ["已提现", money(d.withdrawnAmount)],
      ]) +
      panel(
        "提现申请",
        valid
          ? form(
              "withdraw",
              field(
                "提现金额（元）",
                "amount",
                "",
                "number",
                `required min="${min / 100}" max="${Number(d.availableCommission || 0) / 100}" step="0.01" data-withdraw-amount data-fee-rate="${Number(rate)}"`,
              ) +
                `<p>到账方式：银行卡</p><p class="muted">微信零钱暂未开通</p><p>最低提现金额 ${money(min)}；银行卡手续费 ${Number(rate) * 100}%，最低 1 元。</p><div class="parity-fee" aria-live="polite"><span>手续费：<b data-withdraw-fee>¥0.00</b></span><span>预计到账：<b data-withdraw-net>¥0.00</b></span></div>` +
                field(
                  "开户银行",
                  "bankName",
                  "",
                  "text",
                  'required maxlength="100"',
                ) +
                field(
                  "开户姓名",
                  "accountName",
                  "",
                  "text",
                  'required maxlength="100"',
                ) +
                field(
                  "银行卡号",
                  "accountNo",
                  "",
                  "text",
                  'required pattern="[0-9]{8,34}" maxlength="34"',
                ) +
                submit("确认提现"),
            )
          : empty(
              "提现规则暂不可用，请稍后重试。",
              action("重新加载", "retry"),
            ),
      );
  }

  if (c.page === "service") {
    const messages = list(await get("/im/messages"));
    body =
      head("在线咨询就诊与服务问题。", action("刷新消息", "retry")) +
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
  return `<div class="pending-page" data-pending-page="${esc(c.page)}">${body}</div>`;
}
