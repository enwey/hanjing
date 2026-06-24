"use strict";
const e = require("../../common/vendor.js"),
  t = e.defineComponent({
    __name: "hj-schedule-calendar",
    props: { dates: {}, selectedDate: {} },
    emits: ["select"],
    setup(t, { emit: a }) {
      const s = t,
        d = a,
        currentYear = e.ref(new Date().getFullYear()),
        currentMonth = e.ref(new Date().getMonth()),
        prevMonth = () => {
          if (currentMonth.value === 0) {
            currentYear.value--;
            currentMonth.value = 11;
          } else {
            currentMonth.value--;
          }
        },
        nextMonth = () => {
          if (currentMonth.value === 11) {
            currentYear.value++;
            currentMonth.value = 0;
          } else {
            currentMonth.value++;
          }
        },
        n = e.ref(""),
        c = ["日", "一", "二", "三", "四", "五", "六"],
        i = e.computed(() => {
          const t = currentYear.value,
            a = currentMonth.value;
          n.value = `${t}年${a + 1}月`;
          const d = new Date(t, a, 1).getDay(),
            c = new Date(t, a + 1, 0).getDate(),
            today = new Date(),
            i = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
            l = [];
          for (let s = 0; s < d; s++)
            l.push({
              date: "",
              day: 0,
              isToday: !1,
              isPast: !1,
              hasSchedule: !1,
              disabled: !0,
            });
          for (let n = 1; n <= c; n++) {
            const e = `${t}-${String(a + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
            l.push({
              date: e,
              day: n,
              isToday: e === i,
              isPast: e < i,
              hasSchedule: s.dates.includes(e),
              disabled: e < i || !s.dates.includes(e),
            });
          }
          return l;
        });

      return (t, a) => ({
        a: e.t(n.value),
        b: e.f(c, (t, a, s) => ({ a: e.t(t), b: t })),
        c: e.f(i.value, (a, s, n) =>
          e.e(
            { a: a.date },
            a.date ? { b: e.t(a.day) } : {},
            { c: a.hasSchedule && !a.isPast },
            (a.hasSchedule && a.isPast, {}),
            {
              d: s,
              e: a.date ? "" : 1,
              f: a.isToday ? 1 : "",
              g: a.isPast ? 1 : "",
              h: a.hasSchedule && !a.isPast ? 1 : "",
              i: a.disabled ? 1 : "",
              j: a.date === t.selectedDate ? 1 : "",
              k: e.o(
                (e) =>
                  (function (e) {
                    !e.disabled && e.date && d("select", e.date);
                  })(a),
                s,
              ),
            },
          ),
        ),
        l: e.o(prevMonth, "70d02435-prev"),
        m: e.o(nextMonth, "70d02435-next"),
      });
    },
  }),
  a = e._export_sfc(t, [["__scopeId", "data-v-70d02435"]]);
wx.createComponent(a);
