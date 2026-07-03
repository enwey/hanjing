const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js"),
  api = require("../../api/index.js");
Math || (s + o)();
const s = () => "../../components/base/hj-navbar.js",
  o = () => "../../components/business/hj-store-card.js",
  n = e.defineComponent({
    __name: "store-select",
    setup(s) {
      const clinicStore = t.useClinicStore(),
        n = t.useAppointmentStore(),
        docStore = t.useDoctorStore(),
        r = e.ref(!0),
        doctorId = e.ref(""),
        storesWithSchedules = e.ref([]),
        schedulesChecked = e.ref(false),
        userLocation = e.ref(null);

      function getUserLocation() {
        e.index.getLocation({
          type: "wgs84",
          success: (res) => {
            userLocation.value = {
              latitude: res.latitude,
              longitude: res.longitude
            };
          },
          fail: (err) => {
            console.error("获取定位失败", err);
          }
        });
      }

      function getDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return null;
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const aVal = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const cVal = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
        return R * cVal;
      }

      function formatDistance(km) {
        if (km === null || km === undefined || isNaN(km)) return "";
        if (km < 1) {
          return `${Math.round(km * 1000)}m`;
        }
        return `${km.toFixed(1)}km`;
      }

      function handleStoreSelect(t) {
        if (t.status === "prepare") {
          e.index.showToast({
            title: "该门店正在筹建中，暂未开放预约，敬请期待！",
            icon: "none",
            duration: 2000
          });
          return;
        }
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
        let list = [];
        if (schedulesChecked.value) {
          list = clinicStore.stores.filter(s => s.status === "prepare" || storesWithSchedules.value.some(id => t.matchStoreId(id, s.id)));
        } else if (doctorId.value) {
          const doc = docStore.getDoctorById(doctorId.value);
          if (doc && doc.storeIds) {
            list = clinicStore.stores.filter(s => s.status === "prepare" || (doc.storeIds.some(id => t.matchStoreId(id, s.id)) && storesWithSchedules.value.some(id => t.matchStoreId(id, s.id))));
          } else {
            list = clinicStore.stores.filter(s => s.status === "prepare");
          }
        } else {
          list = [...clinicStore.stores];
        }

        if (userLocation.value) {
          list = list.map(store => {
            const dist = getDistance(
              userLocation.value.latitude,
              userLocation.value.longitude,
              parseFloat(store.latitude),
              parseFloat(store.longitude)
            );
            return {
              ...store,
              _distanceVal: dist,
              _distanceStr: formatDistance(dist)
            };
          });
          list.sort((a, b) => {
            if (a._distanceVal === null || isNaN(a._distanceVal)) return 1;
            if (b._distanceVal === null || isNaN(b._distanceVal)) return -1;
            return a._distanceVal - b._distanceVal;
          });
        }
        return list;
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
          getUserLocation();
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
          const initPromises = [];
          if (0 === docStore.doctors.length) {
            initPromises.push(docStore.fetchDoctors());
          }
          if (0 === clinicStore.stores.length) {
            initPromises.push(clinicStore.fetchStores());
          }
          if (initPromises.length > 0) {
            await Promise.all(initPromises);
          }
          console.log("[StoreSelect] fetched stores:", JSON.stringify(clinicStore.stores));

          const today = new Date();
          const year = today.getFullYear();
          const month = String(today.getMonth() + 1).padStart(2, "0");
          const day = String(today.getDate()).padStart(2, "0");
          const todayStr = `${year}-${month}-${day}`;
          const validStores = [];

          if (doctorId.value) {
            const doc = docStore.getDoctorById(doctorId.value);
            if (doc && doc.storeIds) {
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
            }
          } else {
            await Promise.all(
              clinicStore.stores.map(async (store) => {
                const doctors = docStore.getDoctorsByStore(store.id);
                const doctorSchedulesResults = await Promise.all(
                  doctors.map(async (doc) => {
                    try {
                      const res = await api.getScheduleDates({ doctorId: doc.id, storeId: store.id });
                      const dates = res.data || [];
                      return dates.some(d => d.slice(0, 10) >= todayStr);
                    } catch (err) {
                      console.error("[StoreSelect] Load store schedules error:", err);
                      return false;
                    }
                  })
                );
                if (doctorSchedulesResults.some(hasFuture => hasFuture)) {
                  validStores.push(String(store.id));
                }
              })
            );
          }
          storesWithSchedules.value = validStores;
          schedulesChecked.value = true;

          (r.value = !1);
        }),
        (t, s) => ({
          a: e.p({ title: "选择门店", "show-back": !0 }),
          b: e.t(filteredStores.value.length),
          c: e.f(filteredStores.value, (t, s, o) => ({
            a: t.id,
            b: e.o(handleStoreSelect, t.id),
            c: "c4ad3ae9-1-" + o,
            d: e.p({ store: t, distance: t._distanceStr || "" }),
          })),
        })
      );
    },
  }),
  r = e._export_sfc(n, [["__scopeId", "data-v-c4ad3ae9"]]);
wx.createPage(r);
