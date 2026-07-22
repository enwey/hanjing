const api = require('../../../api/index');
const patientContextStore = require('../../../stores/patient-context-store');
const patientContextService = require('../../../services/patient-context-service');

const GENDER_LABEL_MAP = {
  0: '女',
  1: '男',
  female: '女',
  male: '男',
};

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

function normalizeMember(member, currentPatientId) {
  const name = member.name || patientContextService.getRelationLabel(member.relation) || '';
  const genderLabel = GENDER_LABEL_MAP[member.gender] || '未知';
  return {
    id: String(member.id || ''),
    name,
    avatarText: name.slice(0, 1),
    relationLabel: patientContextService.getRelationLabel(member.relation),
    genderLabel,
    ageLabel: member.age ? genderLabel + ' · ' + member.age + '岁' : genderLabel,
    age: member.age || '',
    phone: member.phone || '',
    idCard: member.idCard || '',
    medicalCardNo: member.medicalCardNo || member.medical_record_no || '',
    lastVisit: member.lastVisit || member.lastVisitAt || '',
    isCurrent: String(member.id) === String(currentPatientId),
  };
}

Page({
  data: {
    loading: true,
    loadError: '',
    currentPatientName: '',
    currentPatientRelation: '',
    currentPatientCard: '',
    members: [],
    summary: {
      memberCount: '0',
      linkedCardCount: '0',
      recentVisitCount: '0',
    },
  },

  async onShow() {
    await this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, loadError: '' });
    try {
      const context = await patientContextStore.refresh();
      const membersResponse = await api.getFamilyMembers();
      const members = unwrapList(membersResponse).map((member) => normalizeMember(member, context.currentPatientId));
      const linkedCardCount = members.filter((member) => member.medicalCardNo).length;
      const recentVisitCount = members.filter((member) => member.lastVisit).length;

      this.setData({
        loading: false,
        currentPatientName: context.currentMember ? context.currentMember.name || '' : '',
        currentPatientRelation: context.currentMember ? patientContextService.getRelationLabel(context.currentMember.relation) : '',
        currentPatientCard: context.currentMember
          ? context.currentMember.medicalCardNo || context.currentMember.medical_record_no || ''
          : '',
        members,
        summary: {
          memberCount: String(members.length),
          linkedCardCount: String(linkedCardCount),
          recentVisitCount: String(recentVisitCount),
        },
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadError: (error && error.message) || '加载家庭成员失败',
        members: [],
        summary: {
          memberCount: '0',
          linkedCardCount: '0',
          recentVisitCount: '0',
        },
      });
    }
  },

  openAddMember() {
    wx.navigateTo({ url: '/pages/profile/family-members/add-member/index' });
  },

  openMemberDetail(event) {
    const memberId = String(event.currentTarget.dataset.memberId || '');
    if (!memberId) {
      return;
    }
    wx.navigateTo({ url: '/pages/profile/family-members/add-member/index?id=' + memberId });
  },
});
