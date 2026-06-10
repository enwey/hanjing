"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js"),
  a = require("../../api/index.js"),
  n = require("../../api/types.js");
Math || (o + l)();
const o = () => "../../components/base/hj-navbar.js",
  l = () => "../../components/base/hj-tag.js",
  s = e.defineComponent({
    __name: "detail",
    setup(o) {
      const l = t.useStoreStore(),
        s = t.useDoctorStore(),
        r = e.ref(null),
        u = e.ref(null),
        i = e.ref(null),
        p = e.ref(!0);
      function c(e) {
        return (
          {
            confirmed: "primary",
            reminded: "primary",
            checked_in: "success",
            completed: "default",
            cancelled: "danger",
            no_show: "danger",
            pending: "warning",
          }[e] || "default"
        );
      }
      return (
        e.onMounted(async () => {
          var e, t, n;
          const o = getCurrentPages(),
            c = (
              (null == (e = o[o.length - 1].$page) ? void 0 : e.options) || {}
            ).id;
          if ((await Promise.all([l.fetchStores(), s.fetchDoctors()]), c))
            try {
              const e = (await a.getAppointmentDetail(c)).data;
              ((r.value = e.appointment),
                (u.value = l.getStoreById(
                  null == (t = e.appointment) ? void 0 : t.storeId,
                )),
                (i.value = s.getDoctorById(
                  null == (n = e.appointment) ? void 0 : n.doctorId,
                )));
            } catch (d) {
              console.error("加载失败", d);
            }
          p.value = !1;
        }),
        (t, a) => {
          var o, l, s, p, d, v;
          return e.e(
            { a: e.p({ title: "预约详情", "show-back": !0 }), b: r.value },
            r.value
              ? e.e(
                  {
                    c: e.p({
                      text: ((v = r.value.status),
                      n.AppointmentStatusMap[v] ||
                        n.AppointmentStatusMap.pending).label,
                      type: c(r.value.status),
                      size: "md",
                    }),
                    d: e.t(r.value.appointmentNo),
                    e: e.t((null == (o = u.value) ? void 0 : o.name) || "--"),
                    f: e.t(
                      (null == (l = u.value) ? void 0 : l.address) || "--",
                    ),
                    g: e.t((null == (s = i.value) ? void 0 : s.name) || "--"),
                    h: e.t((null == (p = i.value) ? void 0 : p.title) || ""),
                    i: e.t(r.value.appointmentDate),
                    j: e.t(r.value.appointmentTime),
                    k: e.t(((d = r.value.type), n.AppointmentTypeMap[d] || d)),
                    l: r.value.symptomDesc,
                  },
                  r.value.symptomDesc ? { m: e.t(r.value.symptomDesc) } : {},
                  { n: r.value.cancelReason },
                  r.value.cancelReason ? { o: e.t(r.value.cancelReason) } : {},
                )
              : {},
          );
        }
      );
    },
  }),
  r = e._export_sfc(s, [["__scopeId", "data-v-7e5a1194"]]);
wx.createPage(r);
