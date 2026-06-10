"use strict";
const e = require("../../../../common/vendor.js"),
  a = require("../../../../api/index.js");
Math || t();
const t = () => "../../../../components/base/hj-navbar.js",
  n = e.defineComponent({
    __name: "index",
    setup(t) {
      const n = e.ref([]),
        r = e.ref(!0);
      e.onMounted(async () => {
        const e = await a.getWearingRecords();
        ((n.value = e.data || e || []), (r.value = !1));
      });
      const o = { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" };
      return (a, t) =>
        e.e(
          { a: e.p({ title: "佩戴数据", "show-back": !0 }), b: r.value },
          r.value
            ? {}
            : e.e(
                {
                  c: e.f(n.value, (a, t, n) =>
                    e.e(
                      { a: e.t(a.date), b: a.wearDuration > 0 },
                      a.wearDuration > 0 ? { c: e.t(a.wearDuration) } : {},
                      { d: a.wearDuration > 0 },
                      a.wearDuration > 0 ? { e: e.t(o[a.comfort || 3]) } : {},
                      { f: a.wearDuration > 0 },
                      a.wearDuration > 0
                        ? {
                            g: (a.wearDuration / 8) * 100 + "%",
                            h:
                              a.wearDuration >= 6
                                ? "#1A9D5C"
                                : a.wearDuration >= 4
                                  ? "#F59E0B"
                                  : "#EF4444",
                          }
                        : {},
                      { i: a.note },
                      a.note ? { j: e.t(a.note) } : {},
                      { k: a.id },
                    ),
                  ),
                  d: 0 === n.value.length,
                },
                (n.value.length, {}),
              ),
        );
    },
  }),
  r = e._export_sfc(n, [["__scopeId", "data-v-0ef6c91e"]]);
wx.createPage(r);
