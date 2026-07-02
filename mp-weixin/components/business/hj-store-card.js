"use strict";
const e = require("../../common/vendor.js"),
  t = e.defineComponent({
    __name: "hj-store-card",
    props: { store: {}, distance: {} },
    emits: ["click"],
    setup: (t) => (t, s) =>
      e.e(
        {
          statusPrepare: t.store.status === "prepare",
          a: !t.store.isOpen,
        },
        (t.store.isOpen, {}),
        {
          b: e.t(t.store.name),
          c: e.f(t.store.tags, (t, s, o) => ({ a: e.t(t), b: t })),
          d: e.t(t.store.address),
          e: e.t(t.store.doctorCount),
          f: e.t(t.store.businessHours),
          g: t.distance,
        },
        t.distance ? { h: e.t(t.distance) } : {},
        { i: e.o((e) => t.$emit("click", t.store), "a8") },
      ),
  }),
  s = e._export_sfc(t, [["__scopeId", "data-v-3c596062"]]);
wx.createComponent(s);
