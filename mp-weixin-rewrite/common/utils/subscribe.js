const { getBookingSettings, recordVisitReminderAuthorization } = require('../../api/modules/appointment-api');

const MAX_TEMPLATE_IDS_PER_REQUEST = 3;
const SCENE_EVENTS = {
  appointment: ['visit_reminder'],
  withdraw: ['withdraw_result', 'withdraw_paid'],
  withdrawPaid: ['withdraw_paid'],
  order: ['order_shipped'],
  distribution: ['promoter_activated'],
};

let cachedSettings = null;
let settingsRequest = null;
const requestedScenesInSession = {};
const activeUpdateRequests = new Set();

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

function addUnique(ids, templateId) {
  const value = String(templateId || '').trim();
  if (value && !ids.includes(value)) {
    ids.push(value);
  }
}

function pickTemplateIds(settings, scene) {
  const ids = [];
  const templateMap = settings.subscribeTemplateMap || {};
  const sceneEvents = SCENE_EVENTS[scene] || [];

  sceneEvents.forEach((event) => addUnique(ids, templateMap[event]));

  if (!scene && !ids.length && Array.isArray(settings.subscribeTemplateIds)) {
    settings.subscribeTemplateIds.forEach((templateId) => addUnique(ids, templateId));
  }

  return ids.slice(0, MAX_TEMPLATE_IDS_PER_REQUEST);
}

function refreshSubscribeSettings() {
  if (!settingsRequest) {
    settingsRequest = Promise.resolve()
      .then(() => getBookingSettings())
      .then((response) => {
        cachedSettings = unwrapObject(response);
        return cachedSettings;
      })
      .catch(() => ({}))
      .finally(() => { settingsRequest = null; });
  }
  return settingsRequest;
}

async function getSubscribeTemplateIds(scene) {
  return pickTemplateIds(await refreshSubscribeSettings(), scene);
}

async function requestSubscribe(options) {
  const force = options && options.force;
  const scene = options && options.scene;
  const fromTap = options && options.fromTap;
  const sceneKey = scene || 'default';
  if (!force && requestedScenesInSession[sceneKey]) {
    return;
  }
  if (!wx.requestSubscribeMessage) {
    return;
  }

  // Use prefetched templates during the tap, before any network wait.
  let templateIds = pickTemplateIds(cachedSettings || {}, scene);
  if (!templateIds.length && fromTap) {
    void refreshSubscribeSettings();
    return;
  }
  if (!templateIds.length) templateIds = await getSubscribeTemplateIds(scene);
  if (!templateIds.length) {
    return;
  }

  requestedScenesInSession[sceneKey] = true;
  return new Promise((resolve) => {
    try {
      wx.requestSubscribeMessage({
        tmplIds: templateIds,
        success: resolve,
        fail: (error) => {
          delete requestedScenesInSession[sceneKey];
          console.warn('微信订阅消息授权调用失败', error.errCode);
          resolve(null);
        },
      });
    } catch (error) {
      delete requestedScenesInSession[sceneKey];
      console.warn('微信订阅消息授权调用失败', error.message);
      resolve(null);
    }
  });
}

module.exports = {
  getSubscribeTemplateIds,
  refreshSubscribeSettings,
  requestSubscribe,
  async subscribeToUpdates(scene, isCurrent) {
    if (!isCurrent() || activeUpdateRequests.has(scene)) return;
    activeUpdateRequests.add(scene);
    try {
      const result = await requestSubscribe({ force: true, scene, fromTap: true });
      if (!isCurrent()) return;
      const accepted = Object.values(result || {}).includes('accept');
      wx.showToast({ title: accepted ? '已订阅通知' : '未获得订阅授权，可稍后重试', icon: accepted ? 'success' : 'none' });
    } finally {
      activeUpdateRequests.delete(scene);
    }
  },
  async subscribeToVisitReminder(appointmentId, isCurrent) {
    if (!isCurrent()) return false;
    const result = await requestSubscribe({ force: true, scene: 'appointment', fromTap: true });
    const templateId = Object.keys(result || {}).find(key => result[key] === 'accept');
    if (!templateId || !isCurrent()) return false;
    await recordVisitReminderAuthorization(appointmentId, templateId);
    return true;
  },
};
