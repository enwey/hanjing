"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js");
Math || (o + n)();
const o = () => "../../components/base/hj-navbar.js",
  n = () => "../../components/business/hj-doctor-card.js",
  r = e.defineComponent({
    __name: "doctor-list",
    setup(o) {
      const n = t.useDoctorStore(),
        clinicStore = t.useClinicStore(),
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

      e.onLoad(async (options) => {
        const token = e.index.getStorageSync("access_token");
        if (!token) {
          e.index.navigateTo({ url: "/pages/auth/login" });
          return;
        }
        
        // Only use storeId if explicitly passed in route parameters, do not fallback to session selectedStore
        d.value = (options && options.storeId) || "";
        
        // Always force a fresh fetch from backend recommendations or store mappings
        await n.fetchDoctors(d.value ? { storeId: d.value } : undefined);
        a.value = !1;
      });

      const c = e.computed(() =>
          d.value ? n.getDoctorsByStore(d.value) : n.doctors,
        ),
      l = e.computed(() => {
        var e, t;
        return (
          (null == (e = s.selectedStore) ? void 0 : e.name) ||
          (null == (t = clinicStore.getStoreById(d.value)) ? void 0 : t.name) ||
          ""
        );
      });

      return (t, o) =>
        e.e(
          {
            a: e.p({ title: l.value || "推荐医生", "show-back": !0 }),
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
                    () => {
                      s.selectDoctor(t);
                      if (d.value) {
                        e.index.navigateTo({
                          url: `/pages/appointment/time-select?doctorId=${t.id}&storeId=${d.value}`,
                        });
                      } else {
                        e.index.navigateTo({
                          url: `/pages/appointment/doctor-detail?id=${t.id}`,
                        });
                      }
                    },
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
