const api = require('../../api/index');
const navigation = require('../../common/utils/navigation');

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

function getDateText(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

function buildScheduleRows(schedules) {
  const rows = [];
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const todayText = getDateText(0);
  const tomorrowText = getDateText(1);

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

Page({
  data: {
    doctorLoaded: false,
    doctorId: '',
    storeId: '',
    doctorName: '',
    doctorTitle: '',
    specialty: '',
    avatarText: '',
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
  },

  async onShow() {
    const token = wx.getStorageSync('access_token');
    if (!token) {
      navigation.openPage('/pages/auth/login');
      return;
    }
    await this.loadPage();
  },

  async loadPage() {
    const doctorId = readString((this.options && this.options.id) || '');
    const storeId = readString((this.options && this.options.storeId) || '');

    const [doctorsResponse, schedulesResponse] = await Promise.all([
      api.getDoctors(doctorId ? { id: doctorId } : undefined),
      doctorId
        ? api.getSchedules({
            doctorId,
            storeId: storeId || undefined,
            startDate: getDateText(0),
            endDate: getDateText(7),
          })
        : Promise.resolve([]),
    ]);

    const doctor = unwrapList(doctorsResponse).find((item) => readString(item.id) === doctorId) || null;
    const schedules = unwrapList(schedulesResponse);
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
      doctorLoaded: Boolean(doctor),
      doctorId,
      storeId,
      doctorName: doctor ? doctor.name || '' : '',
      doctorTitle: doctor ? doctor.title || '' : '',
      specialty: doctor ? doctor.specialty || '' : '',
      avatarText: doctor && doctor.name ? doctor.name.slice(0, 1) : '',
      heroTags,
      experienceNumber: String((doctor && doctor.experience) || 0),
      consultCountLabel: String((doctor && doctor.consultCount) || 0),
      ratingLabel: String(Math.round(Number((doctor && doctor.rating) || 0) * 20)),
      introText: (doctor && (doctor.intro || doctor.introduction)) || '暂无医生简介',
      expertiseTags,
      scheduleRows: buildScheduleRows(schedules),
      hasFutureSchedules: schedules.some((item) => item.status === 'available'),
    });
  },

  openBooking() {
    if (!this.data.doctorId || !this.data.hasFutureSchedules) {
      return;
    }

    const url = this.data.storeId
      ? '/pages/appointment/time-select?doctorId=' + this.data.doctorId + '&storeId=' + this.data.storeId
      : '/pages/appointment/store-select?doctorId=' + this.data.doctorId;

    wx.navigateTo({ url });
  },
});
