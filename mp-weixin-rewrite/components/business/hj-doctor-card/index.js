const { normalizeImageUrl } = require('../../../common/utils/image-url');

Component({
  properties: {
    doctor: { type: Object, value: {} },
    showSchedule: { type: Boolean, value: false },
  },
  data: {
    avatarText: '',
    avatarUrl: '',
    avatarLoaded: false,
    titleText: '',
    specialtyText: '',
    experienceText: '',
    expertiseList: [],
    ratingText: '5.0',
    reviewCountText: '',
    consultCountText: '',
  },
  observers: {
    doctor: function syncDoctor(doctor) {
      const record = doctor || {};
      const name = record.name || '';
      const rating = Number(record.rating);
      const reviewCount = Number(record.reviewCount);
      const avatarUrl = normalizeImageUrl(record.avatarUrl || record.avatar || record.avatar_url || record.doctorAvatar || record.doctor_avatar);
      const shouldKeepLoaded = avatarUrl && avatarUrl === this.data.avatarUrl && this.data.avatarLoaded;
      this.setData({
        avatarText: name.slice(0, 1),
        avatarUrl,
        avatarLoaded: shouldKeepLoaded,
        titleText: record.title || '',
        specialtyText: record.specialty || '',
        experienceText: String(record.experience || 0),
        expertiseList: Array.isArray(record.expertise) ? record.expertise.slice(0, 5) : [],
        ratingText: Number.isFinite(rating) && rating > 0 ? String(record.rating) : '5.0',
        reviewCountText: Number.isSafeInteger(reviewCount) && reviewCount > 0 ? String(reviewCount) : '',
        consultCountText: String(record.consultCount || 0),
      });
    },
  },
  methods: {
    handleAvatarLoad() {
      if (this.data.avatarUrl) {
        this.setData({ avatarLoaded: true });
      }
    },
    handleAvatarError() {
      this.setData({ avatarLoaded: false });
    },
    handleTap() {
      this.triggerEvent('click', this.data.doctor);
    },
  },
});
