"use strict";
const e = require("../../common/vendor.js"),
  o = require("../../stores/index.js");
Math || (t + s + n)();
const t = () => "../../components/base/hj-navbar.js",
  n = () => "../../components/business/hj-store-card.js",
  s = () => "../../components/business/hj-doctor-card.js",
  r = e.defineComponent({
    __name: "index",
    setup(t) {
      const n = o.useStoreStore(),
        s = o.useDoctorStore(),
        r = o.useAppointmentStore(),
        a = e.ref(!0),
        i = e.ref([]);
      function c() {
        (r.resetFlow(), e.index.switchTab({ url: "/pages/appointment/index" }));
      }
      function d(o) {
        (r.resetFlow(),
          r.selectDoctor(o),
          e.index.navigateTo({
            url: `/pages/appointment/doctor-detail?id=${o.id}`,
          }));
      }
      function p() {
        e.index.navigateTo({ url: "/pages/assessment/index" });
      }
      return (
        e.onMounted(async () => {
          (await Promise.all([n.fetchStores(), s.fetchDoctors()]),
            (i.value = s.doctors.slice(0, 3)),
            (a.value = !1));
        }),
        (o, t) => ({
          a: e.p({ transparent: !0, "text-color": "#FFFFFF" }),
          b: e.o(c, "69"),
          c: e.o(c, "23"),
          d: e.o(p, "f5"),
          e: e.o(
            (o) => e.index.switchTab({ url: "/pages/treatment/index" }),
            "82",
          ),
          f: e.o(
            (o) => e.index.switchTab({ url: "/pages/profile/index" }),
            "04",
          ),
          g: e.o(
            (o) => e.index.switchTab({ url: "/pages/appointment/index" }),
            "af",
          ),
          h: e.f(i.value, (o, t, n) => ({
            a: o.id,
            b: e.o(d, o.id),
            c: "e9eb3795-1-" + n,
            d: e.p({ doctor: o }),
          })),
          i: e.f(e.unref(n).stores, (o, t, n) => ({
            a: o.id,
            b: e.o(c, o.id),
            c: "e9eb3795-2-" + n,
            d: e.p({ store: o }),
          })),
        })
      );
    },
  }),
  a = e._export_sfc(r, [["__scopeId", "data-v-e9eb3795"]]);
wx.createPage(a);
