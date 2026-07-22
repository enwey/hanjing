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

function normalizeDoctor(doctor) {
  const name = doctor.name || '';
  return {
    ...doctor,
    id: readString(doctor.id),
    name,
    title: doctor.title || doctor.jobTitle || '',
    specialty: doctor.specialty || doctor.specialities || doctor.expertiseText || doctor.expertise || '',
    experience: Number(doctor.experience || doctor.yearsOfExperience || 0),
    expertise: Array.isArray(doctor.expertise)
      ? doctor.expertise.filter(Boolean)
      : String(doctor.expertise || doctor.specialty || '')
          .split(/[、,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
    rating: doctor.rating || 0,
    reviewCount: doctor.reviewCount || 0,
    consultCount: doctor.consultCount || 0,
  };
}

Page({
  data: {
    storeId: '',
    storeName: '',
    doctors: [],
  },

  onLoad(options) {
    this.options = options || {};
  },

  async onShow() {
    const token = wx.getStorageSync('access_token');
    if (!token) {
      navigation.openPage('/pages/auth/login');
      return;
    }
    await this.loadPage();
  },

  async loadPage() {
    const storeId = readString((this.options && this.options.storeId) || '');
    const [doctorsResponse, storesResponse] = await Promise.all([
      api.getDoctors(storeId ? { storeId } : undefined),
      api.getStores(),
    ]);

    const doctors = unwrapList(doctorsResponse).map(normalizeDoctor);
    const stores = unwrapList(storesResponse);
    const currentStore = stores.find((store) => readString(store.id) === storeId) || null;

    this.setData({
      storeId,
      storeName: currentStore ? currentStore.name || currentStore.storeName || '' : '',
      doctors,
    });
  },

  handleDoctorTap(event) {
    const doctorId = readString(event.currentTarget.dataset.doctorId);
    if (!doctorId) {
      return;
    }

    if (this.data.storeId) {
      navigation.openPage('/pages/appointment/time-select?doctorId=' + doctorId + '&storeId=' + this.data.storeId);
      return;
    }

    navigation.openPage('/pages/appointment/doctor-detail?id=' + doctorId);
  },
});
