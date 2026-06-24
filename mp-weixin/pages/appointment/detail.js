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
      const apptStore = t.useAppointmentStore();

      function copyNo() {
        if (r.value && r.value.appointmentNo) {
          e.index.setClipboardData({
            data: r.value.appointmentNo,
            success: () => {
              e.index.showToast({ title: "复制成功", icon: "success" });
            }
          });
        }
      }

      function cancelAppt() {
        if (r.value) {
          e.index.showModal({
            title: "取消预约",
            content: "确定要取消这次预约吗？",
            success: async (res) => {
              if (res.confirm) {
                try {
                  await apptStore.cancelAppointment(r.value.id, "用户主动取消");
                  e.index.showToast({ title: "已取消", icon: "success" });
                  const res2 = (await a.getAppointmentDetail(r.value.id)).data;
                  r.value = res2.appointment;
                } catch (err) {
                  e.index.showToast({ title: "取消失败", icon: "error" });
                }
              }
            }
          });
        }
      }

      function rescheduleAppt() {
        if (r.value) {
          e.index.navigateTo({
            url: `/pages/appointment/reschedule?id=${r.value.id}&doctorId=${r.value.doctorId}&storeId=${r.value.storeId}`,
          });
        }
      }

      return (
        e.onMounted(async () => {
          var e, t, n;
          const o = getCurrentPages(),
            curPage = o[o.length - 1] || {},
            options = curPage.options || (curPage.$page && curPage.$page.options) || {},
            c = options.id;
          if ((await Promise.all([l.fetchStores(), s.fetchDoctors()]), c))
            try {
              const e = (await a.getAppointmentDetail(c)).data;
              ((r.value = e.appointment),
                (u.value = l.getStoreById(
                  null == (t = e.appointment) ? void 0 : t.storeId,
                )),
                (i.value = e.doctor));
              const doc = i.value;
              const pages = getCurrentPages();
              const curPage = pages[pages.length - 1];
              if (curPage && curPage.setData) {
                curPage.setData({
                  doctorDept: doc ? `${doc.specialty || '科室'} · ${doc.experienceYears || 0}年经验` : "科室 · 经验",
                  doctorIntro: doc && doc.intro ? doc.intro : "擅长睡眠呼吸暂停综合症适配调谐与随访"
                });
              }
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
                    status: r.value.status,
                    doctorAvatar: i.value && i.value.name ? i.value.name.slice(0, 1) : "医",
                    statusLabel: (n.AppointmentStatusMap[r.value.status] || n.AppointmentStatusMap.pending).label,
                    statusClass: "status--" + r.value.status,
                    doctorDept: i.value ? `${i.value.specialty || '科室'} · ${i.value.experienceYears || 0}年经验` : "科室 · 经验",
                    doctorIntro: i.value && i.value.intro ? i.value.intro : "擅长睡眠呼吸暂停综合症适配调谐与随访",
                    onCopy: e.o(copyNo),
                    onCancel: e.o(cancelAppt),
                    onReschedule: e.o(rescheduleAppt),
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
