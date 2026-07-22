const userApi = require('../api/modules/user-api');

const RELATION_LABEL_MAP = {
  self: '本人',
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  sibling: '兄弟姐妹',
  other: '其他',
};

function getRelationLabel(relation) {
  return RELATION_LABEL_MAP[relation] || relation || '成员';
}

function normalizeMembers(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.list || payload.members || payload || [];
}

function resolveSelectedMember(members, selectedPatientId) {
  if (!members.length) {
    return null;
  }

  if (selectedPatientId) {
    const selectedMember = members.find((member) => String(member.id) === String(selectedPatientId));
    if (selectedMember) {
      return selectedMember;
    }
  }

  return members.find((member) => member.relation === 'self') || members[0];
}

async function loadPatientContext(selectedPatientId) {
  const membersResponse = await userApi.getFamilyMembers();
  const members = normalizeMembers(membersResponse);
  const currentMember = resolveSelectedMember(members, selectedPatientId);

  return {
    members,
    currentMember,
    currentPatientId: currentMember ? String(currentMember.id) : '',
  };
}

module.exports = {
  getRelationLabel,
  loadPatientContext,
};
