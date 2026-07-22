const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');

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

function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function normalizeStore(store, location) {
  const latitude = Number(store.latitude);
  const longitude = Number(store.longitude);
  const distanceValue = location ? getDistance(location.latitude, location.longitude, latitude, longitude) : null;
  return {
    ...store,
    id: readString(store.id),
    name: store.name || store.storeName || '',
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
  },

  onLoad(options) {
    this.options = options || {};
  },

  onShow() {
    const token = wx.getStorageSync('access_token');
    if (!token) {
      navigation.openPage('/pages/auth/login');
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
    const doctorId = readString((this.options && (this.options.doctorId || this.options.doctorid)) || '');
    const todayString = getTodayString();

    const [location, storesResponse, doctorsResponse] = await Promise.all([
      this.getLocation(),
      api.getStores(),
      api.getDoctors(),
    ]);

    const stores = unwrapList(storesResponse);
    const doctors = unwrapList(doctorsResponse);
    const selectedDoctor = doctors.find((doctor) => sameId(doctor.id, doctorId));

    let availableStoreIds = [];

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

    this.setData({
      stores: normalizedStores,
      doctorId,
    });
  },

  handleStoreTap(event) {
    const store = event.detail || {};
    if (!store.id) {
      return;
    }
    if (store.status === 'prepare') {
      wx.showToast({
        title: '该门店正在筹建中，暂未开放预约，敬请期待！',
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
