function toChinaShiftedDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function readChinaParts(value) {
  const shifted = toChinaShiftedDate(value);
  if (!shifted) return null;
  return {
    year: shifted.getUTCFullYear(),
    month: pad(shifted.getUTCMonth() + 1),
    day: pad(shifted.getUTCDate()),
    hour: pad(shifted.getUTCHours()),
    minute: pad(shifted.getUTCMinutes()),
    second: pad(shifted.getUTCSeconds()),
  };
}

function formatChinaDateTime(value, includeSeconds) {
  if (!value) return '';
  const parts = readChinaParts(value);
  if (!parts) return String(value).replace('T', ' ').slice(0, includeSeconds === false ? 16 : 19);
  const base = parts.year + '-' + parts.month + '-' + parts.day + ' ' + parts.hour + ':' + parts.minute;
  return includeSeconds === false ? base : base + ':' + parts.second;
}

function formatChinaDate(value) {
  if (!value) return '';
  const text = String(value).trim();
  const matched = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched) return matched[1];
  const parts = readChinaParts(value);
  if (!parts) return text;
  return parts.year + '-' + parts.month + '-' + parts.day;
}

function formatChinaMonthDayTime(value) {
  if (!value) return '';
  const parts = readChinaParts(value);
  if (!parts) return String(value);
  return Number(parts.month) + '月' + Number(parts.day) + '日 ' + parts.hour + ':' + parts.minute;
}

function getChinaTodayString() {
  return formatChinaDateTime(Date.now(), false).slice(0, 10);
}

module.exports = {
  formatChinaDateTime,
  formatChinaDate,
  formatChinaMonthDayTime,
  getChinaTodayString,
};
