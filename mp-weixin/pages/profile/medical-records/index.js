"use strict";
const e = require("../../../common/vendor.js"),
  t = require("../../../api/index.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  o = e.defineComponent({
    __name: "index",
    setup(a) {
      const o = e.ref([]),
        s = e.ref(!0);
      function previewAttachment(urls) {
        if (urls && urls.length > 0) {
          e.index.previewImage({
            urls: urls,
            current: urls[0]
          });
        }
      }
      e.onMounted(async () => {
        var e;
        const a = await t.getMedicalRecords();
        ((o.value = (null == (e = a.data) ? void 0 : e.list) || a.list || []),
          (s.value = !1));
      });
      const n = { first: "初诊", followup: "复诊", adjust: "调整" },
        i = { first: "#3B6BF5", followup: "#1A9D5C", adjust: "#F59E0B" };
      return (t, a) =>
        e.e(
          { a: e.p({ title: "病历档案", "show-back": !0 }), b: s.value },
          s.value
            ? {}
            : e.e(
                {
                  c: e.f(o.value, (t, a, o) =>
                    e.e(
                      {
                        a: e.t(n[t.type]),
                        b: i[t.type] + "18",
                        c: i[t.type],
                        d: e.t(t.visitDate),
                        e: e.t(t.doctorName),
                        f: e.t(t.hospital),
                        g: e.t(t.diagnosis),
                        h: t.prescription,
                      },
                      t.prescription ? { i: e.t(t.prescription) } : {},
                      { j: t.note },
                      t.note ? { k: e.t(t.note) } : {},
                      {
                        hasAttachments: t.attachments && t.attachments.length > 0,
                        onPreview: e.o(() => previewAttachment(t.attachments), t.id)
                      },
                      { l: t.id },
                    ),
                  ),
                  d: 0 === o.value.length,
                },
                (o.value.length, {}),
              ),
        );
    },
  }),
  s = e._export_sfc(o, [["__scopeId", "data-v-04031480"]]);
wx.createPage(s);
