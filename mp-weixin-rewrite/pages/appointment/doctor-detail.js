const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');
const { normalizeImageUrl } = require('../../common/utils/image-url');
const sessionStore = require('../../stores/session-store');
const { getBeijingDate } = require('../../common/utils/appointment-time');

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

function readString(value) {
  return value === null || value === undefined ? '' : String(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function buildScheduleRows(schedules, now) {
  const rows = [];
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const todayText = getBeijingDate(now);
  const tomorrowText = getBeijingDate(now + DAY_MS);

  schedules
    .slice()
    .sort((left, right) => {
      if (left.date !== right.date) {
        return String(left.date).localeCompare(String(right.date));
      }
      return String(left.startTime || '').localeCompare(String(right.startTime || ''));
    })
    .forEach((schedule) => {
      if (schedule.date === todayText && schedule.status !== 'available') {
        return;
      }

      const currentDate = new Date(String(schedule.date).replace(/-/g, '/'));
      let dateLabel = '';
      if (schedule.date === todayText) {
        dateLabel = '今天 (' + (currentDate.getMonth() + 1) + '/' + currentDate.getDate() + ')';
      } else if (schedule.date === tomorrowText) {
        dateLabel = '明天 (' + (currentDate.getMonth() + 1) + '/' + currentDate.getDate() + ')';
      } else {
        dateLabel = dayNames[currentDate.getDay()] + ' (' + (currentDate.getMonth() + 1) + '/' + currentDate.getDate() + ')';
      }

      const periodPrefix = schedule.period === 'morning' ? '上午' : '下午';
      rows.push({
        id: readString(schedule.id),
        dateLabel,
        periodLabel: periodPrefix + ' ' + String(schedule.startTime || '').slice(0, 5) + '-' + String(schedule.endTime || '').slice(0, 5),
        statusLabel: schedule.status === 'available' ? '可预约' : '已满',
        statusClass: schedule.status === 'available' ? 'status-available' : 'status-full',
      });
    });

  return rows.slice(0, 4);
}

async function loadSchedulesByStoreIds(doctorId, storeIds, now) {
  const normalizedStoreIds = Array.isArray(storeIds)
    ? storeIds.map((item) => readString(item)).filter(Boolean)
    : [];

  if (!doctorId || !normalizedStoreIds.length) {
    return { schedules: [], loadError: '' };
  }

  const responses = await Promise.allSettled(
    normalizedStoreIds.map((currentStoreId) =>
      api.getSchedules({
        doctorId,
        storeId: currentStoreId,
        startDate: getBeijingDate(now),
        endDate: getBeijingDate(now + 7 * DAY_MS),
      })
    )
  );

  const successful = responses.filter((response) => response.status === 'fulfilled');
  const failed = successful.length < responses.length;
  return {
    schedules: successful.flatMap((response) => unwrapList(response.value)),
    loadError: failed ? (successful.length ? '部分门店排班加载失败，请重试' : '排班加载失败，请重试') : '',
  };
}

Page({
  data: {
    loading: false,
    loadError: '',
    doctorLoaded: false,
    doctorId: '',
    storeId: '',
    doctorName: '',
    doctorTitle: '',
    specialty: '',
    avatarText: '',
    avatarUrl: '',
    avatarLoaded: false,
    heroTags: [],
    experienceNumber: '0',
    consultCountLabel: '0',
    ratingLabel: '0',
    introText: '暂无医生简介',
    expertiseTags: [],
    scheduleRows: [],
    hasFutureSchedules: false,
  },

  onLoad(options) {
    this.options = options || {};
    if (!sessionStore.isLoggedIn()) {
      return;
    }
    this.loadPage();
  },

  async onShow() {
    if (!sessionStore.isLoggedIn()) {
      const { id = '', storeId = '' } = this.options || {};
      navigation.openLogin('/pages/appointment/doctor-detail?id=' + encodeURIComponent(id) +
        (storeId ? '&storeId=' + encodeURIComponent(storeId) : ''));
      return;
    }
    const initialLoadInProgress = !this.hasShown && this.data.loading;
    this.hasShown = true;
    if (!initialLoadInProgress) await this.loadPage();
  },

  onUnload() {
    this.loadRequestId = (this.loadRequestId || 0) + 1;
  },

  async loadPage() {
    const requestId = this.loadRequestId = (this.loadRequestId || 0) + 1;
    const isCurrent = () => requestId === this.loadRequestId;
    const doctorId = readString((this.options && this.options.id) || this.data.doctorId || '');
    const storeId = readString((this.options && this.options.storeId) || this.data.storeId || '');
    this.setData({ loading: true, loadError: '' });
    let doctor;
    try {
      const response = await api.getDoctors(doctorId ? { id: doctorId } : undefined);
      if (!isCurrent()) return;
      doctor = unwrapList(response).find((item) => readString(item.id) === doctorId);
    } catch {
      if (isCurrent()) {
        this.setData({ loading: false, doctorLoaded: false, hasFutureSchedules: false, loadError: '医生资料加载失败，请重试' });
      }
      return;
    }
    if (!doctor) {
      this.setData({ loading: false, doctorLoaded: false, hasFutureSchedules: false, loadError: '未找到医生资料，请重试' });
      return;
    }
    const now = Date.now();
    const { schedules, loadError } = await loadSchedulesByStoreIds(doctorId, storeId ? [storeId] : doctor.storeIds, now);
    if (!isCurrent()) return;
    const expertiseTags = Array.isArray(doctor && doctor.expertise)
      ? doctor.expertise
      : String((doctor && (doctor.expertise || doctor.specialty)) || '')
          .split(/[、,，]/)
          .map((item) => item.trim())
          .filter(Boolean);

    const heroTags = [
      doctor && doctor.experience ? String(doctor.experience) + '年经验' : '',
      doctor && doctor.title ? doctor.title : '',
      doctor && doctor.specialty ? doctor.specialty : '',
    ].filter(Boolean);

    this.setData({
      loading: false,
      loadError,
      doctorLoaded: Boolean(doctor),
      doctorId,
      storeId,
      doctorName: doctor ? doctor.name || '' : '',
      doctorTitle: doctor ? doctor.title || '' : '',
      specialty: doctor ? doctor.specialty || '' : '',
      avatarText: doctor && doctor.name ? doctor.name.slice(0, 1) : '',
      avatarUrl: normalizeImageUrl(doctor && (doctor.avatarUrl || doctor.avatar || doctor.avatar_url || doctor.doctorAvatar || doctor.doctor_avatar)),
      avatarLoaded: false,
      heroTags,
      experienceNumber: String((doctor && doctor.experience) || 0),
      consultCountLabel: String((doctor && doctor.consultCount) || 0),
      ratingLabel: String(Math.round(Number((doctor && doctor.rating) || 0) * 20)),
      introText: (doctor && (doctor.intro || doctor.introduction)) || '暂无医生简介',
      expertiseTags,
      scheduleRows: buildScheduleRows(schedules, now),
      hasFutureSchedules: schedules.some((item) => item.status === 'available'),
    });
  },

  retryLoad() {
    if (!this.data.loading) return this.loadPage();
  },

  handleAvatarLoad() {
    if (this.data.avatarUrl) {
      this.setData({ avatarLoaded: true });
    }
  },

  handleAvatarError() {
    this.setData({ avatarLoaded: false });
  },

  openBooking() {
    if (this.data.loading || !this.data.doctorId || !this.data.hasFutureSchedules) {
      return;
    }

    const url = this.data.storeId
      ? '/pages/appointment/time-select?doctorId=' + this.data.doctorId + '&storeId=' + this.data.storeId
      : '/pages/appointment/store-select?doctorId=' + this.data.doctorId;

    wx.navigateTo({ url });
  },
});
