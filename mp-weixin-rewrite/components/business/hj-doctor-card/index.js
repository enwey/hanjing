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
    ratingText: '',
    reviewCountText: '',
    consultCountText: '',
  },
  observers: {
    doctor: function syncDoctor(doctor) {
      const record = doctor || {};
      const name = record.name || '';
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
        ratingText: String(record.rating || '0'),
        reviewCountText: String(record.reviewCount || 0),
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
