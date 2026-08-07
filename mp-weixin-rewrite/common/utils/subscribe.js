const { getBookingSettings } = require('../../api/modules/appointment-api');

let cachedTemplateIds = null;
let requestedInSession = false;

function unwrapObject(response) {
  const payload = response && response.data ? response.data : response || {};
  return payload.data || payload;
}

async function getSubscribeTemplateIds() {
  if (Array.isArray(cachedTemplateIds)) {
    return cachedTemplateIds;
  }
  try {
    const response = await getBookingSettings();
    const settings = unwrapObject(response) || {};
    cachedTemplateIds = Array.isArray(settings.subscribeTemplateIds)
      ? settings.subscribeTemplateIds.filter(Boolean)
      : [];
  } catch (error) {
    cachedTemplateIds = [];
  }
  return cachedTemplateIds;
}

async function requestSubscribe(options) {
  const force = options && options.force;
  if (!force && requestedInSession) {
    return;
  }
  if (!wx.requestSubscribeMessage) {
    return;
  }

  const templateIds = await getSubscribeTemplateIds();
  if (!templateIds.length) {
    return;
  }

  requestedInSession = true;
  await new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: templateIds,
      complete: resolve,
    });
  });
}

module.exports = {
  requestSubscribe,
};
