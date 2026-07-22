const api = require('../../api/index');

function formatIntegerWithCommas(value) {
  const text = String(Math.max(0, parseInt(value, 10) || 0));
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function calculateDistanceInKilometers(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  if (![fromLatitude, fromLongitude, toLatitude, toLongitude].every((value) => Number.isFinite(value))) {
    return null;
  }

  const earthRadius = 6371;
  const latDistance = ((toLatitude - fromLatitude) * Math.PI) / 180;
  const lonDistance = ((toLongitude - fromLongitude) * Math.PI) / 180;
  const sinLat = Math.sin(latDistance / 2);
  const sinLon = Math.sin(lonDistance / 2);
  const haversine =
    sinLat * sinLat +
    Math.cos((fromLatitude * Math.PI) / 180) *
      Math.cos((toLatitude * Math.PI) / 180) *
      sinLon *
      sinLon;

  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function formatDistance(distanceInKilometers) {
  if (!Number.isFinite(distanceInKilometers)) {
    return '';
  }
  if (distanceInKilometers < 1) {
    return '距您' + Math.round(distanceInKilometers * 1000) + 'm';
  }
  return '距您' + distanceInKilometers.toFixed(1) + 'km';
}

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function normalizeDoctor(doctor) {
  return {
    id: doctor.id,
    name: doctor.name || '',
    avatarText: (doctor.name || '').slice(0, 1) || '?',
    title: doctor.title || doctor.jobTitle || '',
    specialty: doctor.specialty || doctor.specialities || doctor.expertise || '',
    experience: Number(doctor.experienceYears || doctor.experience || 0),
    expertise: Array.isArray(doctor.expertise) ? doctor.expertise.slice(0, 5) : [],
    rating: Number(doctor.rating || 0).toFixed(1),
    reviewCount: Number(doctor.reviewCount || 0),
    consultCount: Number(doctor.consultCount || 0),
  };
}

function normalizeStore(store, location) {
  const latitude = Number(store.latitude);
  const longitude = Number(store.longitude);
  const distanceInKilometers = location
    ? calculateDistanceInKilometers(location.latitude, location.longitude, latitude, longitude)
    : null;
  return {
    id: store.id,
    name: store.name || store.storeName || '',
    address: store.address || store.location || '',
    businessHours: store.businessHours || store.openingHours || '',
    doctorCount: Number(store.doctorCount || 0),
    tags: Array.isArray(store.tags) ? store.tags.slice(0, 3) : [],
    isOpen: Boolean(store.isOpen),
    status: store.status || 'open',
    distanceInKilometers,
    distanceText: formatDistance(distanceInKilometers),
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    patientCountLabel: '10,000+',
    satisfactionRateLabel: '98%',
    storeCountLabel: '3',
    recommendedDoctors: [],
    stores: [],
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });

    try {
      const location = await this.tryGetLocation();
      const directoryQuery = location
        ? { latitude: location.latitude, longitude: location.longitude }
        : undefined;
      const [statsResult, doctorsResult, storesResult] = await Promise.allSettled([
        api.getHomeStats(),
        api.getDoctors(directoryQuery),
        api.getStores(directoryQuery),
      ]);

      const statsSource = statsResult.status === 'fulfilled'
        ? ((statsResult.value && statsResult.value.data) || statsResult.value || {})
        : {};
      const recommendedDoctors = statsResult.status === 'rejected' && doctorsResult.status === 'rejected'
        ? []
        : unwrapList(doctorsResult.status === 'fulfilled' ? doctorsResult.value : null)
            .map(normalizeDoctor)
            .slice(0, 3);
      const stores = unwrapList(storesResult.status === 'fulfilled' ? storesResult.value : null)
        .map((store) => normalizeStore(store, location));

      const totalPatients = Number(statsSource.totalPatients || 0);
      const satisfactionRate = Number(statsSource.satisfactionRate || 0);
      const storeCount = Number(statsSource.storeCount || 0);
      const allFailed =
        statsResult.status === 'rejected' &&
        doctorsResult.status === 'rejected' &&
        storesResult.status === 'rejected';

      this.setData({
        loading: false,
        loadError: allFailed ? '加载首页失败' : '',
        patientCountLabel: totalPatients > 0 ? formatIntegerWithCommas(totalPatients) + '+' : '10,000+',
        satisfactionRateLabel: satisfactionRate > 0 ? String(satisfactionRate) + '%' : '98%',
        storeCountLabel: storeCount > 0 ? String(storeCount) : '3',
        recommendedDoctors,
        stores,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载首页失败',
      });
    }
  },

  tryGetLocation() {
    return new Promise((resolve) => {
      wx.getLocation({
        type: 'wgs84',
        success(result) {
          resolve({ latitude: result.latitude, longitude: result.longitude });
        },
        fail() {
          resolve(null);
        },
      });
    });
  },

  goStoreSelect() {
    wx.navigateTo({ url: '/pages/appointment/store-select' });
  },

  navigateToApptTab() {
    wx.switchTab({ url: '/pages/appointment/index' });
  },

  goAssessment() {
    wx.navigateTo({ url: '/pages/assessment/index' });
  },

  goTreatmentTab() {
    wx.switchTab({ url: '/pages/treatment/index' });
  },

  goMedicalRecords() {
    const token = wx.getStorageSync('access_token');
    if (!token) {
      wx.navigateTo({ url: '/pages/auth/login' });
      return;
    }
    wx.navigateTo({ url: '/pages/profile/medical-records/index' });
  },

  goDoctorList() {
    wx.navigateTo({ url: '/pages/appointment/doctor-list' });
  },

  handleDoctorClick(event) {
    const doctor = event.detail || {};
    if (!doctor.id) return;
    wx.navigateTo({ url: '/pages/appointment/doctor-detail?id=' + doctor.id });
  },

  handleStoreClick(event) {
    const store = event.detail || {};
    if (!store.id) return;
    if (store.status === 'prepare') {
      wx.showToast({
        title: '该门店正在筹建中，暂未开放预约，敬请期待！',
        icon: 'none',
        duration: 2000,
      });
      return;
    }
    wx.navigateTo({ url: '/pages/appointment/doctor-list?storeId=' + store.id });
  },
});
