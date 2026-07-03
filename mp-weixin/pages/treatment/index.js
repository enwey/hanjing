"use strict";
const e = require("../../common/vendor.js"),
  a = require("../../api/index.js");
Math || (t + n)();
const t = () => "../../components/base/hj-navbar.js",
  n = () => "../../components/base/hj-empty.js",
  u = e.defineComponent({
    __name: "index",
    setup(t) {
      const n = e.ref(!0),
        u = e.ref(null),
        o = e.ref([]),
        l = e.ref([]),
        r = e.ref(null),
        i = e.ref(!1),
        v = e.ref(6),
        d = e.ref(4),
        c = e.ref(""),
        s = e.ref(!1),
        f = e.ref(!1),
        members = e.ref([]),
        selectedPatientId = e.ref(e.index.getStorageSync("selected_treatment_patient_id") || ""),
        memberNames = e.computed(() => members.value.map(item => item.relation === "self" ? `${item.name}（本人）` : `${item.name}（${item.relation || "成员"}）`)),
        memberIndex = e.computed(() => Math.max(0, members.value.findIndex(item => String(item.id) === String(selectedPatientId.value)))),
        m = e.computed(() =>
          u.value
            ? {
                model: u.value.deviceModel,
                adjustValue: u.value.adjustmentValue,
                startDate: u.value.createdAt.split("T")[0],
                doctorName: u.value.doctorName || "",
                nextAdjust: u.value.nextAdjustDate,
              }
            : null,
        ),
        g = e.computed(() => {
          const e = [],
            a = new Date(),
            t = ["日", "一", "二", "三", "四", "五", "六"];
          for (let n = 6; n >= 0; n--) {
            const u = new Date(a);
            u.setDate(u.getDate() - n);
            const l = `${u.getFullYear()}-${String(u.getMonth() + 1).padStart(2, "0")}-${String(u.getDate()).padStart(2, "0")}`,
              r = o.value.find((e) => e.date === l) || null;
            e.push({
              date: l,
              dayOfWeek: t[u.getDay()],
              dayNum: u.getDate(),
              record: r,
              isToday: 0 === n,
              isFuture: n < 0,
            });
          }
          return e;
        }),
        p = e.computed(() => (r.value ? r.value.compliance : 0)),
        w = e.computed(() =>
          r.value
            ? {
                worn: r.value.weekWorn,
                avgHours: r.value.weekAvg,
                avgComfort: r.value.avgComfort,
                streak: r.value.streak,
              }
            : { worn: 0, avgHours: 0, avgComfort: 0, streak: 0 },
        ),
        checkinDateStr = e.computed(() => {
          const today = new Date();
          const weeks = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
          return `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 ${weeks[today.getDay()]}`;
        });
      function getRecordColor(e) {
        if (e.isFuture) return "#E5E7EB";
        if (!e.record || 0 === e.record.wearDuration) return "#F3F4F6";
        const comfort = e.record.comfort || 3;
        if (comfort === 1) return "#EF4444";
        if (comfort === 2) return "#EAB308";
        if (comfort === 3) return "#06B6D4";
        if (comfort === 4) return "#4ADE80";
        if (comfort === 5) return "#15803D";
        return "#06B6D4";
      }
      function openCheckinModal() {
        const todayObj = new Date(),
          e = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`;
          const a = o.value.find((a) => a.date === e);
        ((null == a ? void 0 : a.wearDuration) && a.wearDuration > 0
          ? ((f.value = !0),
            (v.value = a.wearDuration),
            (d.value = a.comfort),
            (c.value = a.note || ""))
          : ((f.value = !1), (v.value = 6), (d.value = 4), (c.value = "")),
          (i.value = !0));
      }
      function closeCheckinModal() {
        i.value = !1;
      }
      function queryParams() {
        return selectedPatientId.value ? { patientId: selectedPatientId.value } : {};
      }
      async function loadData() {
        const memberRes = await a.getFamilyMembers();
        members.value = (memberRes.data && memberRes.data.list) || memberRes.list || [];
        if (!selectedPatientId.value && members.value.length) {
          const self = members.value.find(item => item.relation === "self") || members.value[0];
          selectedPatientId.value = String(self.id);
          e.index.setStorageSync("selected_treatment_patient_id", selectedPatientId.value);
        }
        const params = queryParams();
        const [res1, res2, res3, res4] = await Promise.all([
          a.getTreatmentRecord(params),
          a.getWearingRecords(params),
          a.getWearingSummary(params),
          a.getTimeline(params),
        ]);
        u.value = res1.data;
        o.value = res2.data || [];
        r.value = res3.data;
        l.value = res4.data || [];
      }
      async function onMemberChange(evt) {
        const idx = Number(evt.detail.value || 0);
        const member = members.value[idx];
        if (!member) return;
        selectedPatientId.value = String(member.id);
        e.index.setStorageSync("selected_treatment_patient_id", selectedPatientId.value);
        n.value = !0;
        try {
          await loadData();
        } finally {
          n.value = !1;
        }
      }
      async function submitCheckin() {
        s.value = !0;
        try {
          const todayObj = new Date(),
            t = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`;
          await a.submitWearingCheckin({
            ...queryParams(),
            date: t,
            wearDuration: v.value,
            comfort: d.value,
            note: c.value || void 0,
          });
          const [n, u] = await Promise.all([
            a.getWearingRecords(queryParams()),
            a.getWearingSummary(queryParams()),
          ]);
          ((o.value = n.data),
            (r.value = u.data),
            (i.value = !1),
            e.index.showToast({ title: "打卡成功", icon: "success" }));
        } catch {
          e.index.showToast({ title: "打卡失败", icon: "none" });
        } finally {
          s.value = !1;
        }
      }
      function goSleepTrend() {
        e.index.navigateTo({ url: "/pages/treatment/sleep-trend/index" });
      }
      function goTimeline() {
        e.index.navigateTo({ url: "/pages/treatment/timeline/index" });
      }
      function goSleepReport() {
        e.index.navigateTo({ url: "/pages/treatment/sleep-report/index" });
      }
      function goCommunity() {
        e.index.navigateTo({ url: "/pages/community/index" });
      }
      function A() {
        e.index.navigateTo({ url: "/pages/treatment/doctor-advice/index" });
      }
      function C() {
        e.index.navigateTo({ url: "/pages/treatment/adjust-detail/index" });
      }
      return (
        e.onShow(async () => {
          const token = e.index.getStorageSync("access_token");
          if (!token) {
            e.index.navigateTo({ url: "/pages/auth/login" });
            return;
          }
          try {
            await loadData();
          } catch (err) {
            console.error("[Treatment onShow] 加载失败", err);
          }
        }),
        e.onMounted(async () => {
          const token = e.index.getStorageSync("access_token");
          if (!token) {
            e.index.navigateTo({ url: "/pages/auth/login" });
            return;
          }
          try {
            await loadData();
          } catch (err) {
            console.error("[Treatment onMounted] 加载失败", err);
          } finally {
            n.value = !1;
          }
        }),
        (a, t) => {
          var o, r, f;
          return e.e(
            {
              a: e.p({ title: "治疗追踪" }),
              memberNames: memberNames.value,
              memberIndex: memberIndex.value,
              memberChange: e.o(onMemberChange),
              showMemberPicker: members.value.length > 1,
              b: !n.value && u.value
            },
            !n.value && u.value
              ? {
                  c: e.t(w.value.streak),
                  d: e.t(null == (o = m.value) ? void 0 : o.model),
                  e: e.t(null == (r = m.value) ? void 0 : r.doctorName),
                  f: p.value + "%",
                  g: e.t(p.value),
                  h: e.t(null == (f = m.value) ? void 0 : f.startDate),
                  i: e.o(goSleepTrend, "aa"),
                  j: e.f(g.value, (a, t, n) => ({
                    a: e.t(a.dayOfWeek),
                    b: getRecordColor(a),
                    c: a.record ? a.record.wearDuration + "h" : "未佩戴",
                    d: e.t(a.dayNum),
                    e: a.date,
                    f: a.isToday ? 1 : "",
                  })),
                  k: e.t(w.value.worn),
                  l: e.t(w.value.avgHours),
                  m: e.t(w.value.avgComfort),
                  n: e.t(w.value.streak),
                  o: e.o(openCheckinModal, "7d"),
                  p: e.o(goSleepTrend, "9b"),
                  q: e.o(goSleepReport, "12"),
                  r: e.o(goTimeline, "4c"),
                  s: e.o(A, "70"),
                  t: e.o(C, "23"),
                  v: e.o(goCommunity, "f0"),
                  w: e.o(goTimeline, "d1"),
                  x: e.f(l.value.slice(0, 2), (a, t, n) =>
                    e.e(
                      { a: a.color, b: t < l.value.slice(0, 2).length - 1 },
                      (l.value.slice(0, 2).length, {}),
                      {
                        c: e.t(a.date),
                        d: e.t(a.title),
                        e: e.t(a.description),
                        f: a.id,
                        g: t === l.value.slice(0, 2).length - 1 ? 1 : "",
                      },
                    ),
                  ),
                  phases: e.f(u.value.phases || [], (phase, t, n) => ({
                    a: phase.status === 'completed' ? '✓' : phase.dot,
                    b: phase.status === 'completed' ? 'completed' : (phase.status === 'active' ? 'active' : 'pending'),
                    c: phase.status === 'completed' ? 'completed' : (phase.status === 'active' ? 'active' : 'pending'),
                    d: e.t(phase.name),
                    e: phase.status === 'active' ? 'active-name' : '',
                    f: e.t(phase.desc),
                    g: e.t(phase.date),
                    h: t === u.value.phases.length - 1 ? '' : (phase.status === 'completed' ? 'completed' : (phase.status === 'active' ? 'active' : 'pending')),
                    i: t === u.value.phases.length - 1 ? 1 : ""
                  }))
                }
              : {},
            { y: !n.value && !u.value },
            n.value || u.value
              ? {}
              : {
                  z: e.p({ text: "暂无治疗记录", icon: "💊" })
                },
            { A: i.value },
            i.value
              ? {
                  z1: e.t(checkinDateStr.value),
                  B: e.f([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], (a, t, n) => ({
                    a: e.t(a),
                    b: a,
                    c: v.value === a ? 1 : "",
                    d: e.o(
                      (e) =>
                        (function (e) {
                          v.value = e;
                        })(a),
                      a,
                    ),
                  })),
                  C: e.f([1, 2, 3, 4, 5], (a, t, n) => ({
                    a: e.t(a),
                    b: a,
                    c: a <= d.value ? "comfort-star--active comfort-star--active-" + d.value : "",
                    d: e.o((e) => (d.value = a), a),
                  })),
                  D: c.value,
                  E: e.o((e) => (c.value = e.detail.value), "41"),
                  F: e.o(closeCheckinModal, "8b"),
                  G: e.t(s.value ? "保存中..." : "确认打卡"),
                  H: s.value ? 1 : "",
                  I: e.o(submitCheckin, "08"),
                  J: e.o(() => {}, "21"),
                  K: e.o(closeCheckinModal, "0b"),
                }
              : {},
          );
        }
      );
    },
  }),
  o = e._export_sfc(u, [["__scopeId", "data-v-8badcb8c"]]);
wx.createPage(o);
