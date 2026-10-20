const api = require('../../../../api/index');
const { normalizeImageUrl } = require('../../../../common/utils/image-url');

const RELATION_OPTIONS = [
  { value: 'self', label: '本人' },
  { value: 'spouse', label: '配偶' },
  { value: 'child', label: '子女' },
  { value: 'parent', label: '父母' },
  { value: 'sibling', label: '兄弟姐妹' },
  { value: 'other', label: '其他' },
];

const GENDER_OPTIONS = [
  { value: '1', label: '男' },
  { value: '2', label: '女' },
];

function normalizeGenderValue(value) {
  const gender = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  if (gender === '2' || gender === '女' || gender === 'female' || gender === 'f') return '2';
  return '1';
}

function unwrapList(response) {
  const payload = response && response.data ? response.data : response || {};
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.list)) return payload.list;
  if (Array.isArray(payload.items)) return payload.items;
  if (payload.data && Array.isArray(payload.data.list)) return payload.data.list;
  return [];
}

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

function calculateAgeFromBirthday(birthday) {
  if (!birthday) return '';
  const birthDate = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age >= 0 ? String(age) : '';
}

function getTodayDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

Page({
  data: {
    name: '',
    relation: 'self',
    gender: '1',
    birthday: '',
    age: '',
    phone: '',
    idCard: '',
    cardNo: '',
    avatarUrl: '',
    avatarPreviewUrl: '',
    isUploading: false,
    storeId: '',
    storeName: '',
    storeOptions: [],
    storeNames: [],
    storeIndex: -1,
    region: '',
    regionArray: [],
    address: '',
    isEdit: false,
    isSelf: false,
    isSubmitting: false,
    source: '',
    returnToAppointment: false,
    todayDate: getTodayDate(),
    relationOptions: RELATION_OPTIONS,
    genderOptions: GENDER_OPTIONS,
  },

  async onLoad(options) {
    this.memberId = options && options.id ? String(options.id) : '';
    const source = options && options.source ? String(options.source) : '';
    const storeId = options && options.storeId ? String(options.storeId) : '';
    const storeName = options && options.storeName ? String(options.storeName) : '';
    this.setData({
      source,
      returnToAppointment: source === 'appointment',
      storeId,
      storeName,
    });
    if (this.memberId) {
      this.setData({ isEdit: true });
      await this.loadMemberDetails(this.memberId);
    } else {
      await this.loadStores(storeId);
    }
  },

  async loadStores(preferredStoreId = '') {
    try {
      const response = await api.getStores();
      const stores = unwrapList(response).filter((store) => String(store.status || 'open') !== 'closed');
      const storeOptions = stores.map((store) => ({
        id: String(store.id || ''),
        name: store.name || store.storeName || '',
      })).filter((store) => store.id && store.name);
      const storeNames = storeOptions.map((store) => store.name);
      let storeIndex = preferredStoreId ? storeOptions.findIndex((store) => store.id === String(preferredStoreId)) : -1;
      if (storeIndex < 0 && this.data.storeId) {
        storeIndex = storeOptions.findIndex((store) => store.id === String(this.data.storeId));
      }
      this.setData({
        storeOptions,
        storeNames,
        storeIndex,
        storeId: storeIndex >= 0 ? storeOptions[storeIndex].id : this.data.storeId,
        storeName: storeIndex >= 0 ? storeOptions[storeIndex].name : this.data.storeName,
      });
    } catch (error) {
      console.error('Load stores failed', error);
    }
  },

  async loadMemberDetails(id) {
    try {
      const response = await api.getFamilyMemberDetail(id);
      const data = unwrapObject(response);
      const isSelf = data.relation === 'self';
      const birthday = data.birthday ? String(data.birthday).slice(0, 10) : '';
      const storeId = data.storeId || data.store_id || '';
      const regionText = data.region || '';
      const regionArray = regionText ? String(regionText).split(/[\s/,-]+/).filter(Boolean).slice(0, 3) : [];

      this.setData({
        name: data.name || '',
        relation: data.relation || 'other',
        gender: normalizeGenderValue(data.gender),
        birthday,
        age: data.age === null || data.age === undefined ? calculateAgeFromBirthday(birthday) : String(data.age),
        phone: data.phone === null || data.phone === undefined ? '' : String(data.phone),
        idCard: data.idCard || data.id_card || '',
        cardNo: data.cardNo || data.card_no || '',
        avatarUrl: data.avatarUrl || data.avatar || data.avatar_url || '',
        avatarPreviewUrl: normalizeImageUrl(data.avatarUrl || data.avatar || data.avatar_url || ''),
        storeId: storeId ? String(storeId) : '',
        storeName: data.storeName || data.store_name || '',
        region: regionText,
        regionArray,
        address: data.address || '',
        isSelf,
      });
      await this.loadStores(storeId);
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '加载详情失败', icon: 'none' });
    }
  },

  chooseAvatar() {
    if (this.data.isSelf || this.data.isUploading || this.data.isSubmitting) return;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (result) => {
        const filePath = result.tempFilePaths && result.tempFilePaths[0];
        if (!filePath) return;
        this.setData({ isUploading: true });
        try {
          wx.showLoading({ title: '上传中...' });
          const extMatch = filePath.match(/\.([a-zA-Z0-9]+)$/);
          const uploadResponse = await api.uploadLocalFile(filePath, extMatch ? extMatch[1] : 'jpg');
          const uploadData = unwrapObject(uploadResponse);
          const url = uploadData.url || uploadData.fileUrl || uploadData.path || '';
          if (!url) throw new Error('头像上传结果无效');
          this.setData({ avatarUrl: url, avatarPreviewUrl: normalizeImageUrl(url) });
        } catch (error) {
          wx.showToast({ title: '头像上传失败，可稍后重试', icon: 'none' });
        } finally {
          wx.hideLoading();
          this.setData({ isUploading: false });
        }
      },
    });
  },

  handleNameInput(event) {
    this.setData({ name: event.detail.value || '' });
  },

  handlePhoneInput(event) {
    this.setData({ phone: event.detail.value || '' });
  },

  handleIdCardInput(event) {
    this.setData({ idCard: event.detail.value || '' });
  },

  handleCardNoInput(event) {
    this.setData({ cardNo: event.detail.value || '' });
  },

  handleAddressInput(event) {
    this.setData({ address: event.detail.value || '' });
  },

  selectRelation(event) {
    if (this.data.isSelf) return;
    this.setData({ relation: String(event.currentTarget.dataset.value || 'other') });
  },

  selectGender(event) {
    if (this.data.isSelf) return;
    this.setData({ gender: String(event.currentTarget.dataset.value || '1') });
  },

  handleStoreChange(event) {
    const index = Number(event.detail.value || 0);
    const store = this.data.storeOptions[index];
    if (!store) return;
    this.setData({ storeIndex: index, storeId: store.id, storeName: store.name });
  },

  handleBirthdayChange(event) {
    const birthday = event.detail.value || '';
    this.setData({ birthday, age: calculateAgeFromBirthday(birthday) });
  },

  handleRegionChange(event) {
    const regionArray = event.detail.value || [];
    this.setData({ regionArray, region: regionArray.join(' ') });
  },

  buildPayload() {
    return {
      name: String(this.data.name || '').trim(),
      relation: this.data.relation,
      gender: this.data.gender,
      birthday: this.data.birthday,
      age: this.data.age ? parseInt(this.data.age, 10) : undefined,
      phone: String(this.data.phone || '').trim(),
      idCard: String(this.data.idCard || '').trim(),
      cardNo: String(this.data.cardNo || '').trim(),
      avatarUrl: String(this.data.avatarUrl || '').trim(),
      storeId: this.data.storeId,
      region: String(this.data.region || '').trim(),
      address: String(this.data.address || '').trim(),
    };
  },

  validatePayload(payload) {
    if (this.data.isSelf) return '本人信息不可在此修改';
    if (!payload.storeId) return '请选择所属诊所';
    if (!payload.relation) return '请选择与本人关系';
    if (!payload.phone) return '请输入手机号';
    if (!/^1[3-9]\d{9}$/.test(payload.phone)) return '手机号格式不正确';
    if (!payload.name) return '请输入姓名';
    if (payload.name.length > 20) return '姓名最多20个字符';
    if (!payload.gender) return '请选择性别';
    if (!payload.birthday) return '请选择出生日期';
    const birthdayDate = new Date(payload.birthday + 'T00:00:00Z');
    if (!Number.isFinite(birthdayDate.getTime()) || birthdayDate.toISOString().slice(0, 10) !== payload.birthday
      || payload.birthday > getTodayDate()) return '出生日期无效';
    const age = Number(calculateAgeFromBirthday(payload.birthday));
    if (!Number.isInteger(age) || age < 1 || age > 120) return '年龄必须在1至120之间';
    if (payload.idCard && !/^\d{17}[\dXx]$/.test(payload.idCard)) return '身份证格式不正确';
    if (payload.address && !payload.region) return '请选择地区';
    return '';
  },

  async submitAddMember() {
    if (this.data.isSubmitting || this.data.isUploading) return;
    const payload = this.buildPayload();
    const validationMessage = this.validatePayload(payload);
    if (validationMessage) {
      wx.showToast({ title: validationMessage, icon: 'none' });
      return;
    }

    this.setData({ isSubmitting: true });
    try {
      let response;
      if (this.data.isEdit) {
        response = await api.updateFamilyMember(this.memberId, payload);
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        response = await api.addFamilyMember(payload);
        wx.showToast({ title: '新增成功', icon: 'success' });
      }
      const savedMember = unwrapObject(response);
      setTimeout(() => {
        const pages = getCurrentPages();
        const prevPage = pages[pages.length - 2];
        if (this.data.returnToAppointment && savedMember && savedMember.id
          && prevPage && typeof prevPage.selectCreatedPatient === 'function') {
          prevPage.selectCreatedPatient(String(savedMember.id));
        }
        if (prevPage && typeof prevPage.fetchFamilyMembers === 'function') prevPage.fetchFamilyMembers();
        wx.navigateBack();
      }, 800);
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '提交失败', icon: 'none' });
      this.setData({ isSubmitting: false });
    }
  },

  deleteMember() {
    if (this.data.isSelf || !this.memberId || this.data.isSubmitting || this.data.isUploading) return;
    wx.showModal({
      title: '确认解除关联',
      content: '确定要解除与该就诊人的关联吗？解除后不会删除对方的独立档案。',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          await api.deleteFamilyMember(this.memberId);
          wx.showToast({ title: '已解除关联', icon: 'success' });
          setTimeout(() => {
            const pages = getCurrentPages();
            const prevPage = pages[pages.length - 2];
            if (prevPage && typeof prevPage.fetchFamilyMembers === 'function') prevPage.fetchFamilyMembers();
            wx.navigateBack();
          }, 800);
        } catch (error) {
          wx.showToast({ title: (error && error.message) || '解除失败', icon: 'none' });
        }
      },
    });
  },
});
