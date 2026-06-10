"use strict";
const e = require("../../common/vendor.js"),
  o = e.defineComponent({
    __name: "hj-button",
    props: {
      type: { default: "primary" },
      size: { default: "md" },
      block: { type: Boolean, default: !1 },
      disabled: { type: Boolean, default: !1 },
      loading: { type: Boolean, default: !1 },
    },
    emits: ["click"],
    setup: (o) => (o, t) =>
      e.e({ a: o.loading }, (o.loading, {}), {
        b: e.n(`hj-button--${o.type}`),
        c: e.n(`hj-button--${o.size}`),
        d: e.n({
          "hj-button--block": o.block,
          "hj-button--disabled": o.disabled || o.loading,
        }),
        e: o.disabled || o.loading,
        f: o.disabled || o.loading ? "none" : "hj-button--hover",
        g: e.o((e) => o.$emit("click"), "85"),
      }),
  }),
  t = e._export_sfc(o, [["__scopeId", "data-v-f6f93744"]]);
wx.createComponent(t);
