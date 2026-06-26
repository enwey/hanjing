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
        p = e.ref(!0),
        medicalRecord = e.ref(null),
        treatmentRecord = e.ref(null);
      function c(e) {
        return (
          {
            confirmed: "primary",
            reminded: "primary",
            checked_in: "success",
            completed: "danger",
            cancelled: "default",
            no_show: "default",
            pending: "success",
            pending_payment: "danger",
          }[e] || "default"
        );
      }
      function getDoctorExpertise(doc) {
        if (!doc) return [];
        if (doc.expertise && doc.expertise.length > 0) return doc.expertise;
        const spec = doc.specialty || '';
        if (spec === '睡眠呼吸科' || spec === '睡眠呼吸') {
          return ['睡眠呼吸暂停综合症', '鼾症非手术治疗', '阻鼾器适配', '下颌前移治疗'];
        } else if (spec === '耳鼻喉科') {
          return ['鼻内镜诊断', '上气道评估', '过敏性鼻炎与鼾症', '多导睡眠监测'];
        } else if (spec === '心理科' || spec === '口腔正畸') {
          return ['正畸辅导', '睡眠行为干预', '情绪焦虑管理', '依从性辅导'];
        } else {
          return ['阻鼾器适配', '睡眠健康辅导'];
        }
      }
      const apptStore = e.useAppointmentStore || t.useAppointmentStore();

      const canCancelOrReschedule = e.computed(() => {
        if (!r.value) return false;
        if (['arrived', 'cancelled', 'no_show', 'completed'].includes(r.value.status)) {
          return false;
        }
        try {
          const [year, month, day] = r.value.appointmentDate.split('-').map(Number);
          const [hours, minutes] = r.value.appointmentTime.split('-')[0].trim().split(':').map(Number);
          const apptDateTime = new Date(year, month - 1, day, hours, minutes, 0);
          const now = new Date();
          return (apptDateTime.getTime() - now.getTime()) >= 2 * 60 * 60 * 1000;
        } catch (err) {
          return false;
        }
      });

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
          try {
            const [year, month, day] = r.value.appointmentDate.split('-').map(Number);
            const [hours, minutes] = r.value.appointmentTime.split('-')[0].trim().split(':').map(Number);
            const apptDateTime = new Date(year, month - 1, day, hours, minutes, 0);
            const now = new Date();
            if (apptDateTime.getTime() - now.getTime() < 2 * 60 * 60 * 1000) {
              e.index.showToast({ title: "距离预约时间已不足2小时，不支持取消预约", icon: "none" });
              return;
            }
          } catch (err) {
            console.error("解析就诊时间失败", err);
          }

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
          // If status is finished (completed, arrived, cancelled, no_show), it's a rebook action
          if (['arrived', 'cancelled', 'no_show', 'completed'].includes(r.value.status)) {
            if (apptStore && apptStore.resetFlow) {
              apptStore.resetFlow();
            }
            e.index.navigateTo({
              url: "/pages/appointment/store-select",
            });
            return;
          }

          if (['pending', 'confirmed', 'pending_payment'].includes(r.value.status)) {
            try {
              const [year, month, day] = r.value.appointmentDate.split('-').map(Number);
              const [hours, minutes] = r.value.appointmentTime.split('-')[0].trim().split(':').map(Number);
              const apptDateTime = new Date(year, month - 1, day, hours, minutes, 0);
              const now = new Date();
              if (apptDateTime.getTime() - now.getTime() < 2 * 60 * 60 * 1000) {
                e.index.showToast({ title: "距离预约时间已不足2小时，不支持修改就诊时间", icon: "none" });
                return;
              }
            } catch (err) {
              console.error("解析就诊时间失败", err);
            }
          }

          e.index.navigateTo({
            url: `/pages/appointment/reschedule?id=${r.value.id}&doctorId=${r.value.doctorId}&storeId=${r.value.storeId}`,
          });
        }
      }

      function navigateToStore() {
        if (u.value && u.value.latitude && u.value.longitude) {
          const lat = u.value.latitude;
          const lng = u.value.longitude;
          const name = encodeURIComponent(u.value.name || "");
          const addr = encodeURIComponent(u.value.address || "");
          e.index.navigateTo({
            url: `/pages/appointment/map?latitude=${lat}&longitude=${lng}&name=${name}&address=${addr}`
          });
        } else {
          e.index.showToast({ title: "未配置位置信息", icon: "none" });
        }
      }

      function requestWxPay(payParams) {
        if (payParams.mockPayment) return Promise.resolve();
        return new Promise((resolve, reject) => {
          e.index.requestPayment({
            timeStamp: payParams.timeStamp,
            nonceStr: payParams.nonceStr,
            package: payParams.package,
            signType: payParams.signType,
            paySign: payParams.paySign,
            success: resolve,
            fail: reject
          });
        });
      }

      async function payDeposit() {
        if (r.value) {
          e.index.showLoading({ title: "发起支付..." });
          try {
            const payRes = await a.payAppointmentDeposit(r.value.id);
            const payParams = payRes.data || payRes;
            e.index.hideLoading();
            await requestWxPay(payParams);
            e.index.showLoading({ title: "同步支付状态..." });
            await a.confirmAppointmentPayment(r.value.id);
            e.index.hideLoading();
            e.index.showToast({ title: "支付成功", icon: "success" });
            const res2 = (await a.getAppointmentDetail(r.value.id)).data;
            r.value = res2.appointment;
          } catch (err) {
            e.index.hideLoading();
            e.index.showToast({ title: err && err.errMsg ? "已取消支付" : "发起支付失败，请稍后重试", icon: "none" });
          }
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
              r.value = e.appointment;
              u.value = l.getStoreById(
                null == (t = e.appointment) ? void 0 : t.storeId,
              );
              // Fetch from doctor store first to guarantee identity/data consistency with homepage card
              const doc = e.appointment ? s.getDoctorById(e.appointment.doctorId) || e.doctor : e.doctor;
              i.value = doc;
              
              medicalRecord.value = e.medicalRecord;
              treatmentRecord.value = e.treatmentRecord;

              const pages = getCurrentPages();
              const curPage = pages[pages.length - 1];
              if (curPage && curPage.setData) {
                curPage.setData({
                  doctorDept: doc ? `${doc.specialty || '科室'} · ${doc.experienceYears || 0}年经验` : "科室 · 经验",
                  doctorExpertise: getDoctorExpertise(doc)
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
                    medicalRecord: medicalRecord.value,
                    treatmentRecord: treatmentRecord.value,
                    doctorAvatar: i.value && i.value.name ? i.value.name.slice(0, 1) : "医",
                    statusLabel: (n.AppointmentStatusMap[r.value.status] || n.AppointmentStatusMap.pending).label,
                    statusClass: "status--" + r.value.status,
                    requireDeposit: r.value.requireDeposit,
                    depositAmountYuan: r.value.depositAmount ? (r.value.depositAmount / 100).toFixed(2) : "0.00",
                    consultFeeYuan: r.value.consultFee ? (r.value.consultFee / 100).toFixed(2) : "0.00",
                    depositStatusLabel: r.value.status === 'pending_payment' ? '待支付' : '已支付',
                    doctorDept: i.value ? `${i.value.specialty || '科室'} · ${i.value.experienceYears || 0}年经验` : "科室 · 经验",
                    doctorExpertise: getDoctorExpertise(i.value),
                    onCopy: e.o(copyNo),
                    onCancel: e.o(cancelAppt),
                    onReschedule: e.o(rescheduleAppt),
                    onNavigateToStore: e.o(navigateToStore),
                    payDeposit: e.o(payDeposit),
                    canCancelOrReschedule: e.unref(canCancelOrReschedule),
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
