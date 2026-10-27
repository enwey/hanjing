// Isolated test fixtures. Never imported by application code or shipped in dist.
export const patient = {
  id: '21',
  name: '测试就诊人',
  relation: 'self',
  gender: 'male',
  birthday: '1990-02-03',
  phone: '13800138000',
  idCard: '110***********1234',
  cardNo: 'PC-TEST',
};
export const doctor = {
  id: 11,
  name: '测试医生',
  title: '主治医师',
  specialty: '睡眠医学',
  intro: '仅供隔离自动化测试的医生资料。',
  expertise: ['睡眠评估'],
  storeIds: [9],
  consultFee: 10000,
  avatar: '',
};
export const store = {
  id: 9,
  name: '测试门店',
  address: '测试地址',
  phone: '0755-00000000',
  status: 'open',
  businessHours: '09:00—18:00',
  features: ['睡眠评估'],
  coverUrl: '',
};
export const product = {
  id: 41,
  name: '测试阻鼾器',
  price: 9900,
  originalPrice: 12900,
  stock: 20,
  category: 'device',
  description: '测试商品说明',
  imageUrl: '',
  galleryUrls: [],
};
export const appointment = {
  id: 51,
  appointmentNo: 'PC-APPT-TEST',
  patientId: 21,
  patientName: patient.name,
  storeId: 9,
  storeName: store.name,
  doctorId: 11,
  doctorName: doctor.name,
  scheduleId: 31,
  appointmentDate: '2099-01-01',
  appointmentTime: '09:00-09:30',
  status: 'pending_payment',
  type: 'first',
  symptomDesc: '测试症状',
};
export const post = {
  id: 71,
  title: '测试社区内容',
  content: '真实社区接口结构的隔离测试内容',
  author: '测试作者',
  roleLabel: '鼾友',
  likes: 3,
  commentsCount: 1,
  isLiked: false,
  isFavorited: false,
  comments: [
    {
      id: 72,
      author: '测试回复',
      content: '测试评论',
      likes: 0,
      isLiked: false,
    },
  ],
  createdAt: '2026-10-27',
  tags: ['分享'],
};
export const device = {
  id: '61',
  patientId: '21',
  patientName: patient.name,
  doctorName: doctor.name,
  deviceModel: '测试设备',
  device: { id: '41', name: '测试阻鼾器' },
  status: 'active',
  adjustmentValue: 3,
  diagnosis: '测试诊断',
  treatmentPlan: '测试治疗方案',
  doctorAdvice: '测试医嘱',
  startDate: '2026-10-01',
};
export const order = {
  id: '81',
  orderNo: 'PC-ORDER-TEST',
  status: 'pending',
  payAmount: 9900,
  totalAmount: 9900,
  discountAmount: 0,
  items: [
    {
      id: '82',
      productId: '41',
      productName: product.name,
      price: 9900,
      quantity: 1,
    },
  ],
  shippingAddress: {
    contactName: patient.name,
    phone: patient.phone,
    detailAddress: '测试地址',
  },
  createdAt: '2026-10-27',
};
export const assessments = [
  {
    id: 'asmt-1',
    type: 'ess',
    patientId: '21',
    essScore: 5,
    essLevel: 'normal',
    recommendation: '测试建议',
    createdAt: '2026-10-27',
  },
  {
    id: 'snore-1',
    type: 'ai_snore',
    patientId: '21',
    snoreAnalysis: {
      duration: 60,
      avgDecibel: 42,
      peakDecibel: 65,
      snoreRate: 25,
      riskScore: 25,
      analysisVersion: 1,
    },
    createdAt: '2026-10-27',
  },
];
export const fixtures = {
  '/stores': [store],
  '/doctors': [doctor],
  '/schedules': [
    {
      id: 31,
      date: '2099-01-01',
      startTime: '09:00:00',
      endTime: '10:00:00',
      status: 'available',
      doctorId: 11,
      storeId: 9,
    },
  ],
  '/schedules/31/slots': [
    { id: 1, scheduleId: 31, label: '09:00-09:30', status: 'available' },
    { id: 2, scheduleId: 31, label: '09:30-10:00', status: 'booked' },
  ],
  '/appointments': [appointment],
  '/appointments/51': {
    appointment,
    doctor,
    store,
    medicalRecord: { diagnosis: '测试诊断', prescription: '测试处方' },
  },
  '/products': { list: [product] },
  '/products/41': product,
  '/product-categories': [{ code: 'device', name: '阻鼾器' }],
  '/orders': [order],
  '/orders/81': order,
  '/community/posts': [{ ...post, comments: 1 }],
  '/community/posts/71': post,
  '/user/profile': {
    id: 21,
    nickname: patient.name,
    phone: patient.phone,
    birthday: patient.birthday,
    gender: 'male',
    memberLevelTitle: '普通会员',
  },
  '/user/family-members': { list: [patient] },
  '/user/family-members/21': patient,
  '/user/account-security': { hasPassword: true },
  '/user/notifications': {
    list: [
      { id: '1', title: '测试消息', content: '测试消息内容', isRead: false },
    ],
  },
  '/user/member-info': { memberLevel: 'normal', points: 100, totalSpent: 9900 },
  '/user/member-levels': [
    {
      level: 'normal',
      title: '普通会员',
      spentRequired: 0,
      benefits: [{ title: '在线预约', desc: '预约睡眠门诊' }],
    },
  ],
  '/user/coupons': {
    list: [{ id: '1', title: '测试优惠券', minSpend: 1000, status: 'active' }],
  },
  '/user/coupons/available': {
    list: [{ id: '2', title: '可兑换券', pointsCost: 100, minSpend: 1000 }],
  },
  '/user/medical-records': {
    list: [
      {
        id: 91,
        patientId: 21,
        patientName: patient.name,
        doctorName: doctor.name,
        storeName: store.name,
        visitDate: '2026-10-27',
        diagnosis: '测试诊断',
        prescription: '测试处方',
        doctorAdvice: '测试医嘱',
        attachments: [],
      },
    ],
  },
  '/assessments': assessments,
  '/assessments/ess-questions': Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    situation: '测试情景 ' + (i + 1),
    hint: '按近期情况选择',
  })),
  '/treatment/records': { list: [device] },
  '/treatment/record': device,
  '/treatment/sleep-report': {
    hasData: true,
    weekAvg: 6.5,
    compliance: 85,
    avgPainScore: 2,
    streak: 5,
  },
  '/treatment/timeline': [
    { date: '2026-10-01', title: '测试治疗', description: '治疗记录' },
  ],
  '/treatment/wearing-records': [
    { date: '2026-10-27', wearDuration: 6, comfort: 4, painScore: 2 },
  ],
  '/treatment/adjustments': [
    { date: '2026-10-27', value: 3, note: '测试调整', doctor: doctor.name },
  ],
  '/treatment/device-maintenance': {
    list: [
      { date: '2026-10-27', type: '清洁', description: '测试维护', cost: 0 },
    ],
  },
  '/treatment/device-feedback': {
    list: [{ date: '2026-10-27', content: '测试反馈', reply: '测试回复' }],
  },
  '/im/messages': [
    {
      id: 1,
      sender: 'doctor',
      senderName: '测试客服',
      text: '您好，请问有什么需要帮助？',
      time: '09:00',
    },
  ],
  '/distribution/info': {
    inviteCode: 'TEST',
    inviteQrCode: '',
    availableCommission: 10000,
    totalCommission: 12000,
    frozenCommission: 2000,
    withdrawnAmount: 0,
    minWithdrawAmount: 100,
    withdrawFeeRates: { bank: 0.01 },
  },
  '/distribution/team': {
    list: [
      {
        id: 2,
        nickname: '测试成员',
        joinedAt: '2026-10-27',
        statusText: '已预约',
      },
    ],
  },
  '/distribution/commissions': {
    list: [{ id: 1, orderNo: 'TEST', commission: 500, status: 'pending' }],
  },
  '/distribution/withdraws': {
    list: [{ id: 1, amount: 100, status: 'pending' }],
  },
  '/live/rooms': {
    list: [
      {
        id: 1,
        title: '测试直播',
        description: '测试科普',
        anchorName: '测试医生',
        status: 'upcoming',
        startTime: '2026-10-27',
      },
    ],
  },
  '/live/rooms/1': {
    id: 1,
    title: '测试直播',
    description: '测试科普',
    anchorName: '测试医生',
    status: 'upcoming',
    startTime: '2026-10-27',
    replayUrl: '',
  },
};
export function fixture(path) {
  const key = path.split('?')[0];
  if (!(key in fixtures)) throw new Error('Unmocked API ' + path);
  return structuredClone(fixtures[key]);
}
export const routeParams = {
  doctors: { id: 11, storeId: 9 },
  booking: { storeId: 9, doctorId: 11 },
  appointment: { id: 51 },
  post: { id: 71 },
  product: { id: 41 },
  checkout: { id: 41 },
  order: { id: 81 },
  member: { id: 21 },
  device: { id: 61, patientId: 21 },
  report: { id: 'asmt-1', patientId: 21 },
  room: { id: 1 },
};
