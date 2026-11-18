const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function parseAppointmentTimestamp(date, time) {
  const dayParts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(date || ''));
  const timeParts = /^(\d{1,2}):(\d{1,2})(?::(\d{2}))?$/.exec(String(time || '').split('-')[0].trim());
  if (!dayParts || !timeParts) return null;
  const [, year, month, day] = dayParts.map(Number);
  const [, hour, minute, seconds = '0'] = timeParts;
  if (+hour > 23 || +minute > 59 || +seconds > 59) return null;
  const wallTime = Date.UTC(year, month - 1, day, +hour, +minute, +seconds);
  const calendar = new Date(wallTime);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
      calendar.getUTCDate() !== day) return null;
  return wallTime - BEIJING_OFFSET_MS;
}

function getBeijingDate(timestamp) {
  return new Date(timestamp + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

const RESCHEDULE_LIMIT_HOURS = 2;

function getCancelLimitHours(settings = {}) {
  const configured = Number(settings.cancelLimitHours ?? settings.cancel_limit_hours);
  if (Number.isFinite(configured) && configured > 0) return configured;
  const match = /^就诊前\s*(\d+(?:\.\d+)?)\s*(小时|天)$/.exec(String(settings.cancelLimit || '').trim());
  const hours = match ? Number(match[1]) * (match[2] === '天' ? 24 : 1) : 0;
  return Number.isFinite(hours) && hours > 0 ? hours : 2;
}

module.exports = { parseAppointmentTimestamp, getBeijingDate, RESCHEDULE_LIMIT_HOURS, getCancelLimitHours };
