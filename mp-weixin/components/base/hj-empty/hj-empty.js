"use strict";
const e = require("../../../common/vendor.js"),
  t = e.defineComponent({
    __name: "hj-empty",
    props: { text: {}, icon: {} },
    setup: (t) => (t, o) => ({
      a: e.t(t.icon || "📋"),
      b: e.t(t.text || "暂无数据"),
    }),
  }),
  o = e._export_sfc(t, [["__scopeId", "data-v-39c3b333"]]);
wx.createComponent(o);
