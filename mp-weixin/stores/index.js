"use strict";
const e = require("../common/vendor.js"),
  t = require("../api/index.js");

function getESSLevel(score) {
  return score <= 5
    ? {
        level: "正常（低嗜睡倾向）",
        color: "#1A9D5C",
        desc: "您的日间嗜睡程度在正常范围内，白天精神状态良好。",
        advice:
          "保持现有作息规律，定期关注睡眠质量变化。如仍存在打鼾问题，建议进行睡眠评估。",
      }
    : score <= 10
      ? {
          level: "正常偏高",
          color: "#3B6BF5",
          desc: "您的日间嗜睡程度略高于正常范围，可能存在轻度睡眠质量下降。",
          advice:
            "注意保持规律作息，避免熬夜。建议使用APP内的AI鼾声分析功能，了解夜间睡眠状况。",
        }
      : score <= 12
        ? {
            level: "轻度嗜睡",
            color: "#F59E0B",
            desc: "您存在轻度日间过度嗜睡，可能影响日常工作和生活质量。",
            advice:
              "建议在线预约睡眠呼吸门诊，进行专业的睡眠评估。及早干预可有效改善睡眠质量。",
          }
        : score <= 15
          ? {
              level: "中度嗜睡",
              color: "#F97316",
              desc: "您存在中度日间嗜睡，日常活动受到明显影响，需引起重视。",
              advice:
                "强烈建议尽快预约专业门诊。可能需要进行睡眠监测，评估是否存在睡眠呼吸暂停。",
            }
          : {
              level: "重度嗜睡",
              color: "#EF4444",
              desc: "您存在重度日间嗜睡，可能对健康和安全造成严重影响（如驾驶风险）。",
              advice:
                "请立即预约鼾静健康门诊进行专业诊断。建议避免长途驾驶，尽快进行多导睡眠监测（PSG）。",
            };
}

function matchStoreId(id1, id2) {
  const s1 = String(id1);
  const s2 = String(id2);
  if (s1 === s2) return true;
  const normalize = (id) => {
    if (id === "1" || id === "store-001") return "1";
    if (id === "2" || id === "store-002") return "2";
    if (id === "3" || id === "store-003") return "3";
    if (id === "4" || id === "store-004") return "4";
    return id;
  };
  return normalize(s1) === normalize(s2);
}

function matchDoctorId(id1, id2) {
  const d1 = String(id1);
  const d2 = String(id2);
  if (d1 === d2) return true;
  const normalize = (id) => {
    if (id === "1" || id === "doc-001") return "1";
    if (id === "2" || id === "doc-002") return "2";
    if (id === "3" || id === "doc-003") return "3";
    if (id === "4" || id === "doc-004") return "4";
    return id;
  };
  return normalize(d1) === normalize(d2);
}

const o = e.defineStore("user", () => {
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
          (n.value = l.access_token),
            (a.value = l.user),
            (o.value = !0),
            e.index.setStorageSync("access_token", l.access_token);

          const pendingCode = e.index.getStorageSync("pending_invite_code");
          if (pendingCode) {
            try {
              const bindRes = await t.bindDistribution(pendingCode);
              const bindStatus =
                (bindRes && bindRes.data && bindRes.data.status) ||
                bindRes.status ||
                "bound";
              if (
                "bound" === bindStatus ||
                "already_bound" === bindStatus ||
                "ignored_self" === bindStatus
              ) {
                e.index.removeStorageSync("pending_invite_code");
              }
              console.log("[Login] 登录后邀请码绑定结果:", bindStatus);
            } catch (bindErr) {
              if (
                bindErr &&
                (bindErr.message === "无效的邀请码" ||
                  bindErr.message === "邀请码不能为空")
              ) {
                e.index.removeStorageSync("pending_invite_code");
              }
              console.error("[Login] 绑定分销关系失败", bindErr);
            }
          }
          return (
            l
          );
        } catch (r) {
          throw (console.error("[Login] 登录失败", r), r);
        }
      },
      fetchProfile: async function () {
        console.log("[User Store] fetchProfile starting...");
        try {
          const e = await t.getUserProfile();
          console.log("[User Store] fetchProfile API response:", JSON.stringify(e));
          a.value = e.data;
          console.log("[User Store] profile set in store:", JSON.stringify(a.value));
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
        return n.value.find((t) => matchStoreId(t.id, e));
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
        return n.value.find((t) => matchDoctorId(t.id, e));
      },
      getDoctorsByStore: function (e) {
        return n.value.filter((t) => t.storeIds && t.storeIds.some(id => matchStoreId(id, e)));
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
          const params = {};
          if (e !== undefined && e !== null && e !== "") {
            params.status = e;
          }
          const n = await t.getAppointments(params);
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
      d = e.computed(() => getESSLevel(f.value));
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
      submit: async function (patientId) {
        c.value = !0;
        try {
          const e = await t.submitESS({ answers: r.value, patientId });
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
  (exports.useUserStore = o),
  (exports.matchStoreId = matchStoreId),
  (exports.matchDoctorId = matchDoctorId));
