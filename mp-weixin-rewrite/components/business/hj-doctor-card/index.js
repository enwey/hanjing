Component({
  properties: {
    doctor: { type: Object, value: {} },
    showSchedule: { type: Boolean, value: false },
  },
  data: {
    avatarText: '',
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
      this.setData({
        avatarText: name.slice(0, 1),
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
    handleTap() {
      this.triggerEvent('click', this.data.doctor);
    },
  },
});
