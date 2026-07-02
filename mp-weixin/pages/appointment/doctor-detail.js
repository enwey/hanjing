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

    const getDoctorExpertise = (doc) => {
      if (!doc) return [];
      return Array.isArray(doc.expertise) ? doc.expertise : [];
    };

    const generateScheduleRows = (schedulesList = []) => {
      const rows = [];
      const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

      // Sort schedulesList by date and startTime
      schedulesList.sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        return a.startTime.localeCompare(b.startTime);
      });

      schedulesList.forEach(item => {
        // If it's today and not available (all slots booked or past), skip it!
        if (item.date === todayStr && item.status !== "available") {
          return;
        }

        const datePart = new Date(item.date.replace(/-/g, '/'));
        let dateLabel = "";
        if (item.date === todayStr) {
          dateLabel = `今天 (${datePart.getMonth() + 1}/${datePart.getDate()})`;
        } else if (item.date === tomorrowStr) {
          dateLabel = `明天 (${datePart.getMonth() + 1}/${datePart.getDate()})`;
        } else {
          dateLabel = `${days[datePart.getDay()]} (${datePart.getMonth() + 1}/${datePart.getDate()})`;
        }

        const periodLabel = item.period === "morning" ? "上午" : "下午";
        const timeRange = `${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)}`;
        
        rows.push({
          date: dateLabel,
          period: `${periodLabel} ${timeRange}`,
          statusText: item.status === "available" ? "可预约" : "已满",
          statusClass: item.status === "available" ? "status-available" : "status-full"
        });
      });

      return rows.slice(0, 4);
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

        // Load doctor's active schedules across all assigned stores
        let foundFuture = false;
        let schedulesList = [];
        if (doc.storeIds && doc.storeIds.length > 0) {
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          const next7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
          const next7DaysStr = `${next7Days.getFullYear()}-${String(next7Days.getMonth() + 1).padStart(2, "0")}-${String(next7Days.getDate()).padStart(2, "0")}`;
          
          const storesToQuery = queryStoreId.value ? [Number(queryStoreId.value)] : doc.storeIds;
          
          await Promise.all(
            storesToQuery.map(async (storeId) => {
              try {
                const res = await api.getSchedules({
                  doctorId: doc.id,
                  storeId,
                  startDate: todayStr,
                  endDate: next7DaysStr
                });
                const list = res.data || [];
                schedulesList = schedulesList.concat(list);
                if (list.some(d => d.date >= todayStr && d.status === 'available')) {
                  foundFuture = true;
                }
              } catch (err) {
                console.error("[DoctorDetail] Load schedules error:", err);
              }
            })
          );
        }

        hasFutureSchedules.value = foundFuture;
        if (schedulesList.length > 0) {
          scheduleRows.value = generateScheduleRows(schedulesList);
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
              g: e.f([doc.experience ? doc.experience + "年经验" : "", doc.title || "", doc.specialty || ""].filter(Boolean), (tag, idx) => ({
                a: e.t(tag),
                b: idx,
              })),
              h: e.t(doc.experience),
              i: e.t(doc.consultCount),
              j: e.t(Math.round(doc.rating * 20)),
              k: e.t(doc.intro || "暂无医生简介"),
              l: e.f(getDoctorExpertise(doc), (tag, idx) => ({
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
