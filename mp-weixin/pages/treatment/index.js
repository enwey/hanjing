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
        m = e.computed(() =>
          u.value
            ? {
                model: u.value.deviceModel,
                adjustValue: u.value.adjustmentValue,
                startDate: u.value.createdAt.split("T")[0],
                doctorName: u.value.doctorName || "王芳",
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
      function x(e) {
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
      function D() {
        const todayObj = new Date(),
          e = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`,
          a = o.value.find((a) => a.date === e);
        ((null == a ? void 0 : a.wearDuration) && a.wearDuration > 0
          ? ((f.value = !0),
            (v.value = a.wearDuration),
            (d.value = a.comfort),
            (c.value = a.note || ""))
          : ((f.value = !1), (v.value = 6), (d.value = 4), (c.value = "")),
          (i.value = !0));
      }
      function y() {
        i.value = !1;
      }
      async function T() {
        s.value = !0;
        try {
          const todayObj = new Date(),
            t = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`;
          await a.submitWearingCheckin({
            date: t,
            wearDuration: v.value,
            comfort: d.value,
            note: c.value || void 0,
          });
          const [n, u] = await Promise.all([
            a.getWearingRecords(),
            a.getWearingSummary(),
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
      function b() {
        e.index.navigateTo({ url: "/pages/treatment/sleep-trend/index" });
      }
      function h() {
        e.index.navigateTo({ url: "/pages/treatment/timeline/index" });
      }
      function j() {
        e.index.navigateTo({ url: "/pages/treatment/sleep-report/index" });
      }
      function k() {
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
            const [res1, res2, res3, res4] = await Promise.all([
              a.getTreatmentRecord(),
              a.getWearingRecords(),
              a.getWearingSummary(),
              a.getTimeline(),
            ]);
            u.value = res1.data;
            o.value = res2.data;
            r.value = res3.data;
            l.value = res4.data;
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
            const [res1, res2, res3, res4] = await Promise.all([
              a.getTreatmentRecord(),
              a.getWearingRecords(),
              a.getWearingSummary(),
              a.getTimeline(),
            ]);
            u.value = res1.data;
            o.value = res2.data;
            r.value = res3.data;
            l.value = res4.data;
          } catch (err) {
            console.error("[Treatment onMounted] 加载失败", err);
          } finally {
            n.value = !1;
          }
        }),
        (a, t) => {
          var o, r, f;
          return e.e(
            { a: e.p({ title: "治疗追踪" }), b: !n.value && u.value },
            !n.value && u.value
              ? {
                  c: e.t(w.value.streak),
                  d: e.t(null == (o = m.value) ? void 0 : o.model),
                  e: e.t(null == (r = m.value) ? void 0 : r.doctorName),
                  f: p.value + "%",
                  g: e.t(p.value),
                  h: e.t(null == (f = m.value) ? void 0 : f.startDate),
                  i: e.o(b, "aa"),
                  j: e.f(g.value, (a, t, n) => ({
                    a: e.t(a.dayOfWeek),
                    b: x(a),
                    c: a.record ? a.record.wearDuration + "h" : "未佩戴",
                    d: e.t(a.dayNum),
                    e: a.date,
                    f: a.isToday ? 1 : "",
                  })),
                  k: e.t(w.value.worn),
                  l: e.t(w.value.avgHours),
                  m: e.t(w.value.avgComfort),
                  n: e.t(w.value.streak),
                  o: e.o(D, "7d"),
                  p: e.o(b, "9b"),
                  q: e.o(j, "12"),
                  r: e.o(h, "4c"),
                  s: e.o(A, "70"),
                  t: e.o(C, "23"),
                  v: e.o(k, "f0"),
                  w: e.o(h, "d1"),
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
              : { z: e.p({ text: "暂无治疗记录", icon: "💊" }) },
            { A: i.value },
            i.value
              ? {
                  z1: e.t(checkinDateStr.value),
                  B: e.f([4, 5, 6, 7, 8], (a, t, n) => ({
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
                  F: e.o(y, "8b"),
                  G: e.t(s.value ? "保存中..." : "确认打卡"),
                  H: s.value ? 1 : "",
                  I: e.o(T, "08"),
                  J: e.o(() => {}, "21"),
                  K: e.o(y, "0b"),
                }
              : {},
          );
        }
      );
    },
  }),
  o = e._export_sfc(u, [["__scopeId", "data-v-8badcb8c"]]);
wx.createPage(o);
