"use strict";
const e = require("../../../common/vendor.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  l = e.defineComponent({
    __name: "index",
    setup(a) {
      var l;
      const i = {
          "prod-001": {
            id: "prod-001",
            name: "鼾静 HJ-MAD-03 下颌前移式阻鼾器",
            desc: "医疗级定制材料，精准前移量调节",
            detail:
              "鼾静 HJ-MAD-03 采用医疗级生物相容性材料制造，可调节前移量范围 0.5-8mm（每步 0.5mm），适合中重度鼾症患者。内置气道预留孔设计，睡眠中可正常呼吸。通过 ISO 13485 医疗器械质量管理体系认证。",
            price: 89800,
            originalPrice: 128e3,
            image: "",
            category: "device",
            sales: 1280,
            badge: "热销",
            specs: [
              { label: "材质", value: "医疗级聚甲基丙烯酸甲酯" },
              { label: "调节范围", value: "0.5 - 8mm（每步 0.5mm）" },
              { label: "认证", value: "ISO 13485 / 国家二类医疗器械" },
              { label: "适用人群", value: "轻中重度阻塞型睡眠呼吸暂停" },
              { label: "保质期", value: "2年（正常使用）" },
            ],
          },
          "prod-002": {
            id: "prod-002",
            name: "鼾静 HJ-MAD-01 基础款阻鼾器",
            desc: "适合初次使用，舒适轻薄设计",
            detail:
              "鼾静 HJ-MAD-01 专为轻度鼾症患者及初次尝试阻鼾器的用户设计。采用超薄弹性材料，初次佩戴适应期通常仅需 3-5 天。前移量固定设计，操作简单，适合居家日常使用。",
            price: 59800,
            originalPrice: 79800,
            image: "",
            category: "device",
            sales: 860,
            badge: "入门推荐",
            specs: [
              { label: "材质", value: "弹性热塑材料" },
              { label: "前移量", value: "固定 3mm" },
              { label: "认证", value: "国家二类医疗器械" },
              { label: "适用人群", value: "轻度鼾症、初次使用者" },
              { label: "保质期", value: "1.5年（正常使用）" },
            ],
          },
          "prod-003": {
            id: "prod-003",
            name: "阻鼾器专用清洁片（30片装）",
            desc: "温和无刺激，彻底去除异味细菌",
            detail:
              "每片含微量过碳酸钠与柠檬酸，溶水后释放活性氧气泡，深层清洁阻鼾器细小缝隙，有效杀灭细菌和真菌。无刺激性气味，冲洗后无残留，每周使用 2-3 次。",
            price: 5800,
            originalPrice: 7800,
            image: "",
            category: "accessory",
            sales: 3200,
            badge: void 0,
            specs: [
              { label: "规格", value: "30片/盒" },
              { label: "用法", value: "一片溶于200ml温水，浸泡15分钟" },
              { label: "成分", value: "过碳酸钠、柠檬酸、表面活性剂" },
              { label: "适用", value: "所有鼾静阻鼾器型号" },
            ],
          },
          "prod-006": {
            id: "prod-006",
            name: "睡眠健康管理套餐（3个月）",
            desc: "含初诊评估 + 设备定制 + 3次复诊随访",
            detail:
              "3个月专项睡眠管理计划：① 首次面诊（ESS评估 + 牙模制作 + 方案制定）；② 定制阻鼾器 HJ-MAD-03 一副；③ 每月复诊随访 1 次（共3次），根据治疗进展调整方案；④ 专属健康顾问微信服务。",
            price: 158e3,
            originalPrice: 218e3,
            image: "",
            category: "service",
            sales: 156,
            badge: "限时优惠",
            specs: [
              { label: "包含", value: "初诊1次 + 定制设备1副 + 复诊3次" },
              { label: "有效期", value: "购买后6个月内使用" },
              { label: "服务方式", value: "线下门诊 + 线上随访" },
              { label: "可转让", value: "不可转让，需本人使用" },
            ],
          },
        },
        r = getCurrentPages(),
        o = r[r.length - 1],
        c =
          (null == (l = null == o ? void 0 : o.options) ? void 0 : l.id) ||
          "prod-001",
        t = e.ref(i[c] || i["prod-001"]),
        s = e.ref(!1);
      function v(e) {
        return "¥" + (e / 100).toFixed(2);
      }
      function u() {
        ((s.value = !0),
          e.index.showToast({ title: "已加入购物车", icon: "success" }));
      }
      function d() {
        e.index.showToast({
          title: "请前往门诊或联系顾问下单",
          icon: "none",
          duration: 2e3,
        });
      }
      const n = { device: "#D9E6FF", accessory: "#D3F5E3", service: "#FFF3CD" };
      return (a, l) => {
        return e.e(
          { a: e.p({ title: t.value.name, showBack: !0 }), b: t.value.image },
          t.value.image
            ? { c: t.value.image }
            : {
                d: e.t(
                  "device" === t.value.category
                    ? "⚕"
                    : "service" === t.value.category
                      ? "★"
                      : "◆",
                ),
              },
          { e: t.value.badge },
          t.value.badge ? { f: e.t(t.value.badge) } : {},
          {
            g: n[t.value.category] || "#F3F4F6",
            h: e.t(v(t.value.price)),
            i: t.value.originalPrice,
          },
          t.value.originalPrice ? { j: e.t(v(t.value.originalPrice)) } : {},
          {
            k: e.t(
              ((i = t.value.sales),
              i >= 1e3 ? (i / 1e3).toFixed(1) + "k" : String(i)),
            ),
            l: e.t(t.value.name),
            m: e.t(t.value.desc),
            n: e.f(t.value.specs, (a, l, i) => ({
              a: e.t(a.label),
              b: e.t(a.value),
              c: a.label,
            })),
            o: e.t(t.value.detail),
            p: e.t(s.value ? "已加入" : "加入咨询"),
            q: e.o(u, "27"),
            r: e.o(d, "51"),
          },
        );
        var i;
      };
    },
  }),
  i = e._export_sfc(l, [["__scopeId", "data-v-02d25a67"]]);
wx.createPage(i);
