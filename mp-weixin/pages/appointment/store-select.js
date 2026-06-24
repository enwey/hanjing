const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js"),
  api = require("../../api/index.js");
Math || (s + o)();
const s = () => "../../components/base/hj-navbar.js",
  o = () => "../../components/business/hj-store-card.js",
  n = e.defineComponent({
    __name: "store-select",
    setup(s) {
      const o = t.useStoreStore(),
        n = t.useAppointmentStore(),
        docStore = t.useDoctorStore(),
        r = e.ref(!0),
        doctorId = e.ref(""),
        storesWithSchedules = e.ref([]);
      function a(t) {
        (n.selectStore(t),
          doctorId.value
            ? e.index.navigateTo({
                url: `/pages/appointment/time-select?doctorId=${doctorId.value}&storeId=${t.id}`,
              })
            : e.index.navigateTo({
                url: `/pages/appointment/doctor-list?storeId=${t.id}`,
              }));
      }
      const filteredStores = e.computed(() => {
        if (doctorId.value) {
          const doc = docStore.getDoctorById(doctorId.value);
          if (doc && doc.storeIds) {
            return o.stores.filter(s => doc.storeIds.some(id => t.matchStoreId(id, s.id)) && storesWithSchedules.value.some(id => t.matchStoreId(id, s.id)));
          }
          return [];
        }
        return o.stores;
      });
      return (
        e.onShow(async () => {
          const token = e.index.getStorageSync("access_token");
          if (!token) {
            e.index.navigateTo({ url: "/pages/auth/login" });
            return;
          }
        }),
        e.onMounted(async () => {
          const token = e.index.getStorageSync("access_token");
          if (!token) {
            e.index.navigateTo({ url: "/pages/auth/login" });
            return;
          }
          const pages = getCurrentPages();
          const curPage = pages[pages.length - 1] || {};
          const options = curPage.options || (curPage.$page && curPage.$page.options) || {};
          const targetDocId = options.doctorId || options.doctorid || "";
          if (targetDocId) {
            doctorId.value = targetDocId;
          }
          if (0 === docStore.doctors.length) {
            await docStore.fetchDoctors();
          }
          if (0 === o.stores.length) {
            await o.fetchStores();
          }

          if (doctorId.value) {
            const doc = docStore.getDoctorById(doctorId.value);
            if (doc && doc.storeIds) {
              const today = new Date();
              const year = today.getFullYear();
              const month = String(today.getMonth() + 1).padStart(2, "0");
              const day = String(today.getDate()).padStart(2, "0");
              const todayStr = `${year}-${month}-${day}`;

              const validStores = [];
              await Promise.all(
                doc.storeIds.map(async (storeId) => {
                  try {
                    const res = await api.getScheduleDates({ doctorId: doctorId.value, storeId });
                    const dates = res.data || [];
                    const hasFuture = dates.some(d => d.slice(0, 10) >= todayStr);
                    if (hasFuture) {
                      validStores.push(String(storeId));
                    }
                  } catch (err) {
                    console.error("[StoreSelect] Load schedules error:", err);
                  }
                })
              );
              storesWithSchedules.value = validStores;
            }
          }

          (r.value = !1);
        }),
        (t, s) => ({
          a: e.p({ title: "选择门店", "show-back": !0 }),
          b: e.t(filteredStores.value.length),
          c: e.f(filteredStores.value, (t, s, o) => ({
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
