const { getBookingSettings } = require('../../api/modules/appointment-api');

const MAX_TEMPLATE_IDS_PER_REQUEST = 3;
const SCENE_EVENTS = {
  appointment: ['appointment_created', 'appointment_paid', 'appointment_status', 'visit_reminder', 'revisit_reminder'],
  appointmentCancel: ['appointment_changed', 'appointment_status', 'refund_result'],
  order: ['order_status', 'refund_result'],
  refund: ['refund_result', 'order_status'],
  withdraw: ['withdraw_result', 'withdraw_paid'],
  distribution: ['commission_settled'],
};

let cachedSettings = null;
const requestedScenesInSession = {};

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

async function getSubscribeSettings() {
  if (cachedSettings) {
    return cachedSettings;
  }
  try {
    const response = await getBookingSettings();
    cachedSettings = unwrapObject(response) || {};
  } catch (error) {
    cachedSettings = {};
  }
  return cachedSettings;
}

async function getSubscribeTemplateIds(scene) {
  const settings = await getSubscribeSettings();
  return pickTemplateIds(settings, scene);
}

async function requestSubscribe(options) {
  const force = options && options.force;
  const scene = options && options.scene;
  const sceneKey = scene || 'default';
  if (!force && requestedScenesInSession[sceneKey]) {
    return;
  }
  if (!wx.requestSubscribeMessage) {
    return;
  }

  const templateIds = await getSubscribeTemplateIds(scene);
  if (!templateIds.length) {
    return;
  }

  requestedScenesInSession[sceneKey] = true;
  await new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      complete: resolve,
    });
  });
}

module.exports = {
  getSubscribeTemplateIds,
  requestSubscribe,
};
