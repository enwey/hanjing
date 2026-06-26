"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js");
Math || (o + n + s + i)();
const o = () => "../../components/base/hj-navbar.js",
  n = () => "../../components/base/hj-button.js",
  i = () => "../../components/base/hj-empty.js",
  s = () => "../../components/business/hj-appointment-item.js",
  a = e.defineComponent({
    __name: "index",
    setup(o) {
      const n = t.useAppointmentStore(),
        i = t.useUserStore(),
        s = t.useStoreStore(),
        a = t.useDoctorStore(),
        r = e.ref(!0),
        c = e.ref("upcoming");
      e.onShow(async () => {
        try {
          await n.fetchAppointments();
          p();
        } catch (err) {
          console.error("加载预约失败", err);
        }
      });
      e.onMounted(async () => {
        (await Promise.all([
          s.fetchStores(),
          a.fetchDoctors(),
          i.fetchProfile(),
        ]),
          (r.value = !1));
      });
      const d = e.ref([]),
        u = e.ref([]);
      function p() {
        const e = ["pending_payment", "pending", "confirmed", "reminded", "checked_in", "completed"];
        ((d.value = n.appointments.filter((t) => e.includes(t.status))),
          (u.value = n.appointments.filter((t) => !e.includes(t.status))));
      }
      function l(e) {
        var t;
        return (
          (null == (t = s.getStoreById(e)) ? void 0 : t.name) || "未知门店"
        );
      }
      function m(e) {
        var t;
        return (
          (null == (t = a.getDoctorById(e)) ? void 0 : t.name) || "未知医生"
        );
      }
      function f() {
        (n.resetFlow(),
          e.index.navigateTo({ url: "/pages/appointment/store-select" }));
      }
      function v(t) {
        e.index.navigateTo({ url: `/pages/appointment/detail?id=${t.id}` });
      }
      async function h(t) {
        try {
          const [year, month, day] = t.appointmentDate.split('-').map(Number);
          const [hours, minutes] = t.appointmentTime.split('-')[0].trim().split(':').map(Number);
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
          success: async (o) => {
            if (o.confirm)
              try {
                (await n.cancelAppointment(t.id, "用户主动取消"),
                  e.index.showToast({ title: "已取消", icon: "success" }),
                  p());
              } catch {
                e.index.showToast({ title: "取消失败", icon: "error" });
              }
          },
        });
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
      async function g(t) {
        if (t.status === 'pending_payment') {
          e.index.showLoading({ title: "发起支付..." });
          try {
            const api = require("../../api/index.js");
            const payRes = await api.payAppointmentDeposit(t.id);
            const payParams = payRes.data || payRes;
            e.index.hideLoading();
            await requestWxPay(payParams);
            e.index.showLoading({ title: "同步支付状态..." });
            await api.confirmAppointmentPayment(t.id);
            e.index.hideLoading();
            e.index.showToast({ title: "支付成功", icon: "success" });
            await n.fetchAppointments();
            p();
          } catch (err) {
            e.index.hideLoading();
            e.index.showToast({ title: err && err.errMsg ? "已取消支付" : "发起支付失败，请稍后重试", icon: "none" });
          }
          return;
        }

        try {
          const [year, month, day] = t.appointmentDate.split('-').map(Number);
          const [hours, minutes] = t.appointmentTime.split('-')[0].trim().split(':').map(Number);
          const apptDateTime = new Date(year, month - 1, day, hours, minutes, 0);
          const now = new Date();
          if (apptDateTime.getTime() - now.getTime() < 2 * 60 * 60 * 1000) {
            e.index.showToast({ title: "距离预约时间已不足2小时，不支持修改就诊时间", icon: "none" });
            return;
          }
        } catch (err) {
          console.error("解析就诊时间失败", err);
        }

        e.index.navigateTo({
          url: `/pages/appointment/reschedule?id=${t.id}&doctorId=${t.doctorId}&storeId=${t.storeId}`,
        });
      }
      async function onGetPhoneNumber(t) {
        console.log("[Appointment Login] GetPhoneNumber event:", t);
        const { detail: o } = t;
        if (!o || !o.code) {
          e.index.showToast({ title: "授权已取消", icon: "none" });
          return;
        }
        e.index.showLoading({ title: "安全登录中..." });
        try {
          await i.login(o.code);
          e.index.hideLoading();
          e.index.showToast({ title: "登录成功", icon: "success" });
          f();
        } catch (r) {
          e.index.hideLoading();
          e.index.showToast({ title: "登录失败，请重试", icon: "none" });
          console.error(r);
        }
      }
      return (
        setTimeout(p, 300),
        (t, o) =>
          e.e(
            {
              a: e.p({ title: "预约挂号" }),
              b: e.o(f, "46"),
              c: e.p({ type: "primary", size: "md" }),
              isLoggedIn: e.unref(i).isLoggedIn,
              onGetPhoneNumber: e.o(onGetPhoneNumber, "phone"),
              d: "upcoming" === c.value ? 1 : "",
              e: e.o((e) => (c.value = "upcoming"), "c6"),
              f: "history" === c.value ? 1 : "",
              g: e.o((e) => (c.value = "history"), "c8"),
              h: "upcoming" === c.value,
            },
            "upcoming" === c.value
              ? e.e(
                  { i: d.value.length > 0 },
                  d.value.length > 0
                    ? {
                        j: e.f(d.value, (t, o, n) => ({
                          a: t.id,
                          b: e.o(v, t.id),
                          c: e.o(h, t.id),
                          d: e.o(g, t.id),
                          e: "801bfeef-2-" + n,
                          f: e.p({
                            appointment: t,
                            "store-name": l(t.storeId),
                            "doctor-name": m(t.doctorId),
                          }),
                        })),
                      }
                    : {
                        k: e.o(f, "37"),
                        l: e.p({ type: "primary", size: "md" }),
                        m: e.p({ text: "暂无进行中的预约", icon: "📅" }),
                      },
                )
              : {},
            { n: "history" === c.value },
            "history" === c.value
              ? e.e(
                  { o: u.value.length > 0 },
                  u.value.length > 0
                    ? {
                        p: e.f(u.value, (t, o, n) => ({
                          a: t.id,
                          b: e.o(v, t.id),
                          c: "801bfeef-5-" + n,
                          d: e.p({
                            appointment: t,
                            "store-name": l(t.storeId),
                            "doctor-name": m(t.doctorId),
                          }),
                        })),
                      }
                    : { q: e.p({ text: "暂无历史预约", icon: "📭" }) },
                )
              : {},
          )
      );
    },
  }),
  r = e._export_sfc(a, [["__scopeId", "data-v-801bfeef"]]);
wx.createPage(r);
