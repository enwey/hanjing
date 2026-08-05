const api = require('../../../../api/index');

Page({
  data: {
    name: '',
    relation: 'spouse',
    gender: '1',
    age: '',
    phone: '',
    idCard: '',
    cardNo: '',
    isEdit: false,
    isSelf: false,
    relationOptions: [
      { value: 'spouse', label: '配偶' },
      { value: 'child', label: '子女' },
      { value: 'parent', label: '父母' },
      { value: 'sibling', label: '兄弟姐妹' },
      { value: 'other', label: '其他' },
    ],
  },

  onLoad(options) {
    this.memberId = options && options.id ? String(options.id) : '';
    if (this.memberId) {
      this.setData({ isEdit: true });
      this.loadMemberDetails(this.memberId);
    }
  },

  async loadMemberDetails(id) {
    try {
      const response = await api.getFamilyMemberDetail(id);
      const data = (response && response.data && response.data.data) || (response && response.data) || response || {};
      const isSelf = data.relation === 'self';
      const relationOptions = isSelf
        ? [{ value: 'self', label: '本人' }].concat(this.data.relationOptions)
        : this.data.relationOptions;

      this.setData({
        name: data.name || '',
        relation: data.relation || 'spouse',
        gender: String(data.gender || '1'),
        age: data.age === null || data.age === undefined ? '' : String(data.age),
        phone: data.phone || '',
        idCard: data.idCard || data.id_card || '',
        cardNo: data.cardNo || data.card_no || '',
        isSelf,
        relationOptions,
      });
    } catch (error) {
      wx.showToast({
        title: (error && error.message) || '加载详情失败',
        icon: 'none',
      });
    }
  },

  handleNameInput(event) {
    this.setData({ name: event.detail.value || '' });
  },

  handleAgeInput(event) {
    this.setData({ age: event.detail.value || '' });
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

  selectRelation(event) {
    if (this.data.isSelf) return;
    this.setData({ relation: String(event.currentTarget.dataset.value || 'spouse') });
  },

  selectGender(event) {
    if (this.data.isSelf) return;
    this.setData({ gender: String(event.currentTarget.dataset.value || '1') });
  },

  buildPayload() {
    return {
      name: String(this.data.name || '').trim(),
      relation: this.data.relation,
      gender: this.data.gender,
      age: parseInt(this.data.age, 10),
      phone: String(this.data.phone || '').trim(),
      idCard: String(this.data.idCard || '').trim(),
      cardNo: String(this.data.cardNo || '').trim(),
    };
  },

  validatePayload(payload) {
    if (this.data.isSelf) {
      return '本人信息不可在此修改';
    }
    if (!payload.name) return '请输入姓名';
    if (payload.name.length > 20) return '姓名最多20个字符';
    if (Number.isNaN(payload.age) || payload.age < 1 || payload.age > 120) return '年龄必须在1至120之间';
    if (payload.phone && !/^1[3-9]\d{9}$/.test(payload.phone)) return '手机号格式不正确';
    if (payload.idCard && !/^\d{17}[\dXx]$/.test(payload.idCard)) return '身份证格式不正确';
    return '';
  },

  async submitAddMember() {
    const payload = this.buildPayload();
    const validationMessage = this.validatePayload(payload);
    if (validationMessage) {
      wx.showToast({ title: validationMessage, icon: 'none' });
      return;
    }

    try {
      if (this.data.isEdit) {
        await api.updateFamilyMember(this.memberId, payload);
        wx.showToast({ title: '保存成功', icon: 'success' });
      } else {
        await api.addFamilyMember(payload);
        wx.showToast({ title: '关联成功', icon: 'success' });
      }
      setTimeout(() => {
        const pages = getCurrentPages();
        const prevPage = pages[pages.length - 2];
        if (prevPage && typeof prevPage.fetchFamilyMembers === 'function') {
          prevPage.fetchFamilyMembers();
        }
        wx.navigateBack();
      }, 800);
    } catch (error) {
      wx.showToast({
        title: (error && error.message) || '提交失败',
        icon: 'none',
      });
    }
  },

  deleteMember() {
    if (this.data.isSelf || !this.memberId) {
      return;
    }
    wx.showModal({
      title: '确认解除关联',
      content: '确定要解除与该家庭成员的关联吗？解除后不会删除对方的独立档案。',
      success: async (result) => {
        if (!result.confirm) {
          return;
        }
        try {
          await api.deleteFamilyMember(this.memberId);
          wx.showToast({ title: '已解除关联', icon: 'success' });
          setTimeout(() => {
            const pages = getCurrentPages();
            const prevPage = pages[pages.length - 2];
            if (prevPage && typeof prevPage.fetchFamilyMembers === 'function') {
              prevPage.fetchFamilyMembers();
            }
            wx.navigateBack();
          }, 800);
        } catch (error) {
          wx.showToast({
            title: (error && error.message) || '解除失败',
            icon: 'none',
          });
        }
      },
    });
  },
});
