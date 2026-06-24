"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js"),
  api = require("../../api/index.js");

const r = e.defineComponent({
  __name: "doctor-detail",
  setup() {
    const docStore = t.useDoctorStore(),
      storeStore = t.useStoreStore(),
      apptStore = t.useAppointmentStore(),
      doctor = e.ref(null),
      avatarChar = e.ref(""),
      queryStoreId = e.ref(""),
      hasFutureSchedules = e.ref(true),
      scheduleRows = e.ref([]);

    const generateScheduleRows = () => {
      const rows = [];
      const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const today = new Date();

      // Row 1: Today morning
      const d1 = new Date(today);
      rows.push({
        date: `今天 (${d1.getMonth() + 1}/${d1.getDate()})`,
        period: "上午 9:00-12:00",
        statusText: "可预约",
        statusClass: "status-available"
      });

      // Row 2: Today afternoon
      rows.push({
        date: `今天 (${d1.getMonth() + 1}/${d1.getDate()})`,
        period: "下午 14:00-17:00",
        statusText: "可预约",
        statusClass: "status-available"
      });

      // Row 3: Tomorrow morning
      const d2 = new Date(today);
      d2.setDate(today.getDate() + 1);
      rows.push({
        date: `${days[d2.getDay()]} (${d2.getMonth() + 1}/${d2.getDate()})`,
        period: "上午 9:00-12:00",
        statusText: "已满",
        statusClass: "status-full"
      });

      return rows;
    };

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

      const docId = (options && options.id) || "";
      queryStoreId.value = (options && options.storeId) || "";

      if (docStore.doctors.length === 0) {
        await docStore.fetchDoctors();
      }
      
      if (storeStore.stores.length === 0) {
        await storeStore.fetchStores();
      }

      let doc = docStore.getDoctorById(docId);
      if (!doc) {
        await docStore.fetchDoctors();
        doc = docStore.getDoctorById(docId);
      }

      if (doc) {
        doctor.value = doc;
        avatarChar.value = doc.name ? doc.name.slice(0, 1) : "";

        // Check if there are any future schedules in any of the stores
        let foundFuture = false;
        if (doc.storeIds && doc.storeIds.length > 0) {
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          
          await Promise.all(
            doc.storeIds.map(async (storeId) => {
              try {
                const res = await api.getScheduleDates({ doctorId: doc.id, storeId });
                const dates = res.data || [];
                if (dates.some(d => d.slice(0, 10) >= todayStr)) {
                  foundFuture = true;
                }
              } catch (err) {
                console.error("[DoctorDetail] Load schedules error:", err);
              }
            })
          );
        }

        hasFutureSchedules.value = foundFuture;
        if (foundFuture) {
          scheduleRows.value = generateScheduleRows();
        } else {
          scheduleRows.value = [];
        }
      }
    });

    function onBook() {
      if (!doctor.value || !hasFutureSchedules.value) return;
      apptStore.selectDoctor(doctor.value);
      
      const finalStoreId = queryStoreId.value || (apptStore.selectedStore ? apptStore.selectedStore.id : "");
      if (finalStoreId) {
        e.index.navigateTo({
          url: `/pages/appointment/time-select?doctorId=${doctor.value.id}&storeId=${finalStoreId}`
        });
      } else {
        e.index.navigateTo({
          url: `/pages/appointment/store-select?doctorId=${doctor.value.id}`
        });
      }
    }

    return (t, o) => {
      const doc = doctor.value;
      return e.e(
        {
          a: e.p({ title: "医生详情", "show-back": !0 }),
          b: doc ? 1 : "",
        },
        doc
          ? {
              c: e.t(avatarChar.value),
              d: e.t(doc.name),
              e: e.t(doc.title),
              f: e.t(doc.specialty),
              g: e.f([doc.experience + "年经验", "OSAHS专家", "在职/在线"], (tag, idx) => ({
                a: e.t(tag),
                b: idx,
              })),
              h: e.t(doc.experience),
              i: e.t(doc.consultCount),
              j: e.t(Math.round(doc.rating * 20)),
              k: e.t(doc.intro || "暂无医生简介"),
              l: e.f(doc.expertise || [], (tag, idx) => ({
                a: e.t(tag),
                b: idx,
              })),
              m: e.f(scheduleRows.value, (row, idx) => ({
                a: e.t(row.date),
                b: e.t(row.period),
                c: e.t(row.statusText),
                d: row.statusClass,
                e: idx,
              })),
              n: e.o(onBook),
              o: !hasFutureSchedules.value,
              p: e.t(hasFutureSchedules.value ? "立即预约" : "暂不接诊"),
              q: scheduleRows.value.length > 0,
            }
          : {}
      );
    };
  }
});

const s = e._export_sfc(r, [["__scopeId", "data-v-detail"]]);
wx.createPage(s);
