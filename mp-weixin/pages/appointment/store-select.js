"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js");
Math || (s + o)();
const s = () => "../../components/base/hj-navbar.js",
  o = () => "../../components/business/hj-store-card.js",
  n = e.defineComponent({
    __name: "store-select",
    setup(s) {
      const o = t.useStoreStore(),
        n = t.useAppointmentStore(),
        r = e.ref(!0);
      function a(t) {
        (n.selectStore(t),
          e.index.navigateTo({
            url: `/pages/appointment/doctor-detail?storeId=${t.id}`,
          }));
      }
      return (
        e.onMounted(async () => {
          (0 === o.stores.length && (await o.fetchStores()), (r.value = !1));
        }),
        (t, s) => ({
          a: e.p({ title: "选择门店", "show-back": !0 }),
          b: e.t(e.unref(o).stores.length),
          c: e.f(e.unref(o).stores, (t, s, o) => ({
            a: t.id,
            b: e.o(a, t.id),
            c: "c4ad3ae9-1-" + o,
            d: e.p({ store: t }),
          })),
        })
      );
    },
  }),
  r = e._export_sfc(n, [["__scopeId", "data-v-c4ad3ae9"]]);
wx.createPage(r);
