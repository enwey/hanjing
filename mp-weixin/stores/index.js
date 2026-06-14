"use strict";
const e = require("../common/vendor.js"),
  t = require("../api/index.js"),
  n = require("../mock/index.js"),
  o = e.defineStore("user", () => {
    const n = e.ref(e.index.getStorageSync("access_token") || ""),
      o = e.ref(!!e.index.getStorageSync("access_token")),
      a = e.ref(null);
    return {
      token: n,
      isLoggedIn: o,
      profile: a,
      login: async function (phoneCode) {
        try {
          const r = await e.index.login(),
            l = (await t.wxLogin(r.code, phoneCode)).data;
          return (
            (n.value = l.access_token),
            (a.value = l.user),
            (o.value = !0),
            e.index.setStorageSync("access_token", l.access_token),
            l
          );
        } catch (r) {
          throw (console.error("[Login] 登录失败", r), r);
        }
      },
      fetchProfile: async function () {
        try {
          const e = await t.getUserProfile();
          a.value = e.data;
        } catch (e) {
          console.error("[Profile] 获取失败", e);
        }
      },
      logout: function () {
        ((n.value = ""),
          (a.value = null),
          (o.value = !1),
          e.index.removeStorageSync("access_token"));
      },
    };
  }),
  a = e.defineStore("store", () => {
    const n = e.ref([]),
      o = e.ref(!1);
    return {
      stores: n,
      loading: o,
      fetchStores: async function (e) {
        o.value = !0;
        try {
          const o = await t.getStores(e);
          n.value = o.data;
        } catch (a) {
          console.error("[Stores] 加载失败", a);
        } finally {
          o.value = !1;
        }
      },
      getStoreById: function (e) {
        return n.value.find((t) => t.id === e);
      },
    };
  }),
  r = e.defineStore("doctor", () => {
    const n = e.ref([]),
      o = e.ref(!1);
    return {
      doctors: n,
      loading: o,
      fetchDoctors: async function (e) {
        o.value = !0;
        try {
          const o = await t.getDoctors(e);
          n.value = o.data;
        } catch (a) {
          console.error("[Doctors] 加载失败", a);
        } finally {
          o.value = !1;
        }
      },
      getDoctorById: function (e) {
        return n.value.find((t) => t.id === e);
      },
      getDoctorsByStore: function (e) {
        return n.value.filter((t) => t.storeIds.includes(e));
      },
    };
  }),
  l = e.defineStore("appointment", () => {
    const n = e.ref(null),
      o = e.ref(null),
      a = e.ref(""),
      r = e.ref(null),
      l = e.ref(null),
      s = e.ref([]),
      c = e.ref([]),
      u = e.ref([]),
      i = e.ref([]),
      v = e.ref(!1),
      f = e.ref(1);
    return {
      selectedStore: n,
      selectedDoctor: o,
      selectedDate: a,
      selectedSchedule: r,
      selectedTimeSlot: l,
      scheduleDates: s,
      schedules: c,
      timeSlots: u,
      appointments: i,
      loading: v,
      currentStep: f,
      selectStore: function (e) {
        ((n.value = e), (f.value = 2));
      },
      selectDoctor: function (e) {
        ((o.value = e), (f.value = 3));
      },
      confirmTimeSlot: function (e, t) {
        ((r.value = e), (l.value = t), (a.value = e.date), (f.value = 4));
      },
      resetFlow: function () {
        ((n.value = null),
          (o.value = null),
          (a.value = ""),
          (r.value = null),
          (l.value = null),
          (s.value = []),
          (c.value = []),
          (u.value = []),
          (f.value = 1));
      },
      fetchScheduleDates: async function (e, n) {
        try {
          const o = await t.getScheduleDates({ doctorId: e, storeId: n });
          s.value = o.data;
        } catch (o) {
          console.error("[ScheduleDates] 加载失败", o);
        }
      },
      fetchSchedules: async function (e, n, o, a) {
        try {
          const r = await t.getSchedules({
            doctorId: e,
            storeId: n,
            startDate: o,
            endDate: a,
          });
          c.value = r.data;
        } catch (r) {
          console.error("[Schedules] 加载失败", r);
        }
      },
      fetchTimeSlots: async function (e) {
        try {
          const n = await t.getTimeSlots(e);
          u.value = n.data;
        } catch (n) {
          console.error("[TimeSlots] 加载失败", n);
        }
      },
      createAppointment: async function (e) {
        v.value = !0;
        try {
          const n = (await t.createAppointment(e)).data;
          return ((f.value = 5), n);
        } catch (n) {
          throw (console.error("[CreateAppointment] 创建失败", n), n);
        } finally {
          v.value = !1;
        }
      },
      fetchAppointments: async function (e) {
        v.value = !0;
        try {
          const n = await t.getAppointments({ status: e });
          i.value = n.data;
        } catch (n) {
          console.error("[Appointments] 加载失败", n);
        } finally {
          v.value = !1;
        }
      },
      cancelAppointment: async function (e, n) {
        try {
          await t.cancelAppointment(e, n);
          const o = i.value.findIndex((t) => t.id === e);
          o >= 0 &&
            ((i.value[o].status = "cancelled"), (i.value[o].cancelReason = n));
        } catch (o) {
          throw (console.error("[CancelAppointment] 取消失败", o), o);
        }
      },
      rescheduleAppointment: async function (e, n) {
        try {
          await t.rescheduleAppointment(e, n);
          const o = i.value.findIndex((t) => t.id === e);
          o >= 0 &&
            ((i.value[o].scheduleId = n.scheduleId),
            (i.value[o].appointmentDate = n.appointmentDate),
            (i.value[o].appointmentTime = n.appointmentTime));
        } catch (o) {
          throw (console.error("[Reschedule] 改约失败", o), o);
        }
      },
    };
  }),
  s = e.defineStore("assessment", () => {
    const o = e.ref([]),
      a = e.ref(0),
      r = e.ref([]),
      l = e.ref(null),
      s = e.ref([]),
      c = e.ref(!1),
      u = e.ref(!1),
      i = e.computed(() => o.value.length),
      v = e.computed(() => (i.value > 0 ? (a.value + 1) / i.value : 0)),
      f = e.computed(() => r.value.reduce((e, t) => e + t, 0)),
      d = e.computed(() => n.getESSLevel(f.value));
    return {
      questions: o,
      currentQuestion: a,
      answers: r,
      currentResult: l,
      assessments: s,
      loading: c,
      submitted: u,
      totalQuestions: i,
      progress: v,
      totalScore: f,
      levelInfo: d,
      fetchQuestions: async function () {
        try {
          const e = await t.getESSQuestions();
          ((o.value = e.data),
            (r.value = new Array(o.value.length).fill(-1)),
            (a.value = 0),
            (u.value = !1),
            (l.value = null));
        } catch (e) {
          console.error("[Assessment] 加载题目失败", e);
        }
      },
      selectAnswer: function (e) {
        r.value[a.value] = e;
      },
      next: function () {
        a.value < i.value - 1 && a.value++;
      },
      prev: function () {
        a.value > 0 && a.value--;
      },
      goToQuestion: function (e) {
        e >= 0 && e < i.value && (a.value = e);
      },
      submit: async function () {
        c.value = !0;
        try {
          const e = await t.submitESS({ answers: r.value });
          return ((l.value = e.data), (u.value = !0), l.value);
        } catch (e) {
          throw (console.error("[Assessment] 提交失败", e), e);
        } finally {
          c.value = !1;
        }
      },
      fetchAssessments: async function () {
        try {
          const e = await t.getAssessments();
          s.value = e.data;
        } catch (e) {
          console.error("[Assessment] 加载记录失败", e);
        }
      },
      reset: function () {
        ((o.value = []),
          (a.value = 0),
          (r.value = []),
          (l.value = null),
          (u.value = !1));
      },
    };
  });
((exports.useAppointmentStore = l),
  (exports.useAssessmentStore = s),
  (exports.useDoctorStore = r),
  (exports.useStoreStore = a),
  (exports.useUserStore = o));
