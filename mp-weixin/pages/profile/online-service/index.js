"use strict";
const e = require("../../../common/vendor.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  i = e.defineComponent({
    __name: "index",
    setup(t) {
      const i = e.ref([
          {
            id: "1",
            from: "assistant",
            text: "您好！我是鼾静健康诊所的在线客服，请问有什么可以帮您？",
            time: "10:30",
          },
          {
            id: "2",
            from: "user",
            text: "我想咨询一下阻鼾器的佩戴问题",
            time: "10:31",
          },
          {
            id: "3",
            from: "assistant",
            text: "好的，请问您目前佩戴的是哪个型号的阻鼾器？佩戴过程中遇到了什么具体问题？",
            time: "10:31",
          },
          {
            id: "4",
            from: "user",
            text: "HJ-MAD-03型号，戴了5天，感觉下颌有点酸",
            time: "10:32",
          },
          {
            id: "5",
            from: "assistant",
            text: "这是正常适应反应。初期佩戴1-2周内，下颌关节和牙齿可能会有轻微酸胀感，建议：\n1. 每天坚持佩戴6小时以上\n2. 睡前可以做几分钟张口闭口练习\n3. 如果2周后仍然明显不适，可以预约医生调整前移量\n\n您目前前移量是多少mm？",
            time: "10:33",
          },
        ]),
        a = e.ref("");
      function n() {
        a.value.trim() &&
          (i.value.push({
            id: String(Date.now()),
            from: "user",
            text: a.value.trim(),
            time: new Date().toTimeString().slice(0, 5),
          }),
          (a.value = ""),
          setTimeout(() => {
            i.value.push({
              id: String(Date.now() + 1),
              from: "assistant",
              text: "收到您的信息，我们会在工作时间（9:00-18:00）尽快回复。如需紧急帮助，请拨打客服热线：400-XXX-XXXX",
              time: new Date().toTimeString().slice(0, 5),
            });
          }, 1e3));
      }
      return (t, s) => {
        var o;
        return {
          a: e.p({ title: "在线客服", "show-back": !0 }),
          b: e.f(i.value, (t, i, a) => ({
            a: e.t(t.text),
            b: e.t(t.time),
            c: e.n(t.from),
            d: t.id,
            e: "msg-" + t.id,
            f: e.n(t.from),
          })),
          c:
            "msg-" +
            (null == (o = i.value[i.value.length - 1]) ? void 0 : o.id),
          d: e.o(n, "ef"),
          e: a.value,
          f: e.o((e) => (a.value = e.detail.value), "ad"),
          g: e.o(n, "08"),
        };
      };
    },
  }),
  a = e._export_sfc(i, [["__scopeId", "data-v-72504f8b"]]);
wx.createPage(a);
