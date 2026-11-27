const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');
const sessionStore = require('../../stores/session-store');

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.list)) {
    return payload.list;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  return [];
}

function readString(value) {
  return value === null || value === undefined ? '' : String(value);
}

function getDistance(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((value) => Number.isFinite(value))) {
    return null;
  }
  const earthRadius = 6371;
  const latDistance = ((lat2 - lat1) * Math.PI) / 180;
  const lonDistance = ((lon2 - lon1) * Math.PI) / 180;
  const sinLat = Math.sin(latDistance / 2);
  const sinLon = Math.sin(lonDistance / 2);
  const haversine =
    sinLat * sinLat +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      sinLon *
      sinLon;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function formatDistance(distance) {
  if (!Number.isFinite(distance)) {
    return '';
  }
  if (distance < 1) {
    return Math.round(distance * 1000) + 'm';
  }
  return distance.toFixed(1) + 'km';
}

function sameId(left, right) {
  return readString(left) === readString(right);
}

const { getBeijingDate } = require('../../common/utils/appointment-time');

function normalizeStore(store, location) {
  const latitude = Number(store.latitude);
  const longitude = Number(store.longitude);
  const distanceValue = location ? getDistance(location.latitude, location.longitude, latitude, longitude) : null;
  return {
    ...store,
    id: readString(store.id),
    name: store.name || store.storeName || '',
    coverUrl: store.coverUrl || store.cover_url || store.imageUrl || store.image_url || '',
    imageUrls: store.imageUrls || store.image_urls || [],
    address: store.address || store.location || '',
    businessHours: store.businessHours || store.openingHours || '',
    doctorCount: Number(store.doctorCount || 0),
    tags: Array.isArray(store.tags) ? store.tags : [],
    isOpen: typeof store.isOpen === 'boolean' ? store.isOpen : true,
    distanceLabel: formatDistance(distanceValue),
    _distanceValue: distanceValue,
  };
}

