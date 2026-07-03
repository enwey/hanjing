"use strict";
const e = require("../../../common/vendor.js"),
  r = require("../../../api/index.js"),
  a = e.defineComponent({
    __name: "index",
    setup(a) {
      const rulesContent = e.ref(""),
        formattedHtmlRules = e.computed(
          () =>
            "<div>" +
            rulesContent.value
              .replace(/^### (.+)$/gm, "<h3>$1</h3>")
              .replace(/^## (.+)$/gm, "<h2>$1</h2>")
              .replace(/^# (.+)$/gm, "<h1>$1</h1>")
              .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
              .replace(/\n- /g, "\n<li>")
              .replace(/\n{2,}/g, "<br>")
              .replace(/\n/g, "<br>") +
            "</div>",
        );
      return (
        e.onMounted(async () => {
          var e;
          try {
            const a = await r.getDistributionRules();
            rulesContent.value =
              (null == (e = a.data) ? void 0 : e.rules) || a.rules || "";
          } catch (err) {}
        }),
        (e, r) => ({ a: formattedHtmlRules.value })
      );
    },
  }),
  n = e._export_sfc(a, [["__scopeId", "data-v-9e9a64dc"]]);
wx.createPage(n);
