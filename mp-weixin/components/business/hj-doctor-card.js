"use strict";
const t = require("../../common/vendor.js");
Math || o();
const o = () => "../base/hj-tag.js",
  e = t.defineComponent({
    __name: "hj-doctor-card",
    props: { doctor: {}, showSchedule: { type: Boolean } },
    emits: ["click"],
    setup: (o) => (o, e) => ({
      a: t.t(o.doctor.name.slice(0, 1)),
      b: t.t(o.doctor.name),
      c: t.p({ text: o.doctor.title, type: "primary", size: "sm" }),
      d: t.t(o.doctor.specialty),
      e: t.t(o.doctor.experience),
      f: t.f(o.doctor.expertise.slice(0, 2), (o, e, c) => ({
        a: t.t(o),
        b: o,
      })),
      g: t.t(o.doctor.rating),
      h: t.t(o.doctor.reviewCount),
      i: t.t(o.doctor.consultCount),
      j: t.o((t) => o.$emit("click", o.doctor), "32"),
    }),
  }),
  c = t._export_sfc(e, [["__scopeId", "data-v-906afe6e"]]);
wx.createComponent(c);