Page({
  data: {
    stores: [],
    doctorId: '',
    hasLocation: false,
  },

  onLoad(options) {
    this.options = options || {};
    this.hasLoaded = false;
    if (!sessionStore.isLoggedIn()) {
      navigation.openLogin('/pages/appointment/store-select');
      return;
    }
    this.loadPage();
  },

  onShow() {
    if (!sessionStore.isLoggedIn()) {
      return;
    }
    if (!this.hasLoaded) {
      return;
    }
    this.loadPage();
  },

  getLocation() {
    return new Promise((resolve) => {
      wx.getLocation({
        type: 'wgs84',
        success: (result) => {
          resolve({
            latitude: result.latitude,
            longitude: result.longitude,
          });
        },
        fail: () => resolve(null),
      });
    });
  },

  async loadPage() {
    const request = this.storeRequest = {};
    this.setData({ loading: true, loadError: '' });
    try {
      await this.loadStores(request);
    } catch (error) {
      if (this.storeRequest !== request) return;
      this.setData({ stores: [], loadError: '门店加载失败，请稍后重试' });
    } finally {
      if (this.storeRequest === request) this.setData({ loading: false });
    }
  },

  async loadStores(request) {
    const doctorId = readString((this.options && (this.options.doctorId || this.options.doctorid)) || '');
    const todayString = getBeijingDate(Date.now());

    const location = this._location || null;
    const [storesResponse, doctorsResponse] = await Promise.all([
      api.getStores(),
      api.getDoctors(),
    ]);

    const stores = unwrapList(storesResponse);
    const doctors = unwrapList(doctorsResponse);
    const selectedDoctor = doctors.find((doctor) => sameId(doctor.id, doctorId));

    let availableStoreIds = [];
    let scheduleFailed = false;

    if (doctorId) {
      const doctorStoreIds = selectedDoctor && Array.isArray(selectedDoctor.storeIds) ? selectedDoctor.storeIds : [];
      await Promise.all(
        doctorStoreIds.map(async (storeId) => {
          try {
            const response = await api.getScheduleDates({ doctorId, storeId });
            const dates = unwrapList(response);
            if (dates.some((date) => String(date).slice(0, 10) >= todayString)) {
              availableStoreIds.push(readString(storeId));
            }
          } catch (error) {
            scheduleFailed = true;
            console.error('[StoreSelect] Load schedules error:', error);
          }
        })
      );
    } else {
      await Promise.all(
        stores.map(async (store) => {
          const currentStoreId = readString(store.id);
          const doctorsByStore = doctors.filter((doctor) => Array.isArray(doctor.storeIds) && doctor.storeIds.some((storeId) => sameId(storeId, currentStoreId)));
          const scheduleChecks = await Promise.all(
            doctorsByStore.map(async (doctor) => {
              try {
                const response = await api.getScheduleDates({ doctorId: doctor.id, storeId: currentStoreId });
                const dates = unwrapList(response);
                return dates.some((date) => String(date).slice(0, 10) >= todayString);
              } catch (error) {
                scheduleFailed = true;
                console.error('[StoreSelect] Load store schedules error:', error);
                return false;
              }
            })
          );
          if (scheduleChecks.some(Boolean)) {
            availableStoreIds.push(currentStoreId);
          }
        })
      );
    }

    let filteredStores = [];

    if (doctorId) {
      const doctorStoreIds = selectedDoctor && Array.isArray(selectedDoctor.storeIds) ? selectedDoctor.storeIds : [];
      filteredStores = stores.filter((store) => {
        const currentStoreId = readString(store.id);
        if (store.status === 'prepare') {
          return true;
        }
        return doctorStoreIds.some((storeId) => sameId(storeId, currentStoreId)) && availableStoreIds.some((storeId) => sameId(storeId, currentStoreId));
      });
    } else {
      filteredStores = stores.filter((store) => {
        if (store.status === 'prepare') {
          return true;
        }
        return availableStoreIds.some((storeId) => sameId(storeId, store.id));
      });
    }

    const normalizedStores = filteredStores
      .map((store) => normalizeStore(store, location))
      .sort((leftStore, rightStore) => {
        if (!location) {
          return 0;
        }
        if (!Number.isFinite(leftStore._distanceValue)) {
          return 1;
        }
        if (!Number.isFinite(rightStore._distanceValue)) {
          return -1;
        }
        return leftStore._distanceValue - rightStore._distanceValue;
      });

    if (this.storeRequest !== request) return;
    this.setData({
      stores: normalizedStores,
      doctorId,
      loadError: scheduleFailed ? '部分门店排班加载失败，请重试' : '',
    });
    this.hasLoaded = true;
  },

  async requestLocationSort() {
    const location = await this.getLocation();
    if (!location) {
      wx.showToast({ title: '未获取到定位信息，请在设置中开启位置权限', icon: 'none' });
      return;
    }
    this._location = location;
    const sorted = (this.data.stores || [])
      .map((store) => normalizeStore(store, location))
      .sort((leftStore, rightStore) => {
        if (!Number.isFinite(leftStore._distanceValue)) return 1;
        if (!Number.isFinite(rightStore._distanceValue)) return -1;
        return leftStore._distanceValue - rightStore._distanceValue;
      });
    this.setData({ stores: sorted, hasLocation: true });
  },

  handleStoreTap(event) {
    const store = event.detail || {};
    if (!store.id) {
      return;
    }
    if (store.status === 'prepare') {
      wx.showToast({
        title: '该门店暂未开通线上预约，请选择其他门店',
        icon: 'none',
        duration: 2000,
      });
      return;
    }

    if (this.data.doctorId) {
      navigation.openPage('/pages/appointment/time-select?doctorId=' + this.data.doctorId + '&storeId=' + store.id);
      return;
    }

    navigation.openPage('/pages/appointment/doctor-list?storeId=' + store.id);
  },
});
