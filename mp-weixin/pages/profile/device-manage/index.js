"use strict";
const e = require("../../../common/vendor.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  o = e.defineComponent({
    __name: "index",
    setup(a) {
      const o = [
        {
          icon: "data",
          label: "佩戴数据",
          desc: "每日佩戴时长与舒适度",
          url: "/pages/profile/device-manage/wearing-data",
          color: "#3B6BF5",
        },
        {
          icon: "maintain",
          label: "维护记录",
          desc: "清洁、调整与维修记录",
          url: "/pages/profile/device-manage/maintenance",
          color: "#1A9D5C",
        },
        {
          icon: "feedback",
          label: "使用反馈",
          desc: "提交使用感受与问题",
          url: "/pages/profile/device-manage/feedback",
          color: "#F59E0B",
        },
      ];
      return (a, n) => ({
        a: e.p({ title: "阻鼾器管理", "show-back": !0 }),
        b: e.f(o, (a, o, n) => ({
          a: e.t("data" === a.icon ? "T" : "maintain" === a.icon ? "M" : "F"),
          b: a.color + "15",
          c: a.color,
          d: e.t(a.label),
          e: e.t(a.desc),
          f: a.label,
          g: e.o((o) => {
            return ((n = a.url), void e.index.navigateTo({ url: n }));
            var n;
          }, a.label),
        })),
      });
    },
  }),
  n = e._export_sfc(o, [["__scopeId", "data-v-75e661b4"]]);
wx.createPage(n);
