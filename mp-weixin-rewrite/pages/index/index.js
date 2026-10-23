const api = require('../../api/index');
const { normalizeImageUrl } = require('../../common/utils/image-url');
const sessionStore = require('../../stores/session-store');

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
    avatarUrl: normalizeImageUrl(
      doctor.avatarUrl || doctor.avatar || doctor.avatar_url || doctor.doctorAvatar || doctor.doctor_avatar
    ),
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
    coverUrl: store.coverUrl || store.cover_url || store.imageUrl || store.image_url || '',
    imageUrls: store.imageUrls || store.image_urls || [],
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
    hasLoaded: false,
    loadError: '',
    doctorsLoadFailed: false,
    storesLoadFailed: false,
    patientCountLabel: '--',
    satisfactionRateLabel: '--',
    storeCountLabel: '--',
    recommendedDoctors: [],
    stores: [],
  },

  onLoad(options) {
    try {
      const backendReferral = require('../../common/utils/backend-referral');
      if (backendReferral && backendReferral.capture) backendReferral.capture(options);
    } catch (e) {}
    this.hasLoaded = false;
  },

  async onShow() {
    this._unloaded = false;
    this._navigationPending = false;
    await this.loadPage({ silent: this.data.hasLoaded });
  },

  onUnload() {
    this._unloaded = true;
    this._loadRequestId = (this._loadRequestId || 0) + 1;
  },

  retryLoad() {
    if (this._unloaded || this.data.loading) return;
    return this.loadPage();
  },

  async loadPage(options = {}) {
    if (this._unloaded) return;
    const requestId = this._loadRequestId = (this._loadRequestId || 0) + 1;
    const silent = !!options.silent;
    if (!silent) {
      this.setData({ loading: true, loadError: '' });
    }

    try {
      const location = null;
      const directoryQuery = undefined;
      const results = await Promise.allSettled([
        api.getHomeStats(),
        api.getDoctors(directoryQuery),
        api.getStores(directoryQuery),
      ]);
      if (this._unloaded || requestId !== this._loadRequestId) return;
      // Avoid the array-destructuring runtime helper in the WeChat compiler.
      const statsResult = results[0];
      const doctorsResult = results[1];
      const storesResult = results[2];

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
      const failedSections = [];
      if (statsResult.status === 'rejected') failedSections.push('首页统计');
      if (doctorsResult.status === 'rejected') failedSections.push('推荐医生');
      if (storesResult.status === 'rejected') failedSections.push('门店');

      this.setData({
        hasLoaded: true,
        loading: false,
        doctorsLoadFailed: doctorsResult.status === 'rejected',
        storesLoadFailed: storesResult.status === 'rejected',
        loadError: allFailed ? '加载首页失败' : (failedSections.length ? failedSections.join('、') + '加载失败，请稍后重试' : ''),
        patientCountLabel: statsSource.totalPatients != null && Number.isFinite(totalPatients) ? formatIntegerWithCommas(totalPatients) : '--',
        satisfactionRateLabel: statsSource.satisfactionRate != null && Number.isFinite(satisfactionRate) ? String(satisfactionRate) + '%' : '--',
        storeCountLabel: statsSource.storeCount != null && Number.isFinite(storeCount) ? String(storeCount) : '--',
        recommendedDoctors,
        stores,
      });
    } catch (error) {
      if (this._unloaded || requestId !== this._loadRequestId) return;
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载首页失败',
        doctorsLoadFailed: true,
        storesLoadFailed: true,
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
    this.navigateOnce('/pages/appointment/store-select');
  },

  navigateToApptTab() {
    const appointmentRecordsUrl = '/pages/appointment/booking/index?tab=mine';
    if (!sessionStore.isLoggedIn()) {
      this.navigateOnce('/pages/auth/login?redirect=' + encodeURIComponent(appointmentRecordsUrl));
      return;
    }
    this.navigateOnce(appointmentRecordsUrl);
  },

  goAssessment() {
    this.navigateOnce('/pages/assessment/index');
  },

  goTreatmentTab() {
    this.navigateOnce('/pages/treatment/index', 'switchTab');
  },

  goMedicalRecords() {
    if (!sessionStore.isLoggedIn()) {
      this.navigateOnce('/pages/auth/login?redirect=' + encodeURIComponent('/pages/profile/medical-records/index'));
      return;
    }
    this.navigateOnce('/pages/profile/medical-records/index');
  },

  goDoctorList() {
    this.navigateOnce('/pages/appointment/doctor-list');
  },

  handleDoctorClick(event) {
    const doctor = event.detail || {};
    if (!doctor.id) return;
    this.navigateOnce('/pages/appointment/doctor-detail?id=' + doctor.id);
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
    this.navigateOnce('/pages/appointment/doctor-list?storeId=' + store.id);
  },

  navigateOnce(url, method = 'navigateTo') {
    if (this._unloaded || this._navigationPending) return;
    this._navigationPending = true;
    const fail = () => {
      this._navigationPending = false;
      if (!this._unloaded) wx.showToast({ title: '页面打开失败，请重试', icon: 'none' });
    };
    try {
      // Hold the lock until returning to this page; a failure permits retry.
      wx[method]({ url, fail });
    } catch (error) {
      fail();
    }
  },
});
