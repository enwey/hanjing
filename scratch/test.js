const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id.includes('vendor.js')) {
    return {
      ref: (v) => ({ value: v }),
      computed: (fn) => ({ get value() { return fn(); } }),
      index: { getStorageSync: () => "", getWindowInfo: () => ({ statusBarHeight: 44 }) },
      defineComponent: (obj) => obj,
      _export_sfc: (c, p) => c
    };
  }
  if (id.includes('stores/index.js')) {
    return {
      useUserStore: () => ({ profile: null }),
      useStoreStore: () => ({ stores: [] }),
      useDoctorStore: () => ({ doctors: [] }),
      useAppointmentStore: () => ({})
    };
  }
  return originalRequire.apply(this, arguments);
};

const mocks = require('../mp-weixin/mock/index.js');
console.log('mockDoctors:', mocks.mockDoctors);
