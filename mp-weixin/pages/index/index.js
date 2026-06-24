"use strict";
const e = require("../../common/vendor.js"),
  o = require("../../stores/index.js"),
  api = require("../../api/index.js");
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
        i = e.ref([]),
        j = e.ref("10,000+"),
        k = e.ref("98%"),
        l = e.ref("3");
      function c() {
        (r.resetFlow(), e.index.navigateTo({ url: "/pages/appointment/store-select" }));
      }
      function navigateToApptTab() {
        (r.resetFlow(), e.index.switchTab({ url: "/pages/appointment/index" }));
      }
      function handleStoreClick(store) {
        r.resetFlow();
        r.selectStore(store);
        e.index.navigateTo({
          url: `/pages/appointment/doctor-list?storeId=${store.id}`
        });
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
      function u() {
        const token = e.index.getStorageSync("access_token");
        if (!token) {
          e.index.navigateTo({ url: "/pages/auth/login" });
          return;
        }
        e.index.navigateTo({ url: "/pages/profile/medical-records/index" });
      }
      return (
        e.onMounted(async () => {
          let coords = null;
          try {
            coords = await new Promise((resolve) => {
              e.index.getLocation({
                type: "wgs84",
                success: (res) => resolve({ latitude: res.latitude, longitude: res.longitude }),
                fail: () => resolve(null)
              });
            });
          } catch (err) {
            // ignore
          }
          (await Promise.all([n.fetchStores(), s.fetchDoctors(coords || undefined)]),
            (i.value = s.doctors.slice(0, 3)));
          try {
            const res = await api.getHomeStats();
            if (res && res.code === 0) {
              j.value = res.data.totalPatients.toLocaleString() + "+";
              k.value = res.data.satisfactionRate + "%";
              l.value = res.data.storeCount.toString();
            }
          } catch (err) {
            console.error(err);
          }
          a.value = !1;
        }),
        (o, t) => ({
          a: e.p({ transparent: !0, "text-color": "#FFFFFF" }),
          b: e.o(c, "69"),
          c: e.o(navigateToApptTab, "23"),
          d: e.o(p, "f5"),
          e: e.o(
            (o) => e.index.switchTab({ url: "/pages/treatment/index" }),
            "82",
          ),
          f: e.o(u, "04"),
          g: e.o(
            (o) => e.index.navigateTo({ url: "/pages/appointment/doctor-list" }),
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
            b: e.o(handleStoreClick, o.id),
            c: "e9eb3795-2-" + n,
            d: e.p({ store: o }),
          })),
          j: e.unref(j),
          k: e.unref(k),
          l: e.unref(l)
        })
      );
    },
  }),
  a = e._export_sfc(r, [["__scopeId", "data-v-e9eb3795"]]);
wx.createPage(a);
