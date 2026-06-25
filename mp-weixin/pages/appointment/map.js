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

    function gcj02tobd09(lng, lat) {
      const x_PI = (3.14159265358979324 * 3000.0) / 180.0;
      const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * x_PI);
      const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * x_PI);
      const bd_lng = z * Math.cos(theta) + 0.0065;
      const bd_lat = z * Math.sin(theta) + 0.006;
      return { lat: bd_lat, lng: bd_lng };
    }

    function onStartNavigation() {
      e.index.showActionSheet({
        itemList: ["腾讯地图 (微信内置)", "高德地图", "百度地图"],
        success: (res) => {
          if (res.tapIndex === 0) {
            e.index.openLocation({
              latitude: latitude.value,
              longitude: longitude.value,
              name: name.value,
              address: address.value,
              scale: 18
            });
          } else if (res.tapIndex === 1) {
            e.index.navigateToMiniProgram({
              appId: "wxdb9a5899edef2670",
              path: `pages/route/route?dlat=${latitude.value}&dlon=${longitude.value}&dname=${encodeURIComponent(name.value)}&dev=0&t=0`
            });
          } else if (res.tapIndex === 2) {
            const bdCoord = gcj02tobd09(longitude.value, latitude.value);
            e.index.navigateToMiniProgram({
              appId: "wx92f72a912e753443",
              path: "pages/index/index",
              extraData: {
                destination: {
                  lat: bdCoord.lat,
                  lng: bdCoord.lng,
                  name: name.value
                },
                mode: "driving"
              }
            });
          }
        }
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
