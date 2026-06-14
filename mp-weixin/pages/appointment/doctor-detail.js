"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js");
Math || (o + n)();
const o = () => "../../components/base/hj-navbar.js",
  n = () => "../../components/business/hj-doctor-card.js",
  r = e.defineComponent({
    __name: "doctor-detail",
    setup(o) {
      const n = t.useDoctorStore(),
        r = t.useStoreStore(),
        s = t.useAppointmentStore(),
        a = e.ref(!0),
        d = e.ref("");
      e.onShow(async () => {
        const token = e.index.getStorageSync("access_token");
        if (!token) {
          e.index.navigateTo({ url: "/pages/auth/login" });
          return;
        }
      });
      e.onMounted(async () => {
        const token = e.index.getStorageSync("access_token");
        if (!token) {
          e.index.navigateTo({ url: "/pages/auth/login" });
          return;
        }
        var eVal, tVal;
        const o = getCurrentPages(),
          r = (null == (eVal = o[o.length - 1].$page) ? void 0 : eVal.options) || {};
        ((d.value =
          r.storeId || (null == (tVal = s.selectedStore) ? void 0 : tVal.id) || ""),
          0 === n.doctors.length &&
            (await n.fetchDoctors({ storeId: d.value })),
          (a.value = !1));
      });
      const c = e.computed(() =>
          d.value ? n.getDoctorsByStore(d.value) : n.doctors,
        ),
        l = e.computed(() => {
          var e, t;
          return (
            (null == (e = s.selectedStore) ? void 0 : e.name) ||
            (null == (t = r.getStoreById(d.value)) ? void 0 : t.name) ||
            ""
          );
        });
      return (t, o) =>
        e.e(
          {
            a: e.p({ title: l.value || "选择医生", "show-back": !0 }),
            b: e.t(c.value.length),
            c: c.value.length > 0,
          },
          c.value.length > 0
            ? {
                d: e.f(c.value, (t, o, n) => ({
                  a: "1b135653-1-" + n,
                  b: e.p({ doctor: t }),
                  c: t.id,
                  d: e.o(
                    (o) =>
                      (function (t) {
                        var o;
                        (s.selectDoctor(t),
                          e.index.navigateTo({
                            url: `/pages/appointment/time-select?doctorId=${t.id}&storeId=${d.value || (null == (o = s.selectedStore) ? void 0 : o.id)}`,
                          }));
                      })(t),
                    t.id,
                  ),
                })),
              }
            : {},
        );
    },
  }),
  s = e._export_sfc(r, [["__scopeId", "data-v-1b135653"]]);
wx.createPage(s);
