"use strict";
const e = require("../../common/vendor.js"),
  t = require("../../stores/index.js"),
  api = require("../../api/index.js");
Math || (n + o)();
const n = () => "../../components/base/hj-navbar.js",
  o = () => "../../components/base/hj-button.js",
  a = e.defineComponent({
    __name: "success",
    setup(n) {
      const o = t.useAppointmentStore(),
        clinicStore = t.useClinicStore(),
        i = t.useDoctorStore(),
        r = e.ref(null),
        s = e.ref(!0),
        cancelLimitText = e.ref("就诊前2小时");
      function goHome() {
        e.index.switchTab({ url: "/pages/index/index" });
      }
      function goDetail() {
        var t, n;
        (null == (n = null == (t = r.value) ? void 0 : t.appointment)
          ? void 0
          : n.id) &&
          e.index.redirectTo({
            url: `/pages/appointment/detail?id=${r.value.appointment.id}`,
          });
      }
      function getStoreName() {
        var e, t;
        return (null == (t = null == (e = r.value) ? void 0 : e.appointment) ? void 0 : t.storeName) || "";
      }
      function getDoctorName() {
        var e, t;
        return (
          (null == (t = null == (e = r.value) ? void 0 : e.appointment) ? void 0 : t.doctorName) || ""
        );
      }
      return (
        e.onMounted(async () => {
          (await clinicStore.fetchStores(),
            await i.fetchDoctors(),
            (async function () {
              try {
                const settingsRes = await api.getBookingSettings();
                if (settingsRes && settingsRes.data) {
                  cancelLimitText.value = settingsRes.data.cancelLimit || "就诊前2小时";
                }
              } catch (settingsErr) {
                console.error("加载预约设置失败", settingsErr);
              }
              const pages = getCurrentPages();
              const curPage = pages[pages.length - 1] || {};
              const options = curPage.options || (curPage.$page && curPage.$page.options) || {};
              const n = options.id;
              if (n) {
                try {
                  const t = await api.getAppointmentDetail(n);
                  r.value = t.data;
                } catch (o) {
                  console.error("加载失败", o);
                }
              }
              s.value = !1;
            })());
        }),
        (t, n) => {
          var a, i, s;
          const apptData = (null == r.value ? void 0 : r.value.appointment) || {};
          return {
            a: e.p({ title: "预约成功", "show-back": !0 }),
            b: e.t((null == (i = null == (a = r.value) ? void 0 : a.appointment) ? void 0 : i.appointmentNo) || ""),
            c: e.t(getStoreName()),
            d: e.t(getDoctorName()),
            e: e.t((null == (s = null == r.value ? void 0 : r.value.appointment) ? void 0 : s.appointmentDate) || ""),
            f: e.t(
              (null == (s = null == r.value ? void 0 : r.value.appointment) ? void 0 : s.appointmentTime) || "",
            ),
            g: e.t(cancelLimitText.value),
            h: e.o(goDetail, "32"),
            i: e.p({ type: "primary", size: "lg", block: !0 }),
            j: e.o(goHome, "07"),
            k: e.p({ type: "ghost", size: "lg", block: !0 }),
            patientName: e.t(apptData.patientName || "本人"),
            consultFee: e.t(((apptData.consultFee || 0) / 100).toFixed(2)),
            requireDeposit: apptData.requireDeposit || false,
            depositAmount: e.t(((apptData.depositAmount || 0) / 100).toFixed(2)),
            symptomDesc: e.t(apptData.symptomDesc || "无"),
          };
        }
      );
    },
  }),
  i = e._export_sfc(a, [["__scopeId", "data-v-baa6e4ef"]]);
wx.createPage(i);
