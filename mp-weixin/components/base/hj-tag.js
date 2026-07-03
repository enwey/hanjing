"use strict";
const e = require("../../common/vendor.js"),
  o = e.defineComponent({
    __name: "hj-tag",
    props: { text: {}, type: { default: "default" }, size: { default: "sm" } },
    setup(o) {
      const typeStyles = {
        primary: { color: "#3B6BF5", bg: "#EEF4FF" },
        success: { color: "#16A34A", bg: "#D3F5E3" },
        warning: { color: "#D97706", bg: "#FFFBEB" },
        danger: { color: "#DC2626", bg: "#FEF2F2" },
        default: { color: "#6B7280", bg: "#F3F4F6" },
        gold: { color: "#E8960A", bg: "#FFF9E6" },
      };
      return (o, r) => ({
        a: e.t(o.text),
        b: e.n(`hj-tag--${o.size}`),
        c: typeStyles[o.type].color,
        d: typeStyles[o.type].bg,
      });
    },
  }),
  t = e._export_sfc(o, [["__scopeId", "data-v-822bb649"]]);
wx.createComponent(t);
