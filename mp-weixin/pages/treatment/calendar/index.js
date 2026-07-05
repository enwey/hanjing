"use strict";
const e = require("../../../common/vendor.js"),
  a = require("../../../api/index.js");
Math || t();
const t = () => "../../../components/base/hj-navbar.js",
  r = e.defineComponent({
    __name: "index",
    setup(t) {
      const loading = e.ref(!0),
        wearingRecords = e.ref([]),
        currentMonth = e.ref(new Date()),
        wearingSummary = e.ref(null),
        showCheckinModal = e.ref(!1),
        submitting = e.ref(!1),
        isEditCheckin = e.ref(!1),
        durationHours = e.ref(7),
        comfortRating = e.ref(4),
        noteContent = e.ref(""),
        durationScrollLeft = e.ref(0);

      const durationOptionValues = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      function currentParams() {
        const patientId = e.index.getStorageSync("selected_treatment_patient_id") || "";
        const params = {
          _t: Date.now(),
        };
        if (patientId) {
          params.patientId = patientId;
        }
        return params;
      }

      const weekLabels = ["一", "二", "三", "四", "五", "六", "日"],
        recordMap = e.computed(() => {
          const map = {};
          wearingRecords.value.forEach((recordItem) => {
            if (recordItem && recordItem.date) {
              map[recordItem.date] = recordItem;
            }
          });
          return map;
        }),
        monthTitle = e.computed(() => {
          const monthDate = currentMonth.value;
          return `${monthDate.getFullYear()}年${monthDate.getMonth() + 1}月`;
        }),
        monthDays = e.computed(() => {
          const monthDate = currentMonth.value;
          const year = monthDate.getFullYear();
          const month = monthDate.getMonth();
          const firstDay = new Date(year, month, 1);
          const lastDay = new Date(year, month + 1, 0);
          const firstWeekday = (firstDay.getDay() + 6) % 7;
          const totalDays = lastDay.getDate();
          const cells = [];
          for (let index = 0; index < firstWeekday; index++) {
            cells.push({ id: `empty-start-${index}`, isEmpty: !0 });
          }
          for (let day = 1; day <= totalDays; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const recordItem = recordMap.value[dateStr] || null;
            const comfort = recordItem ? Number(recordItem.comfort || 0) : 0;
            const wearDuration = recordItem ? Number(recordItem.wearDuration || 0) : 0;
            cells.push({
              id: dateStr,
              date: dateStr,
              day,
              wearDuration,
              comfort,
              hasRecord: !!recordItem,
              isToday: dateStr === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
            });
          }
          while (cells.length % 7 !== 0) {
            cells.push({ id: `empty-end-${cells.length}`, isEmpty: !0 });
          }
          return cells;
        }),
        w = e.computed(() =>
          wearingSummary.value
            ? {
                worn: wearingSummary.value.weekWorn,
                avgHours: wearingSummary.value.weekAvg,
                avgComfort: wearingSummary.value.avgComfort,
                streak: wearingSummary.value.streak,
              }
            : { worn: 0, avgHours: 0, avgComfort: 0, streak: 0 }
        ),
        checkinDateStr = e.computed(() => {
          const today = new Date();
          const weeks = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
          return `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 ${weeks[today.getDay()]}`;
        });

      function getDayClass(dayItem) {
        if (dayItem.isEmpty) return "calendar-day--empty";
        if (!dayItem.hasRecord || dayItem.wearDuration <= 0) return dayItem.isToday ? "calendar-day--today" : "";
        if (dayItem.comfort >= 5) return "calendar-day--comfort5";
        if (dayItem.comfort === 4) return "calendar-day--comfort4";
        if (dayItem.comfort === 3) return "calendar-day--comfort3";
        if (dayItem.comfort === 2) return "calendar-day--comfort2";
        return "calendar-day--comfort1";
      }

      function scrollSelectedDurationToCenter(selectedDuration) {
        const selectedIndex = durationOptionValues.indexOf(selectedDuration);
        if (selectedIndex < 0) {
          durationScrollLeft.value = 0;
          return;
        }
        let windowWidth = 375;
        try {
          const windowInfo = e.index.getWindowInfo();
          windowWidth = windowInfo.windowWidth || windowWidth;
        } catch (err) {}
        const panelHorizontalPadding = 40;
        const optionWidth = 80;
        const optionGap = 8;
        const viewportWidth = Math.max(0, windowWidth - panelHorizontalPadding);
        const nextScrollLeft = selectedIndex * (optionWidth + optionGap) - (viewportWidth - optionWidth) / 2;
        durationScrollLeft.value = Math.max(0, Math.round(nextScrollLeft));
      }

      function selectWearDuration(duration) {
        durationHours.value = duration;
        scrollSelectedDurationToCenter(duration);
      }

      function openCheckinModal() {
        const todayObj = new Date(),
          todayDate = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`;
        const todayRecord = wearingRecords.value.find((recordItem) => recordItem.date === todayDate);
        ((null == todayRecord ? void 0 : todayRecord.wearDuration) && todayRecord.wearDuration > 0
          ? ((isEditCheckin.value = !0),
            (durationHours.value = todayRecord.wearDuration),
            (comfortRating.value = todayRecord.comfort),
            (noteContent.value = todayRecord.note || ""))
          : ((isEditCheckin.value = !1), (durationHours.value = 7), (comfortRating.value = 4), (noteContent.value = "")),
          (showCheckinModal.value = !0));
        setTimeout(() => {
          scrollSelectedDurationToCenter(durationHours.value);
        }, 0);
      }

      function closeCheckinModal() {
        showCheckinModal.value = !1;
      }

      async function submitCheckin() {
        submitting.value = !0;
        try {
          const todayObj = new Date(),
            t = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`;
          await a.submitWearingCheckin({
            ...currentParams(),
            date: t,
            wearDuration: durationHours.value,
            comfort: comfortRating.value,
            note: noteContent.value || void 0,
          });
          const [n, u] = await Promise.all([
            a.getWearingRecords(currentParams()),
            a.getWearingSummary(currentParams()),
          ]);
          ((wearingRecords.value = n.data || []),
            (wearingSummary.value = u.data || null),
            (showCheckinModal.value = !1),
            e.index.showToast({ title: "打卡成功", icon: "success" }));
        } catch (err) {
          const title = err && err.message ? err.message : "打卡失败";
          e.index.showToast({ title, icon: "none" });
        } finally {
          submitting.value = !1;
        }
      }

      async function loadData() {
        loading.value = !0;
        try {
          const params = currentParams();
          const [resRecords, resSummary] = await Promise.all([
            a.getWearingRecords(params),
            a.getWearingSummary(params),
          ]);
          wearingRecords.value = (resRecords && resRecords.data) || [];
          wearingSummary.value = resSummary.data || null;
        } catch (err) {
          console.error(err);
          wearingRecords.value = [];
          wearingSummary.value = null;
        } finally {
          loading.value = !1;
        }
      }

      function goPrevMonth() {
        const current = currentMonth.value;
        currentMonth.value = new Date(current.getFullYear(), current.getMonth() - 1, 1);
      }

      function goNextMonth() {
        const current = currentMonth.value;
        currentMonth.value = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }

      return (
        e.onMounted(loadData),
        e.onShow(loadData),
        (a, t) => {
          return e.e(
            {
              a: e.p({ title: "打卡日历", showBack: !0 }),
              b: e.t(monthTitle.value),
              c: e.o(goPrevMonth),
              d: e.o(goNextMonth),
              e: e.f(weekLabels, (item, index, key) => ({
                a: e.t(item),
                b: index,
              })),
              f: e.f(monthDays.value, (item, index, key) => ({
                a: item.isEmpty,
                b: e.t(item.day),
                c: item.wearDuration > 0 ? `${item.wearDuration}h` : "",
                d: item.day,
                e: getDayClass(item),
                f: item.id,
              })),
              g: loading.value,
              h: !loading.value && monthDays.value.filter((item) => item.hasRecord).length === 0,
              k: e.t(w.value.worn),
              l: e.t(w.value.avgHours),
              m: e.t(w.value.avgComfort),
              n: e.t(w.value.streak),
              o: e.o(openCheckinModal),
            },
            { A: showCheckinModal.value },
            showCheckinModal.value
              ? {
                  z1: e.t(checkinDateStr.value),
                  durationScrollLeft: e.unref(durationScrollLeft),
                  B: e.f(durationOptionValues, (a, t, n) => ({
                    a: e.t(a),
                    b: a,
                    c: durationHours.value === a ? 1 : "",
                    d: e.o(
                      () => selectWearDuration(a),
                      a,
                    ),
                  })),
                  C: e.f([1, 2, 3, 4, 5], (a, t, n) => ({
                    a: e.t(a),
                    b: a,
                    c: a <= comfortRating.value ? "comfort-star--active comfort-star--active-" + comfortRating.value : "",
                    d: e.o((e) => (comfortRating.value = a), a),
                  })),
                  D: noteContent.value,
                  E: e.o((e) => (noteContent.value = e.detail.value), "checkin-input"),
                  F: e.o(closeCheckinModal),
                  G: e.t(submitting.value ? "保存中..." : "确认打卡"),
                  H: submitting.value ? 1 : "",
                  I: e.o(submitCheckin),
                  J: e.o(() => {}),
                  K: e.o(closeCheckinModal),
                }
              : {}
          );
        }
      );
    },
  }),
  o = e._export_sfc(r, [["__scopeId", "data-v-c9f86960"]]);
wx.createPage(o);
