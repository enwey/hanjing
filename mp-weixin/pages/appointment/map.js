"use strict";
const e = require("../../common/vendor.js");
Math || n();
const n = () => "../../components/base/hj-navbar.js";
const a = e.defineComponent({
  __name: "map",
  setup(n) {
    const latitude = e.ref(0);
    const longitude = e.ref(0);
    const name = e.ref("");
    const address = e.ref("");
    const markers = e.ref([]);

    function onStartNavigation() {
      e.index.openLocation({
        latitude: latitude.value,
        longitude: longitude.value,
        name: name.value,
        address: address.value,
        scale: 18
      });
    }

    return (
      e.onMounted(() => {
        const pages = getCurrentPages();
        const curPage = pages[pages.length - 1] || {};
        const options = curPage.options || (curPage.$page && curPage.$page.options) || {};
        
        const lat = parseFloat(options.latitude || "0");
        const lng = parseFloat(options.longitude || "0");
        const storeName = decodeURIComponent(options.name || "");
        const storeAddress = decodeURIComponent(options.address || "");

        latitude.value = lat;
        longitude.value = lng;
        name.value = storeName;
        address.value = storeAddress;

        markers.value = [{
          id: 1,
          latitude: lat,
          longitude: lng,
          name: storeName,
          width: 32,
          height: 32,
          iconPath: "/static/icons/map-pin.svg"
        }];
      }),
      (t, n) => {
        return {
          a: e.p({ title: "门店地图", "show-back": !0 }),
          b: latitude.value,
          c: longitude.value,
          d: markers.value,
          e: e.t(name.value),
          f: e.t(address.value),
          g: e.o(onStartNavigation)
        };
      }
    );
  }
});
const i = e._export_sfc(a, [["__scopeId", "data-v-c5678abc"]]);
wx.createPage(i);
