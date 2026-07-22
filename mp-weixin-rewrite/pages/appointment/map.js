Page({
  data: {
    latitude: 0,
    longitude: 0,
    name: '',
    address: '',
    markers: [],
  },

  onLoad(options) {
    const latitude = Number(options && options.latitude) || 0;
    const longitude = Number(options && options.longitude) || 0;
    const name = decodeURIComponent((options && options.name) || '');
    const address = decodeURIComponent((options && options.address) || '');

    this.setData({
      latitude,
      longitude,
      name,
      address,
      markers:
        latitude && longitude
          ? [
              {
                id: 1,
                latitude,
                longitude,
                name,
                width: 32,
                height: 32,
                iconPath: '/static/icons/map-pin.svg',
              },
            ]
          : [],
    });
  },

  gcj02ToBd09(longitude, latitude) {
    const xPi = (Math.PI * 3000.0) / 180.0;
    const z = Math.sqrt(longitude * longitude + latitude * latitude) + 0.00002 * Math.sin(latitude * xPi);
    const theta = Math.atan2(latitude, longitude) + 0.000003 * Math.cos(longitude * xPi);
    return {
      lat: z * Math.sin(theta) + 0.006,
      lng: z * Math.cos(theta) + 0.0065,
    };
  },

  openLocation() {
    if (!this.data.latitude || !this.data.longitude) {
      wx.showToast({ title: '当前门店暂未提供导航坐标', icon: 'none' });
      return;
    }

    wx.showActionSheet({
      itemList: ['腾讯地图 (微信内置)', '高德地图', '百度地图'],
      success: (result) => {
        if (result.tapIndex === 0) {
          wx.openLocation({
            latitude: this.data.latitude,
            longitude: this.data.longitude,
            name: this.data.name,
            address: this.data.address,
            scale: 18,
          });
          return;
        }

        if (result.tapIndex === 1) {
          wx.navigateToMiniProgram({
            appId: 'wxdb9a5899edef2670',
            path:
              'pages/route/route?dlat=' +
              this.data.latitude +
              '&dlon=' +
              this.data.longitude +
              '&dname=' +
              encodeURIComponent(this.data.name) +
              '&dev=0&t=0',
          });
          return;
        }

        if (result.tapIndex === 2) {
          const coordinate = this.gcj02ToBd09(this.data.longitude, this.data.latitude);
          wx.navigateToMiniProgram({
            appId: 'wx92f72a912e753443',
            path: 'pages/index/index',
            extraData: {
              destination: {
                lat: coordinate.lat,
                lng: coordinate.lng,
                name: this.data.name,
              },
              mode: 'driving',
            },
          });
        }
      },
    });
  },
});
