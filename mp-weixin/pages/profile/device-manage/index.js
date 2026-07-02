"use strict";
const e = require("../../../common/vendor.js"),
  api = require("../../../api/index.js");
Math || a();
const a = () => "../../../components/base/hj-navbar.js",
  o = e.defineComponent({
    __name: "index",
    setup(a) {
      const device = e.ref(null),
        loading = e.ref(!0),
        o = [
        {
          icon: "data",
          label: "佩戴数据",
          desc: "每日佩戴时长与舒适度",
          url: "/pages/profile/device-manage/wearing-data",
          color: "#3B6BF5",
        },
        {
          icon: "maintain",
          label: "维护记录",
          desc: "清洁、调整与维修记录",
          url: "/pages/profile/device-manage/maintenance",
          color: "#1A9D5C",
        },
        {
          icon: "feedback",
          label: "使用反馈",
          desc: "提交使用感受与问题",
          url: "/pages/profile/device-manage/feedback",
          color: "#F59E0B",
        },
      ];
      const bluetoothState = e.ref("disconnected"), // disconnected, searching, connected, syncing, synced
        scannedDevices = e.ref([]),
        syncProgress = e.ref(0),
        selectedDevice = e.ref(null);

      function currentParams() {
        const patientId = e.index.getStorageSync("selected_treatment_patient_id") || "";
        return patientId ? { patientId } : {};
      }

      function startScan() {
        bluetoothState.value = "searching";
        scannedDevices.value = [];
        setTimeout(() => {
          if (bluetoothState.value === "searching") {
            scannedDevices.value = [
              { name: "鼾静智能阻鼾器 HJ-MAD-03", deviceId: "HJ:MAD:03:9E:F2", rssi: -62 }
            ];
          }
        }, 1500);
      }

      function connectDevice(dev) {
        e.index.showLoading({ title: "正在连接蓝牙..." });
        setTimeout(() => {
          e.index.hideLoading();
          selectedDevice.value = dev;
          bluetoothState.value = "connected";
          e.index.showToast({ title: "蓝牙直连成功", icon: "success" });
        }, 1000);
      }

      function startSync() {
        bluetoothState.value = "syncing";
        syncProgress.value = 0;
        const timer = setInterval(() => {
          syncProgress.value += 10;
          if (syncProgress.value >= 100) {
            clearInterval(timer);
            bluetoothState.value = "synced";
            e.index.showToast({ title: "数据同步完成", icon: "success" });
          }
        }, 200);
      }

      function resetBluetooth() {
        bluetoothState.value = "disconnected";
        selectedDevice.value = null;
        scannedDevices.value = [];
        syncProgress.value = 0;
      }

      return (
        e.onMounted(async () => {
          try {
            const res = await api.getTreatmentRecord(currentParams());
            device.value = res.data;
          } catch (err) {
            console.error(err);
          } finally {
            loading.value = !1;
          }
        }),
        (a, n) => ({
          a: e.p({ title: "阻鼾器管理", "show-back": !0 }),
          loading: loading.value,
          hasDevice: !!device.value,
          deviceModel: device.value ? device.value.deviceModel : "",
          deviceName: device.value && device.value.device ? device.value.device.name : (device.value ? device.value.deviceModel : ""),
          deviceImage: device.value && device.value.device ? device.value.device.imageUrl : "",
          deviceStatus: device.value && device.value.status === "active" ? "使用中" : "暂无活跃治疗",
          bluetoothState: bluetoothState.value,
          scannedDevices: scannedDevices.value,
          syncProgress: syncProgress.value,
          selectedDeviceName: selectedDevice.value ? selectedDevice.value.name : "",
          startScan: e.o(startScan),
          connectDevice: e.o((o) => {
            const dev = o.currentTarget.dataset.dev || scannedDevices.value[0];
            connectDevice(dev);
          }),
          startSync: e.o(startSync),
          resetBluetooth: e.o(resetBluetooth),
          b: e.f(o, (a, o, n) => ({
            a: e.t("data" === a.icon ? "T" : "maintain" === a.icon ? "M" : "F"),
            b: a.color + "15",
            c: a.color,
            d: e.t(a.label),
            e: e.t(a.desc),
            f: a.label,
            g: e.o((o) => {
              return ((n = a.url), void e.index.navigateTo({ url: n }));
              var n;
            }, a.label),
          })),
        })
      );
    },
  }),
  n = e._export_sfc(o, [["__scopeId", "data-v-75e661b4"]]);
wx.createPage(n);
