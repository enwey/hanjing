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
      const l = t.useClinicStore(),
        s = t.useDoctorStore(),
        r = e.ref(null),
        u = e.ref(null),
        i = e.ref(null),
        p = e.ref(!0),
        medicalRecord = e.ref(null),
        treatmentRecord = e.ref(null),
        preExam = e.ref(null),
        evaluation = e.ref(null),
        assessmentInfo = e.ref(null),
        evalRating = e.ref(5),
        evalContent = e.ref("");
      function getStatusTagType(status) {
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
          }[status] || "default"
        );
      }
      function getDoctorExpertise(doc) {
        if (!doc) return [];
        return Array.isArray(doc.expertise) ? doc.expertise : [];
      }
      function hasPreExamData(data) {
        if (!data) return false;
        return ['height', 'weight', 'systolicBp', 'diastolicBp', 'neckCircumference', 'bmi'].some((key) => {
          const value = data[key];
          return value !== null && value !== undefined && value !== '';
        });
      }
      const cancelLimitText = e.ref("就诊前2小时");
      function getCancelLimitMs() {
        const text = cancelLimitText.value || "就诊前2小时";
        const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*小时/);
        if (hourMatch) return Number(hourMatch[1]) * 60 * 60 * 1000;
        const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*分钟/);
        if (minuteMatch) return Number(minuteMatch[1]) * 60 * 1000;
        const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*天/);
        if (dayMatch) return Number(dayMatch[1]) * 24 * 60 * 60 * 1000;
        return 2 * 60 * 60 * 1000;
      }
      const apptStore = e.useAppointmentStore || t.useAppointmentStore();

      const canCancelOrReschedule = e.computed(() => {
        if (!r.value) return false;
        if (['arrived', 'cancelled', 'no_show', 'completed'].includes(r.value.status)) {
          return false;
        }
        if (r.value.status === 'pending_payment') {
          return true;
        }
        try {
          const [year, month, day] = r.value.appointmentDate.split('-').map(Number);
          const [hours, minutes] = r.value.appointmentTime.split('-')[0].trim().split(':').map(Number);
          const apptDateTime = new Date(year, month - 1, day, hours, minutes, 0);
          const now = new Date();
          return (apptDateTime.getTime() - now.getTime()) >= getCancelLimitMs();
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
            if (r.value.status !== 'pending_payment' && apptDateTime.getTime() - now.getTime() < getCancelLimitMs()) {
              e.index.showToast({ title: `已超过取消截止时间（${cancelLimitText.value}）`, icon: "none" });
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
              if (apptDateTime.getTime() - now.getTime() < getCancelLimitMs()) {
                e.index.showToast({ title: `已超过改约截止时间（${cancelLimitText.value}）`, icon: "none" });
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
            if (payParams.mockPayment) {
              e.index.showLoading({ title: "开发环境模拟支付..." });
              await a.confirmAppointmentPayment(r.value.id);
              e.index.hideLoading();
            } else {
              await requestWxPay(payParams);
            }
            e.index.showToast({ title: "支付已提交，请稍后刷新", icon: "success" });
            const res2 = (await a.getAppointmentDetail(r.value.id)).data;
            r.value = res2.appointment;
          } catch (err) {
            e.index.hideLoading();
            e.index.showToast({ title: err && err.errMsg ? "支付未完成，可稍后继续支付" : "发起支付失败，请稍后重试", icon: "none" });
          }
        }
      }

      async function submitEvaluation() {
        if (!r.value) return;
        try {
          await a.submitAppointmentEvaluation(r.value.id, { rating: evalRating.value, content: evalContent.value });
          e.index.showToast({ title: "评价已提交", icon: "success" });
          const res2 = (await a.getAppointmentDetail(r.value.id)).data;
          evaluation.value = res2.evaluation;
        } catch (err) {
          e.index.showToast({ title: (err && err.message) || "评价失败", icon: "none" });
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
              try {
                const settingsRes = await a.getBookingSettings();
                if (settingsRes && settingsRes.data) {
                  cancelLimitText.value = settingsRes.data.cancelLimit || "就诊前2小时";
                }
              } catch (settingsErr) {
                console.error("加载预约设置失败", settingsErr);
              }
              const e = (await a.getAppointmentDetail(c)).data;
              r.value = e.appointment;
              u.value = e.store || l.getStoreById(
                null == (t = e.appointment) ? void 0 : t.storeId,
              );
              // Fetch from doctor store first to guarantee identity/data consistency with homepage card
              const doc = e.appointment ? s.getDoctorById(e.appointment.doctorId) || e.doctor : e.doctor;
              i.value = doc;
              
              medicalRecord.value = e.medicalRecord;
              treatmentRecord.value = e.treatmentRecord;
              preExam.value = e.preExam;
              evaluation.value = e.evaluation;
              assessmentInfo.value = e.assessments;
              if (e.evaluation) {
                evalRating.value = e.evaluation.rating || 5;
                evalContent.value = e.evaluation.content || "";
              }

              const pages = getCurrentPages();
              const curPage = pages[pages.length - 1];
              if (curPage && curPage.setData) {
                curPage.setData({
                  doctorDept: doc ? `${doc.specialty || ''}${doc.experienceYears ? ' · ' + doc.experienceYears + '年经验' : ''}` : "",
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
                    preExam: preExam.value,
                    hasPreExam: hasPreExamData(preExam.value),
                    evaluation: evaluation.value,
                    assessmentInfo: assessmentInfo.value,
                    evalRating: evalRating.value,
                    ratingStars: [1, 2, 3, 4, 5],
                    evalContent: evalContent.value,
                    cancelLimitText: cancelLimitText.value,
                    onEvalRatingChange: e.o((evt) => evalRating.value = Number(evt.currentTarget.dataset.rating || 5)),
                    onEvalContentInput: e.o((evt) => evalContent.value = evt.detail.value),
                    onSubmitEvaluation: e.o(submitEvaluation),
                    doctorAvatar: i.value && i.value.name ? i.value.name.slice(0, 1) : "医",
                    statusLabel: (n.AppointmentStatusMap[r.value.status] || n.AppointmentStatusMap.pending).label,
                    statusClass: "status--" + r.value.status,
                    requireDeposit: r.value.requireDeposit,
                    depositAmountYuan: r.value.depositAmount ? (r.value.depositAmount / 100).toFixed(2) : "0.00",
                    consultFeeYuan: r.value.consultFee ? (r.value.consultFee / 100).toFixed(2) : "0.00",
                    depositStatusLabel: r.value.status === 'pending_payment' ? '待支付' : '已支付',
                    doctorDept: i.value ? `${i.value.specialty || ''}${i.value.experienceYears ? ' · ' + i.value.experienceYears + '年经验' : ''}` : "",
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
                      type: getStatusTagType(r.value.status),
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
                    patientName: e.t(r.value.patientName || "--"),
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
