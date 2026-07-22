const userApi = require('../../../../api/modules/user-api');

const BASE_RELATIONS = [
  { value: 'spouse', label: '配偶' },
  { value: 'child', label: '子女' },
  { value: 'parent', label: '父母' },
  { value: 'sibling', label: '兄弟姐妹' },
  { value: 'other', label: '其他' },
];

Page({
  data: {
    loading: true,
    isEdit: false,
    isSelf: false,
    memberId: '',
    relationOptions: BASE_RELATIONS,
    form: {
      name: '',
      relation: 'spouse',
      gender: '1',
      age: '',
      phone: '',
      idCard: '',
      cardNo: '',
    },
  },

  onLoad(options) {
    this.options = options || {};
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    const memberId = (this.options && this.options.id) || '';
    if (!memberId) {
      this.setData({ loading: false, isEdit: false, isSelf: false, memberId: '' });
      return;
    }
    try {
      const response = await userApi.getFamilyMemberDetail(memberId);
      const data = (response && response.data) || response || {};
      const isSelf = data.relation === 'self';
      this.setData({
        loading: false,
        isEdit: true,
        isSelf,
        memberId,
        relationOptions: isSelf ? [{ value: 'self', label: '本人' }].concat(BASE_RELATIONS) : BASE_RELATIONS,
        form: {
          name: data.name || '',
          relation: data.relation || 'spouse',
          gender: String(data.gender || '1'),
          age: data.age === null || data.age === undefined ? '' : String(data.age),
          phone: data.phone || '',
          idCard: data.idCard || '',
          cardNo: data.cardNo || '',
        },
      });
    } catch (error) {
      this.setData({ loading: false });
    }
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: event.detail.value || '' });
  },

  chooseRelation(event) {
    if (this.data.isSelf) return;
    this.setData({ 'form.relation': event.currentTarget.dataset.value });
  },

  chooseGender(event) {
    if (this.data.isSelf) return;
    this.setData({ 'form.gender': String(event.currentTarget.dataset.value) });
  },

  async saveMember() {
    const payload = {
      name: this.data.form.name.trim(),
      relation: this.data.form.relation,
      gender: this.data.form.gender,
      age: this.data.form.age ? Number(this.data.form.age) : null,
      phone: this.data.form.phone.trim(),
      idCard: this.data.form.idCard.trim(),
      cardNo: this.data.form.cardNo.trim(),
    };
    try {
      if (this.data.isEdit) {
        await userApi.updateFamilyMember(this.data.memberId, payload);
      } else {
        await userApi.addFamilyMember(payload);
      }
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '保存失败', icon: 'none' });
    }
  },

  async deleteMember() {
    if (this.data.isSelf || !this.data.memberId) return;
    try {
      await userApi.deleteFamilyMember(this.data.memberId);
      wx.showToast({ title: '已解除关联', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (error) {
      wx.showToast({ title: (error && error.message) || '解除失败', icon: 'none' });
    }
  },
});
