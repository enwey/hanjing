<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import PatientCreateDialog from '@/components/PatientCreateDialog.vue'

const router = useRouter()

const getTodayDateString = () => {
  const nowInShanghai = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }))
  const y = nowInShanghai.getFullYear()
  const m = String(nowInShanghai.getMonth() + 1).padStart(2, '0')
  const d = String(nowInShanghai.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getAvatarColor = (name: string) => {
  if (!name) return '#3B6BF5'
  const colors = ['#3B6BF5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

interface QueueItem {
  id: string;
  patientId: string;
  no: string;
  patientName: string;
  phone: string;
  doctorName: string;
  doctorId: string;
  storeName: string;
  timeSlot: string;
  symptom: string;
  status: string; // pending, confirmed (waiting/arrived), completed (done)
  pre_exam?: {
    height?: number;
    weight?: number;
    systolic_bp?: number;
    diastolic_bp?: number;
    neck_circumference?: number;
    bmi?: number;
  };
  gender?: string;
  age?: number;
  type?: string;
  source?: string;
  consultFee?: number;
  depositAmount?: number;
  originalIndex?: number;
  postponeCount?: number;
  storeId?: string;
}

const appointments = ref<QueueItem[]>([])
const doctorsList = ref<any[]>([])
const selectedDoctorId = ref<string>(localStorage.getItem('workbench_selected_doctor_id') || '')
const loading = ref(false)
const activeTimeSlot = ref(localStorage.getItem('workbench_active_time_slot') || 'all')
const rightPaneTab = ref('waiting') // waiting, completed

const storeList = ref<any[]>([])
const selectedStoreId = ref<string>(localStorage.getItem('workbench_selected_store_id') || 'all')

const fetchStores = async () => {
  try {
    const res: any = await request.get('/api/admin/stores')
    if (res.code === 200) {
      storeList.value = res.data
    }
  } catch (error) {
    console.error('获取门店数据失败:', error)
  }
}

// Fetch all doctors to populate selector
const fetchDoctors = async () => {
  try {
    const url = selectedStoreId.value === 'all'
      ? '/api/admin/doctors'
      : `/api/admin/doctors?store_id=${selectedStoreId.value}`
    const res: any = await request.get(url)
    if (res.code === 200) {
      doctorsList.value = res.data
      if (doctorsList.value.length > 0) {
        const exists = doctorsList.value.some(d => d.id.toString() === selectedDoctorId.value)
        if (!exists) {
          selectedDoctorId.value = doctorsList.value[0].id.toString()
        }
      } else {
        selectedDoctorId.value = ''
      }
    }
  } catch (error) {
    console.error('获取医生数据失败:', error)
  }
}

watch(selectedStoreId, async (newVal) => {
  localStorage.setItem('workbench_selected_store_id', newVal)
  activeTimeSlot.value = 'all'
  await fetchDoctors()
})

watch(selectedDoctorId, (newVal) => {
  localStorage.setItem('workbench_selected_doctor_id', newVal)
})

watch(activeTimeSlot, (newVal) => {
  localStorage.setItem('workbench_active_time_slot', newVal)
})

// Fetch queue appointments
const fetchAppointments = async (isSilent = false) => {
  if (!isSilent) loading.value = true
  try {
    const todayStr = getTodayDateString()
    const res: any = await request.get(`/api/admin/appointments?date=${todayStr}`)
    const mapped = res.data.map((item: any, index: number) => ({
      id: item.id.toString(),
      patientId: item.patient_id.toString(),
      no: item.appointment_no,
      patientName: item.patient_name,
      phone: item.patient_phone,
      doctorName: item.doctor_name,
      doctorId: item.doctor_id.toString(),
      storeName: item.store_name,
      storeId: item.store_id.toString(),
      timeSlot: item.appointment_time,
      symptom: item.symptom_desc || '无主诉描述',
      status: item.status,
      pre_exam: item.pre_exam || null,
      gender: item.patient_gender === 1 ? '男' : '女',
      age: item.patient_age,
      type: item.type === 'first' ? '初诊' : '复诊',
      source: item.source === 'mini_app' ? '小程序' : item.source === 'telephone' ? '电话' : '现场',
      consultFee: item.consult_fee || 0,
      depositAmount: item.deposit_amount || 0,
      originalIndex: index,
      postponeCount: item.postpone_count || 0
    }))

    // For each appointment, fetch its pre-exam vitals if confirmed, checked_in or completed
    for (const appt of mapped) {
      if (appt.status === 'confirmed' || appt.status === 'called' || appt.status === 'checked_in' || appt.status === 'completed') {
        try {
          const preRes: any = await request.get(`/api/admin/appointments/${appt.id}`)
          if (preRes.code === 200 && preRes.data) {
            if (preRes.data.pre_exam) {
              appt.pre_exam = preRes.data.pre_exam
            }
            appt.medicalHistory = preRes.data.patient_medical_history
            appt.allergyHistory = preRes.data.patient_allergy_history
          }
        } catch (e) {
          // ignore
        }
      }
    }
    appointments.value = mapped
  } catch (error) {
    console.error(error)
    if (!isSilent) MessagePlugin.error('获取排队队列数据失败')
  } finally {
    if (!isSilent) loading.value = false
  }
}

const navigateToCreateAppointment = () => {
  const query: any = {}
  if (selectedStoreId.value && selectedStoreId.value !== 'all') {
    query.store_id = selectedStoreId.value
  }
  if (selectedDoctorId.value) {
    query.doctor_id = selectedDoctorId.value
  }
  router.push({ path: '/appointment/create', query })
}

let timerId: any = null

onMounted(async () => {
  await fetchStores()
  await fetchDoctors()
  await fetchAppointments()
  timerId = setInterval(() => {
    fetchAppointments(true)
  }, 5000)
})

onUnmounted(() => {
  if (timerId) {
    clearInterval(timerId)
    timerId = null
  }
})

// Current selected doctor object
const currentDoctor = computed(() => {
  return doctorsList.value.find(d => d.id.toString() === selectedDoctorId.value) || null
})

// Current store name
const currentStoreName = computed(() => {
  const found = appointments.value.find(a => a.doctorId === selectedDoctorId.value)
  return found ? found.storeName : '龙岗总店'
})

// Extract all unique time slots for filtering
const uniqueTimeSlots = computed(() => {
  const slots = new Set<string>()
  appointments.value.forEach(item => {
    if (item.doctorId === selectedDoctorId.value && !['completed', 'checked_in', 'pending_payment', 'cancelled', 'no_show'].includes(item.status) && item.timeSlot) {
      if (selectedStoreId.value === 'all' || item.storeId === selectedStoreId.value) {
        slots.add(item.timeSlot)
      }
    }
  })
  return Array.from(slots).sort()
})

const allWaitingItems = computed(() => {
  return appointments.value.filter(item => 
    item.doctorId === selectedDoctorId.value && 
    !['completed', 'checked_in', 'pending_payment', 'cancelled', 'no_show'].includes(item.status) &&
    (selectedStoreId.value === 'all' || item.storeId === selectedStoreId.value)
  )
})

function getSlotCount(slot: string) {
  return allWaitingItems.value.filter(item => item.timeSlot === slot).length
}

function getBadgeStyle(isActive: boolean) {
  return {
    opacity: isActive ? '0.9' : '0.6',
    fontSize: '11px',
    fontWeight: '500',
    background: isActive ? 'rgba(255, 255, 255, 0.25)' : '#F3F4F6',
    color: isActive ? '#FFF' : '#6B7280',
    padding: '1px 5px',
    borderRadius: '10px',
    display: 'inline-block',
    lineHeight: '1.2',
    marginLeft: '6px'
  }
}

// Doctor's active treating patient (last checked_in patient)
const currentPatient = computed(() => {
  return appointments.value.find(item => 
    item.doctorId === selectedDoctorId.value && 
    item.status === 'checked_in' &&
    (selectedStoreId.value === 'all' || item.storeId === selectedStoreId.value)
  ) || null
})

// Doctor's waiting queue (excluding the active currentPatient)
const waitingQueue = computed(() => {
  const list = appointments.value.filter(item => {
    if (item.doctorId !== selectedDoctorId.value) return false
    if (['completed', 'checked_in', 'pending_payment', 'cancelled', 'no_show'].includes(item.status)) return false
    if (selectedStoreId.value !== 'all' && item.storeId !== selectedStoreId.value) return false
    return true
  })
  
  // Sort list based on database postpone Count and originalIndex
  list.sort((a, b) => {
    const aPostpone = a.postponeCount || 0
    const bPostpone = b.postponeCount || 0
    if (aPostpone !== bPostpone) {
      return aPostpone - bPostpone
    }
    const aIndex = a.originalIndex !== undefined ? a.originalIndex : 999999
    const bIndex = b.originalIndex !== undefined ? b.originalIndex : 999999
    return aIndex - bIndex
  })
  
  if (activeTimeSlot.value !== 'all') {
    return list.filter(item => item.timeSlot === activeTimeSlot.value)
  }
  return list
})

// Doctor's completed queue for today
const completedQueue = computed(() => {
  return appointments.value.filter(item => 
    item.doctorId === selectedDoctorId.value && 
    item.status === 'completed' &&
    (selectedStoreId.value === 'all' || item.storeId === selectedStoreId.value)
  )
})

// Call patient voice broadcast
const callPatient = (patientName: string, doctorName: string) => {
  if ('speechSynthesis' in window) {
    const text = `请患者 ${patientName}，到 ${doctorName} 医生诊室就诊。`
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
    MessagePlugin.success(`呼叫广播成功: "${text}"`)
  } else {
    MessagePlugin.warning('浏览器不支持语音播报，已通过系统弹窗提示')
  }
}

const checkInVisible = ref(false)
const selectedQueueItem = ref<QueueItem | null>(null)
const checkInForm = ref({
  height: '',
  weight: '',
  systolicBp: '',
  diastolicBp: '',
  neckCircumference: ''
})

const computedBmi = computed(() => {
  const h = parseFloat(checkInForm.value.height)
  const w = parseFloat(checkInForm.value.weight)
  if (h && w) {
    return (w / ((h / 100) * (h / 100))).toFixed(1)
  }
  return ''
})

const openCheckInDialog = async (item: QueueItem) => {
  selectedQueueItem.value = item
  checkInForm.value = {
    height: '',
    weight: '',
    systolicBp: '',
    diastolicBp: '',
    neckCircumference: ''
  }
  try {
    const res: any = await request.get(`/api/admin/appointments/${item.id}/pre-exam`)
    if (res.code === 200 && res.data) {
      checkInForm.value = {
        height: res.data.height !== null && res.data.height !== undefined ? String(res.data.height) : '',
        weight: res.data.weight !== null && res.data.weight !== undefined ? String(res.data.weight) : '',
        systolicBp: res.data.systolic_bp !== null && res.data.systolic_bp !== undefined ? String(res.data.systolic_bp) : '',
        diastolicBp: res.data.diastolic_bp !== null && res.data.diastolic_bp !== undefined ? String(res.data.diastolic_bp) : '',
        neckCircumference: res.data.neck_circumference !== null && res.data.neck_circumference !== undefined ? String(res.data.neck_circumference) : ''
      }
    }
  } catch (error) {
    console.error(error)
  }
  checkInVisible.value = true
}

const closeCheckInDialog = () => {
  checkInVisible.value = false
  selectedQueueItem.value = null
}

async function handleCheckInSkip() {
  if (!selectedQueueItem.value) return
  try {
    await request.put(`/api/admin/appointments/${selectedQueueItem.value.id}`, { status: 'confirmed' })
    MessagePlugin.success(`患者 ${selectedQueueItem.value.patientName} 签到成功（已跳过体征录入）`)
    checkInVisible.value = false
    await fetchAppointments()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('签到失败')
  }
}

async function handleCheckInSubmit() {
  if (!selectedQueueItem.value) return
  const { height, weight, systolicBp, diastolicBp, neckCircumference } = checkInForm.value
  if (!height || !weight) {
    MessagePlugin.warning('请填写身高和体重')
    return
  }
  try {
    await request.post(`/api/admin/appointments/${selectedQueueItem.value.id}/pre-exam`, {
      height: parseFloat(height),
      weight: parseFloat(weight),
      systolicBp: systolicBp ? parseInt(systolicBp) : null,
      diastolicBp: diastolicBp ? parseInt(diastolicBp) : null,
      neckCircumference: neckCircumference ? parseFloat(neckCircumference) : null,
      bmi: computedBmi.value ? parseFloat(computedBmi.value) : null
    })
    await request.put(`/api/admin/appointments/${selectedQueueItem.value.id}`, { status: 'confirmed' })
    MessagePlugin.success(`患者 ${selectedQueueItem.value.patientName} 签到与预检体征录入成功`)
    checkInVisible.value = false
    await fetchAppointments()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('签到保存失败')
  }
}

// Click '叫号' button: voice broadcast only, update status to 'called'
const triggerCallOnly = async (item: QueueItem) => {
  // Voice call broadcast
  callPatient(item.patientName, item.doctorName)

  try {
    // Update status to 'called' in backend
    await request.put(`/api/admin/appointments/${item.id}`, { status: 'called' })
    MessagePlugin.success(`已成功呼叫并语音播报患者 [${item.patientName}]`)
    fetchAppointments()
  } catch (error) {
    console.error('叫号状态更新失败:', error)
    MessagePlugin.error('叫号失败')
  }
}

// Click '接诊' button: move to room, update status to 'checked_in'
const triggerConsultOnly = async (item: QueueItem) => {
  try {
    // If there is already a checked_in patient, change their status back to 'confirmed'
    const prevCheckedIn = appointments.value.find(
      a => a.doctorId === selectedDoctorId.value && a.status === 'checked_in' && a.id !== item.id
    )
    if (prevCheckedIn) {
      await request.put(`/api/admin/appointments/${prevCheckedIn.id}`, { status: 'confirmed' })
    }

    // Update status to checked_in (就诊中)
    await request.put(`/api/admin/appointments/${item.id}`, { status: 'checked_in' })
    MessagePlugin.success(`已接诊患者 [${item.patientName}]，进入诊室`)
    fetchAppointments()
  } catch (error) {
    console.error('接诊状态更新失败:', error)
    MessagePlugin.error('接诊失败')
  }
}

// Move patient down the queue (顺延)
const delayPatient = (item: QueueItem) => {
  const index = appointments.value.findIndex(a => a.id === item.id)
  if (index !== -1) {
    const [moved] = appointments.value.splice(index, 1)
    appointments.value.push(moved)
    MessagePlugin.success(`已将 ${item.patientName} 的就诊顺序顺延至末尾`)
  }
}

// Complete treatment & billing dialog states
const checkoutVisible = ref(false)
const checkoutLoading = ref(false)
const checkoutSuccess = ref(false)
const orderResult = ref<any>(null)

const deliveryType = ref<string>('offline_direct')
const shippingReceiver = ref<string>('')
const shippingPhone = ref<string>('')
const shippingAddressStr = ref<string>('')

const productOptions = [
  { id: '1', name: '定制式可调舌型阻鼾器 HJ-MAD-03', price: 298000 },
  { id: '2', name: '鼾静阻鼾器专用清洁泡腾片 (60片/盒)', price: 4900 },
  { id: '3', name: '鼾静智能阻鼾舒眠记忆枕', price: 29900 },
  { id: '4', name: '诊所首诊挂号门诊费', price: 20000 },
  { id: '5', name: '诊所专家诊断评估费', price: 50000 },
  { id: '7', name: '快递运费', price: 1500 },
  { id: '8', name: '就诊预约定金', price: 20000 }
]

const billingItems = ref<Array<{ product_id: string; product_name: string; price: number; quantity: number }>>([])
const discountAmount = ref<number>(3000)
const payMethod = ref<string>('wechat')

const totalAmount = computed(() => {
  return billingItems.value.reduce((sum, item) => sum + (item.price * item.quantity), 0)
})

const payableAmount = computed(() => {
  const diff = totalAmount.value - discountAmount.value
  return diff > 0 ? diff : 0
})

function openCheckoutDialog(item: QueueItem) {
  selectedQueueItem.value = item
  billingItems.value = [
    { product_id: '4', product_name: '诊所首诊挂号门诊费', price: 20000, quantity: 1 }
  ]
  discountAmount.value = 3000
  payMethod.value = 'wechat'
  checkoutSuccess.value = false
  orderResult.value = null
  
  deliveryType.value = 'offline_direct'
  shippingReceiver.value = ''
  shippingPhone.value = ''
  shippingAddressStr.value = ''
  
  checkoutVisible.value = true
}

function closeCheckoutDialog() {
  checkoutVisible.value = false
  selectedQueueItem.value = null
}

const addBillingItem = () => {
  billingItems.value.push({ product_id: '1', product_name: '定制式可调舌型阻鼾器 HJ-MAD-03', price: 298000, quantity: 1 })
}

const removeBillingItem = (idx: number) => {
  billingItems.value.splice(idx, 1)
}

function onProductChange(idx: number, prodId: string) {
  const prod = productOptions.find(p => p.id === prodId)
  if (prod) {
    billingItems.value[idx].product_name = prod.name
    billingItems.value[idx].price = prod.price
  }
}

watch(deliveryType, (newVal) => {
  if (newVal === 'online') {
    const exists = billingItems.value.some(item => item.product_id === '7')
    if (!exists) {
      billingItems.value.push({ product_id: '7', product_name: '快递运费', price: 1500, quantity: 1 })
    }
  } else {
    const idx = billingItems.value.findIndex(item => item.product_id === '7')
    if (idx !== -1) {
      billingItems.value.splice(idx, 1)
    }
  }
})

const patientDiagnostics = ref<any>(null)
watch(currentPatient, async (newVal) => {
  if (newVal) {
    try {
      const res: any = await request.get(`/api/admin/patients/${newVal.patientId}/sleep-diagnostics`)
      if (res.code === 200) {
        patientDiagnostics.value = res.data
      }
    } catch (e) {
      patientDiagnostics.value = null
    }
  } else {
    patientDiagnostics.value = null
  }
}, { immediate: true })

async function submitCheckout() {
  if (!selectedQueueItem.value) return
  if (billingItems.value.length === 0) {
    MessagePlugin.warning('结账明细不能为空')
    return
  }
  if (deliveryType.value !== 'offline_direct') {
    if (!shippingReceiver.value || !shippingReceiver.value.trim()) {
      MessagePlugin.warning('请填写联系人/收件人姓名')
      return
    }
    if (!shippingPhone.value || !shippingPhone.value.trim()) {
      MessagePlugin.warning('请填写联系电话')
      return
    }
    if (!/^1\d{10}$/.test(shippingPhone.value.trim())) {
      MessagePlugin.warning('请输入有效的11位手机号码')
      return
    }
  }
  if (deliveryType.value === 'online' && (!shippingAddressStr.value || !shippingAddressStr.value.trim())) {
    MessagePlugin.warning('请填写详细收货地址')
    return
  }
  checkoutLoading.value = true
  try {
    let orderType = 'offline'
    let orderStatus = 'paid'
    let shipAddr = null

    if (deliveryType.value === 'online') {
      orderType = 'online'
      orderStatus = 'shipping'
      shipAddr = {
        receiver: shippingReceiver.value,
        phone: shippingPhone.value,
        province: '广东省',
        city: '深圳市',
        district: '快递邮寄',
        detail: shippingAddressStr.value,
        deliveryMethod: 'online'
      }
    } else if (deliveryType.value === 'offline_pending') {
      orderType = 'offline'
      orderStatus = 'processing'
      shipAddr = {
        receiver: shippingReceiver.value,
        phone: shippingPhone.value,
        province: '广东省',
        city: '深圳市',
        district: '门店自提',
        detail: '缺货登记（待货通知自提）',
        deliveryMethod: 'pickup_pending'
      }
    } else {
      orderType = 'offline'
      orderStatus = 'paid'
      shipAddr = {
        receiver: shippingReceiver.value || '到店客户',
        phone: shippingPhone.value || '--',
        province: '广东省',
        city: '深圳市',
        district: '到店自提',
        detail: '到店自提',
        deliveryMethod: 'pickup'
      }
    }

    const payload = {
      patient_id: parseInt(selectedQueueItem.value.patientId, 10),
      items: billingItems.value,
      pay_amount: payableAmount.value,
      discount_amount: discountAmount.value,
      pay_method: payMethod.value,
      type: orderType,
      status: orderStatus,
      shipping_address: shipAddr
    }
    const res: any = await request.post('/api/admin/orders', payload)
    if (res.code === 200) {
      checkoutSuccess.value = true
      orderResult.value = {
        orderNo: res.data.order_no,
        amount: payableAmount.value / 100,
        time: new Date().toLocaleString()
      }
      MessagePlugin.success('门诊费用结算收银成功！')
      await fetchAppointments()
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('结算收费失败')
  } finally {
    checkoutLoading.value = false
  }
}

function handlePrintInvoice() {
  MessagePlugin.success('已发送打印指令，正在打印交易凭证小票...')
}

function goToEmr(item: QueueItem) {
  router.push(`/appointment/emr/${item.id}`)
}

// Walk-in Registration states & actions
const createApptVisible = ref(false)
const apptSearchQuery = ref('')
const apptSelectedPatient = ref<any>(null)
const apptStore = ref('鼾静健康·龙岗总店')
const apptDate = ref(getTodayDateString())
const apptSlot = ref('09:00 - 09:30')
const apptVisitType = ref('复诊')
const apptRemarks = ref('')
const apptPatientCreateVisible = ref(false)

function openCreateApptDialog() {
  apptSearchQuery.value = ''
  apptSelectedPatient.value = null
  apptDate.value = new Date().toISOString().split('T')[0]
  apptSlot.value = '09:00 - 09:30'
  apptVisitType.value = '复诊'
  apptRemarks.value = ''
  createApptVisible.value = true
}

async function handleApptSearch() {
  const q = apptSearchQuery.value.trim()
  if (!q) {
    MessagePlugin.warning('请输入搜索关键词')
    return
  }
  try {
    const res: any = await request.get(`/api/admin/patients?search=${q}`)
    if (res.data && res.data.length > 0) {
      apptSelectedPatient.value = res.data[0]
      MessagePlugin.success(`已匹配患者: ${apptSelectedPatient.value.name}`)
    } else {
      MessagePlugin.info('未找到匹配患者，可点击下方“新患者建档”')
    }
  } catch (e) {
    console.error(e)
  }
}

function handleApptNewPatient() {
  apptPatientCreateVisible.value = true
}

function handleApptPatientCreated(newP: any) {
  apptSelectedPatient.value = {
    id: newP.id,
    name: newP.name,
    phone: newP.phone,
    gender: newP.gender === '男' ? 1 : 2,
    age: newP.age
  }
  MessagePlugin.success(`新患者 ${newP.name} 建档并选择成功`)
}

async function submitCreateAppt() {
  if (!apptSelectedPatient.value) {
    MessagePlugin.warning('请选择就诊患者')
    return
  }
  if (!selectedDoctorId.value) {
    MessagePlugin.warning('请选择接诊医生')
    return
  }
  try {
    const slotTime = apptSlot.value.replace(/\s+/g, '') // e.g. "09:00-09:30"
    const slotHour = parseInt(slotTime.split(':')[0], 10)
    const period = slotHour < 12 ? 'morning' : 'afternoon'
    const scheduleRes: any = await request.get('/api/admin/schedules', {
      params: {
        doctor_id: selectedDoctorId.value,
        date: apptDate.value
      }
    })
    const schedule = (scheduleRes.data || []).find((item: any) => item.period === period)
    if (!schedule) {
      MessagePlugin.warning('该医生当天没有对应时段排班，不能现场挂号')
      return
    }
    const payload = {
      patient_id: parseInt(apptSelectedPatient.value.id, 10),
      store_id: schedule.store_id,
      doctor_id: parseInt(selectedDoctorId.value, 10),
      date: apptDate.value,
      period,
      time: slotTime,
      type: apptVisitType.value === '复诊' ? 'followup' : 'first',
      symptom_desc: apptRemarks.value
    }
    await request.post('/api/admin/appointments', payload)
    MessagePlugin.success('现场挂号及排队登记成功！')
    createApptVisible.value = false
    await fetchAppointments()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('挂号登记失败')
  }
}
</script>

<template>
  <div class="page-container">
    <!-- Header Selector Bar -->
    <div class="page-title-row">
      <div>
        <div class="page-title">医生专属接诊工作台</div>
        <div class="page-title-sub">独立诊室呼叫、体征查阅、病历处方录入与费用结算</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-outline" @click="fetchAppointments" :disabled="loading">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>刷新队列
        </button>
        <button class="btn btn-primary" @click="navigateToCreateAppointment">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>新建预约
        </button>
      </div>
    </div>

    <!-- Doctor selector workbench bar -->
    <div class="panel">
      <div class="doctor-selector-bar" style="display: flex; justify-content: flex-end; align-items: center; gap: 16px; flex-wrap: wrap;">
        <!-- Store Selector -->
        <div class="selector-left" style="display: flex; align-items: center; gap: 8px;">
          <span class="selector-lbl">接诊门店：</span>
          <select v-model="selectedStoreId" class="selector-dropdown" @change="activeTimeSlot = 'all'">
            <option value="all">全部门店</option>
            <option v-for="s in storeList" :key="s.id" :value="s.id.toString()">
              {{ s.name }}
            </option>
          </select>
        </div>

        <!-- Doctor Selector -->
        <div class="selector-left" style="display: flex; align-items: center; gap: 8px;">
          <span class="selector-lbl">当前接诊诊室：</span>
          <select v-model="selectedDoctorId" class="selector-dropdown" @change="activeTimeSlot = 'all'">
            <option v-for="d in doctorsList" :key="d.id" :value="d.id.toString()">
              {{ d.name }} · {{ d.title }} ({{ d.specialty }})
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Main Workspace Layout -->
    <div class="workbench-layout">
      <!-- Left Panel: Currently Treating Patient -->
      <div class="workbench-left panel">
        <div class="pane-header">
          <div class="pane-title" style="display: flex; align-items: center; gap: 6px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <span>当前诊室就诊中</span>
          </div>
          <span v-if="currentPatient" class="status-tag green">就诊中</span>
          <span v-else class="status-tag gray">空闲</span>
        </div>

        <div v-if="currentPatient" class="active-patient-card">
          <!-- Vitals Header -->
          <div class="patient-main-info" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <t-avatar size="50px" :style="{ background: getAvatarColor(currentPatient.patientName), fontSize:'20px', fontWeight: '700', color: '#FFF' }">
                {{ currentPatient.patientName.slice(0, 1) }}
              </t-avatar>
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="active-pat-name">{{ currentPatient.patientName }}</span>
                  <span style="font-size: 11px; color: #3B82F6; background: #EFF6FF; padding: 1px 6px; border-radius: 4px; font-weight: 600; line-height: 1.4;">{{ currentPatient.gender }}</span>
                  <span style="font-size: 11px; color: #3B82F6; background: #EFF6FF; padding: 1px 6px; border-radius: 4px; font-weight: 600; line-height: 1.4;">{{ currentPatient.age }}岁</span>
                  <span style="font-size: 11px; color: #D97706; background: #FFF3E0; padding: 1px 6px; border-radius: 4px; font-weight: 600; line-height: 1.4;">{{ currentPatient.type }}</span>
                </div>
                <div style="font-size: 13px; color: #6B7280; margin-top: 4px;">
                  {{ currentPatient.timeSlot }} 预约挂号 · {{ currentPatient.phone }}
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 8px; flex-shrink: 0;">
              <t-button size="extra-small" theme="primary" variant="outline" @click="goToEmr(currentPatient)">
                开始看诊
              </t-button>
              <t-button size="extra-small" theme="warning" variant="outline" @click="openCheckoutDialog(currentPatient)">
                划扣收费
              </t-button>
              <t-button size="extra-small" theme="default" variant="outline" @click="callPatient(currentPatient.patientName, currentPatient.doctorName)">
                叫号
              </t-button>
            </div>
          </div>

          <!-- Pre-exam Vitals -->
          <div class="vitals-section">
            <div class="section-sub-title" style="display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4.8 3h14.4"></path>
                <path d="M4.8 3v4.8c0 4.8 7.2 4.8 7.2 9.6v1.8"></path>
                <path d="M19.2 3v4.8c0 3.6-3.6 4.8-4.8 6.4"></path>
                <circle cx="12" cy="21" r="2"></circle>
              </svg>
              <span>预检体征数据 (由分诊/护士录入)</span>
            </div>
            
            <div v-if="currentPatient.pre_exam" class="vitals-grid">
              <div class="vital-item">
                <span class="vital-lbl">身高</span>
                <span class="vital-val">{{ currentPatient.pre_exam.height }} cm</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">体重</span>
                <span class="vital-val">{{ currentPatient.pre_exam.weight }} kg</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">收缩压 (高压)</span>
                <span class="vital-val">{{ currentPatient.pre_exam.systolic_bp || '--' }} mmHg</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">舒张压 (低压)</span>
                <span class="vital-val">{{ currentPatient.pre_exam.diastolic_bp || '--' }} mmHg</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">颈围</span>
                <span class="vital-val">{{ currentPatient.pre_exam.neck_circumference || '--' }} cm</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">BMI 指数</span>
                <span class="vital-val text-blue">{{ currentPatient.pre_exam.bmi || '--' }}</span>
              </div>
            </div>
            <div v-else class="vitals-empty" style="display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span>该患者尚未录入身高、血压等预检体征信息，建议点击右侧“签到/录入”完善指标。</span>
            </div>
          </div>

          <!-- Symptoms complaint -->
          <div class="complaint-section">
            <span class="complaint-lbl" style="display: inline-flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>就诊主诉与描述：
            </span>
            <p class="complaint-val">{{ currentPatient.symptom }}</p>
          </div>

          <!-- Sleep Diagnostics & History Section -->
          <div class="diagnostics-section" style="margin-top: 16px; border-top: 1px dashed #E5E7EB; padding-top: 16px;">
            <div class="section-sub-title" style="display: flex; align-items: center; gap: 6px; margin-bottom: 12px; font-weight: 600; color: #111827;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #3B82F6;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>诊断参考与筛查数据</span>
            </div>

            <!-- Health History Grid (Allergies & Medical History) -->
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 12px;">
              <div style="background: #FFFBEB; padding: 10px; border-radius: 6px; border-left: 3px solid #F59E0B; text-align: left;">
                <div style="font-size: 11px; color: #B45309; font-weight: 600; margin-bottom: 2px;"><AppIcon name="clipboard" />  既往病史</div>
                <div style="font-size: 12px; color: #D97706; white-space: pre-wrap;">{{ currentPatient.medicalHistory || '暂无既往病史记录' }}</div>
              </div>
              <div style="background: #FEF2F2; padding: 10px; border-radius: 6px; border-left: 3px solid #EF4444; text-align: left;">
                <div style="font-size: 11px; color: #B91C1C; font-weight: 600; margin-bottom: 2px;"><AppIcon name="x-circle" />  药物与过敏史</div>
                <div style="font-size: 12px; color: #DC2626; white-space: pre-wrap;">{{ currentPatient.allergyHistory || '暂无过敏史记录' }}</div>
              </div>
            </div>

            <!-- Sleep & Snore Diagnostics -->
            <div style="background: #F9FAFB; padding: 12px; border-radius: 6px; border: 1px solid #F3F4F6;">
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: left;">
                
                <!-- ESS sleepiness -->
                <div style="border-right: 1px solid #E5E7EB; padding-right: 8px;">
                  <div style="font-size: 11px; color: #6B7280; font-weight: 600;">日间嗜睡评估 (ESS)</div>
                  <div v-if="patientDiagnostics?.ess" style="margin-top: 4px;">
                    <span style="font-size: 14px; font-weight: 700; color: #3B82F6;">{{ patientDiagnostics.ess.total_score }}分</span>
                    <span style="font-size: 10px; margin-left: 4px; color: #4B5563; background: #E0F2FE; padding: 1px 4px; border-radius: 3px; font-weight: 500;">{{ patientDiagnostics.ess.risk_level }}</span>
                  </div>
                  <div v-else style="font-size: 12px; color: #9CA3AF; margin-top: 4px;">未评估</div>
                </div>

                <!-- Night Snoring -->
                <div style="border-right: 1px solid #E5E7EB; padding-right: 8px; padding-left: 4px;">
                  <div style="font-size: 11px; color: #6B7280; font-weight: 600;">夜间鼾声评估</div>
                  <div v-if="patientDiagnostics?.snore" style="margin-top: 4px; font-size: 12px; color: #374151;">
                    <div>暂停事件: <span style="font-weight: 700; color: #EF4444;">{{ patientDiagnostics.snore.apnea_events }}次</span></div>
                    <div style="font-size: 11px; color: #6B7280; margin-top: 1px; line-height: 1.2;">
                      均值{{ patientDiagnostics.snore.avg_decibel }}dB (峰值{{ patientDiagnostics.snore.peak_decibel }}dB)
                    </div>
                  </div>
                  <div v-else style="font-size: 12px; color: #9CA3AF; margin-top: 4px;">未评估</div>
                </div>

                <!-- Compliance / Device Wearing -->
                <div style="padding-left: 4px;">
                  <div style="font-size: 11px; color: #6B7280; font-weight: 600;">治疗依从性与疗效</div>
                  <div v-if="patientDiagnostics?.wearing && patientDiagnostics.wearing.total_days > 0" style="margin-top: 4px; font-size: 12px; color: #374151;">
                    <div>累计佩戴: <span style="font-weight: 700; color: #10B981;">{{ patientDiagnostics.wearing.total_days }}天</span></div>
                    <div style="font-size: 11px; color: #6B7280; margin-top: 1px; line-height: 1.2;">
                      均效: {{ (patientDiagnostics.wearing.avg_duration / 60).toFixed(1) }}h (舒分: {{ (patientDiagnostics.wearing.avg_comfort).toFixed(1) }}分)
                    </div>
                  </div>
                  <div v-else style="font-size: 12px; color: #9CA3AF; margin-top: 4px;">暂无佩戴记录</div>
                </div>

              </div>
            </div>
          </div>


        </div>

        <div v-else class="active-patient-empty">
          <div class="empty-icon" style="color: #9CA3AF; display: flex; justify-content: center; align-items: center; margin-bottom: 16px;">
            <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
              <line x1="6" y1="1" x2="6" y2="4"></line>
              <line x1="10" y1="1" x2="10" y2="4"></line>
              <line x1="14" y1="1" x2="14" y2="4"></line>
            </svg>
          </div>
          <div class="empty-title">诊室当前空闲中</div>
          <p class="empty-desc">
            目前没有正在就诊中的患者。请从右侧的“候诊队列”中点击“叫号”邀请下一位患者进入诊室就诊。
          </p>
        </div>
      </div>

      <!-- Right Panel: Queue lists with tabs -->
      <div class="workbench-right panel">
        <!-- Pane Tabs -->
        <div class="pane-tabs">
          <div 
            class="pane-tab" 
            :class="{ active: rightPaneTab === 'waiting' }" 
            @click="rightPaneTab = 'waiting'"
            style="display: flex; align-items: center; justify-content: center; gap: 6px;"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>等待就诊 ({{ waitingQueue.length }}人)</span>
          </div>
          <div 
            class="pane-tab" 
            :class="{ active: rightPaneTab === 'completed' }" 
            @click="rightPaneTab = 'completed'"
            style="display: flex; align-items: center; justify-content: center; gap: 6px;"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>今日已诊 ({{ completedQueue.length }}人)</span>
          </div>
        </div>

        <!-- Tab Content 1: Waiting List -->
        <div v-if="rightPaneTab === 'waiting'" class="queue-tab-content">
          <!-- Time slots Filter Bar -->
          <div v-if="uniqueTimeSlots.length > 0" class="time-filter-wrapper">
            <div class="filter-tabs">
              <div 
                class="filter-tab" 
                :class="{ active: activeTimeSlot === 'all' }" 
                @click="activeTimeSlot = 'all'"
                style="display: flex; align-items: center;"
              >
                <span>全部</span>
                <span :style="getBadgeStyle(activeTimeSlot === 'all')">
                  {{ allWaitingItems.length }}
                </span>
              </div>
              <div 
                v-for="slot in uniqueTimeSlots" 
                :key="slot" 
                class="filter-tab" 
                :class="{ active: activeTimeSlot === slot }" 
                @click="activeTimeSlot = slot"
                style="display: flex; align-items: center;"
              >
                <span>{{ slot }}</span>
                <span :style="getBadgeStyle(activeTimeSlot === slot)">
                  {{ getSlotCount(slot) }}
                </span>
              </div>
            </div>
          </div>

          <div class="queue-list">
            <div v-for="(item, idx) in waitingQueue" :key="item.id" class="queue-item-row">
              <div class="queue-item-left" style="display: flex; align-items: center; gap: 8px;">
                <span class="queue-idx" style="width: 20px; text-align: center; font-size: 13px; color: #9CA3AF; font-weight: 500;">{{ idx + 1 }}</span>
                <t-avatar size="32px" :style="{ background: getAvatarColor(item.patientName), fontSize: '12px', fontWeight: '700', color: '#FFF', flexShrink: 0 }">
                  {{ item.patientName.slice(0, 1) }}
                </t-avatar>
                <div style="min-width: 0; overflow: hidden; display: flex; flex-direction: column; text-align: left;">
                  <div class="queue-name font-bold" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">{{ item.patientName }}</div>
                  <div class="queue-meta" style="line-height: 1.2; margin-top: 2px;">
                    {{ item.timeSlot }} · 
                    <span :class="item.status === 'pending' ? 'status-pending' : 'status-arrived'">
                      {{ item.status === 'pending' ? '待报到签到' : (item.status === 'called' ? '已叫号' : '候诊中') }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="queue-item-right">
                <t-button v-if="item.status === 'pending'" size="extra-small" theme="warning" variant="outline" @click="openCheckInDialog(item)">
                  签到
                </t-button>
                <template v-else>
                  <t-button size="extra-small" theme="primary" variant="outline" @click="triggerCallOnly(item)" style="margin-right: 4px;">
                    叫号
                  </t-button>
                  <t-button size="extra-small" theme="success" variant="outline" @click="triggerConsultOnly(item)">
                    接诊
                  </t-button>
                </template>
                <t-button size="extra-small" theme="default" variant="text" @click="delayPatient(item)" style="margin-left: 4px;">
                  顺延
                </t-button>
              </div>
            </div>
            
            <div v-if="waitingQueue.length === 0" class="no-queue-state" style="display: flex; align-items: center; justify-content: center; gap: 6px; color: #10B981;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <span>候诊队列为空，今日接诊任务完成！</span>
            </div>
          </div>
        </div>

        <!-- Tab Content 2: Completed List -->
        <div v-else class="queue-tab-content">
          <div class="queue-list">
            <div v-for="item in completedQueue" :key="item.id" class="queue-item-row completed">
              <div class="queue-item-left" style="display: flex; align-items: center; gap: 8px;">
                <span class="queue-idx checked" style="width: 20px; text-align: center;"><AppIcon name="check-circle" :size="14" /></span>
                <t-avatar size="32px" :style="{ background: getAvatarColor(item.patientName), fontSize: '12px', fontWeight: '700', color: '#FFF', flexShrink: 0 }">
                  {{ item.patientName.slice(0, 1) }}
                </t-avatar>
                <div style="min-width: 0; overflow: hidden; display: flex; flex-direction: column; text-align: left;">
                  <div class="queue-name font-bold" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4;">{{ item.patientName }}</div>
                  <div class="queue-meta" style="line-height: 1.2; margin-top: 2px;">已完成就诊 · {{ item.timeSlot }}</div>
                </div>
              </div>
              <div class="queue-item-right">
                <t-button size="extra-small" theme="default" variant="outline" @click="router.push(`/patient/detail/${item.patientId}`)">
                  患者详情
                </t-button>
                <t-button size="extra-small" theme="success" variant="outline" @click="openCheckoutDialog(item)">
                  收费结算
                </t-button>
              </div>
            </div>

            <div v-if="completedQueue.length === 0" class="no-queue-state">
              今日尚未有完成就诊的患者。
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 现场挂号/登记弹窗 -->
    <t-dialog
      v-model:visible="createApptVisible"
      header="患者门诊登记与现场挂号"
      width="540px"
      confirm-btn="确认挂号"
      cancel-btn="取消"
      @confirm="submitCreateAppt"
    >
      <div class="dialog-body-form" style="padding: 10px 0;">
        <div class="form-group" style="margin-bottom: 12px; display: flex; gap: 8px; align-items: flex-end;">
          <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
            <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">检索就诊患者 <span class="required" style="color: #EF4444;">*</span></label>
            <input v-model="apptSearchQuery" type="text" class="form-control" placeholder="输入患者姓名/手机号检索">
          </div>
          <t-button theme="primary" style="height: 36px;" @click="handleApptSearch">检索</t-button>
          <t-button theme="default" style="height: 36px;" @click="handleApptNewPatient">新患者建档</t-button>
        </div>

        <div v-if="apptSelectedPatient" class="matched-patient-box" style="background: #EFF6FF; border: 1px solid #BFDBFE; padding: 12px; border-radius: 8px; margin-bottom: 14px;">
          <div style="font-weight: 600; color: #1E40AF; margin-bottom: 4px;">已选就诊人信息：</div>
          <div style="font-size: 13px; color: #1E40AF;">
            姓名: {{ apptSelectedPatient.name }} · 手机号: {{ apptSelectedPatient.phone }} · 性别: {{ apptSelectedPatient.gender === 1 ? '男' : '女' }} · 年龄: {{ apptSelectedPatient.age }}岁
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">就诊日期</label>
          <input v-model="apptDate" type="date" class="form-control">
        </div>

        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">挂号时段</label>
          <select v-model="apptSlot" class="form-control">
            <option>09:00 - 09:30</option>
            <option>09:30 - 10:00</option>
            <option>10:00 - 10:30</option>
            <option>10:30 - 11:00</option>
            <option>14:00 - 14:30</option>
            <option>14:30 - 15:00</option>
            <option>15:00 - 15:30</option>
            <option>15:30 - 16:00</option>
          </select>
        </div>

        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">初/复诊类别</label>
          <select v-model="apptVisitType" class="form-control">
            <option>复诊</option>
            <option>初诊</option>
          </select>
        </div>

        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">挂号主诉 (选填)</label>
          <textarea v-model="apptRemarks" class="form-control" rows="2" placeholder="请输入患者主诉打鼾、憋气或其他症状描述"></textarea>
        </div>
      </div>
    </t-dialog>

    <t-dialog
      v-model:visible="checkInVisible"
      header="到店签到 & 预检体征录入"
      width="480px"
      :footer="null"
      @cancel="closeCheckInDialog"
    >
      <div class="dialog-body-form" style="padding: 10px 0;">
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">患者姓名</label>
          <input type="text" class="form-control" :value="selectedQueueItem?.patientName || selectedQueueItem?.patient" disabled style="background-color: #F3F4F6; width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none;">
        </div>
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">身高 (cm) <span class="required" style="color: #EF4444;">*</span></label>
          <input type="number" class="form-control" v-model="checkInForm.height" placeholder="请输入身高，如 175" style="width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none;">
        </div>
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">体重 (kg) <span class="required" style="color: #EF4444;">*</span></label>
          <input type="number" class="form-control" v-model="checkInForm.weight" placeholder="请输入体重，如 70" style="width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none;">
        </div>
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">收缩压 (mmHg)</label>
          <input type="number" class="form-control" v-model="checkInForm.systolicBp" placeholder="请输入收缩压，如 120" style="width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none;">
        </div>
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">舒张压 (mmHg)</label>
          <input type="number" class="form-control" v-model="checkInForm.diastolicBp" placeholder="请输入舒张压，如 80" style="width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none;">
        </div>
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">颈围 (cm)</label>
          <input type="number" class="form-control" v-model="checkInForm.neckCircumference" placeholder="请输入颈围，如 38" style="width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none;">
        </div>
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">BMI</label>
          <input type="text" class="form-control" :value="computedBmi" disabled placeholder="输入身高体重后自动计算" style="background-color: #F3F4F6; width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none; margin-bottom: 16px;">
        </div>
        <!-- Custom Footer -->
        <div style="margin-top: 20px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid #E5E7EB; padding-top: 16px;">
          <t-button variant="outline" theme="default" @click="closeCheckInDialog">取消</t-button>
          <t-button variant="outline" theme="warning" @click="handleCheckInSkip">跳过录入直接签到</t-button>
          <t-button theme="primary" @click="handleCheckInSubmit">确认签到</t-button>
        </div>
      </div>
    </t-dialog>

    <!-- 门诊收费结算收银弹窗 -->
    <t-dialog
      v-model:visible="checkoutVisible"
      header="门诊电子收银结算与划扣"
      width="540px"
      :footer="null"
      @cancel="closeCheckoutDialog"
    >
      <div v-if="selectedQueueItem" class="dialog-body-form" style="padding: 10px 0;">
        <div v-if="!checkoutSuccess">
          <div style="margin-bottom: 16px; font-size: 14px; color: #374151;">
            正在为患者 <strong>{{ selectedQueueItem.patientName }}</strong> 开立收费划扣账单：
          </div>

          <!-- Checkout Items Table -->
          <table class="billing-table" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <thead>
              <tr style="background: #F9FAFB; border-bottom: 1px solid #E5E7EB; text-align: left; font-size: 12px; color: #4B5563;">
                <th style="padding: 8px;">项目/商品名称</th>
                <th style="padding: 8px; width: 100px;">单价</th>
                <th style="padding: 8px; width: 60px;">数量</th>
                <th style="padding: 8px; width: 50px;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in billingItems" :key="idx" style="border-bottom: 1px solid #F3F4F6; font-size: 13px;">
                <td style="padding: 8px;">
                  <select 
                    v-model="item.product_id" 
                    class="form-control" 
                    style="height: 30px; font-size: 12px; padding: 0 8px;"
                    @change="onProductChange(idx, item.product_id)"
                  >
                    <option v-for="p in productOptions" :key="p.id" :value="p.id">
                      {{ p.name }}
                    </option>
                  </select>
                </td>
                <td style="padding: 8px;">¥{{ (item.price / 100).toFixed(2) }}</td>
                <td style="padding: 8px;">
                  <input v-model="item.quantity" type="number" class="form-control" style="height: 30px; padding: 2px 6px; text-align: center;" min="1">
                </td>
                <td style="padding: 8px;">
                  <button class="btn-text-del" @click="removeBillingItem(idx)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>

          <button class="btn-add-item" style="margin-bottom: 16px; display: inline-flex; align-items: center; justify-content: center; gap: 4px;" @click="addBillingItem">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>添加诊疗费/项目/药品
          </button>

          <!-- Discount & Delivery selector -->
          <div style="display: flex; gap: 16px; margin-bottom: 16px;">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">卡券折扣金额 (元)</label>
              <t-input-number v-model="discountAmount" :min="0" :step="1000" :format="val => `¥${(val / 100).toFixed(2)}`" style="width: 100%;" />
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">配送/交付方式</label>
              <t-select v-model="deliveryType" :options="[
                { label: '现场自提', value: 'offline_direct' },
                { label: '到店自取 (缺货)', value: 'offline_pending' },
                { label: '快递邮寄 (邮寄)', value: 'online' }
              ]" />
            </div>
          </div>

          <!-- Shipping Address Form -->
          <div v-if="deliveryType === 'online'" style="background: #F9FAFB; padding: 12px; border-radius: 8px; border: 1px solid #E5E7EB; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="font-weight: 700; font-size: 12px; color: #374151; display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13"></rect>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                <circle cx="5.5" cy="18.5" r="2.5"></circle>
                <circle cx="18.5" cy="18.5" r="2.5"></circle>
              </svg>
              <span>快递收货地址</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="font-size: 11px;">收件人</label>
                <t-input v-model="shippingReceiver" size="small" placeholder="姓名" />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="font-size: 11px;">手机号</label>
                <t-input v-model="shippingPhone" size="small" placeholder="手机号" />
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" style="font-size: 11px;">详细地址</label>
              <t-input v-model="shippingAddressStr" size="small" placeholder="请输入详细省市区县及门牌号" />
            </div>
          </div>

          <!-- Pickup Info Form -->
          <div v-if="deliveryType === 'offline_pending'" style="background: #FFFBEB; padding: 12px; border-radius: 8px; border: 1px solid #FCD34D; margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px;">
            <div style="font-weight: 700; font-size: 12px; color: #D97706; display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              <span>缺货自提预订</span>
            </div>
            <div style="font-size: 11px; color: #B45309; line-height: 1.4;">
              货到后系统将通过微信推送通知该患者到店自提。
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="font-size: 11px; color: #B45309;">通知人</label>
                <t-input v-model="shippingReceiver" size="small" placeholder="姓名" />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" style="font-size: 11px; color: #B45309;">通知手机号</label>
                <t-input v-model="shippingPhone" size="small" placeholder="手机号" />
              </div>
            </div>
          </div>

          <!-- Payment Settings -->
          <div style="background: #F9FAFB; padding: 14px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; color: #4B5563;">
              <span>项目总额：</span>
              <span>¥{{ (totalAmount / 100).toFixed(2) }}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; color: #4B5563;">
              <span>优惠减免：</span>
              <span>- ¥{{ (discountAmount / 100).toFixed(2) }}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; color: #111827; border-top: 1px dashed #D1D5DB; padding-top: 8px;">
              <span>应付金额：</span>
              <span style="color: #EF4444;">¥{{ (payableAmount / 100).toFixed(2) }}</span>
            </div>
          </div>

          <!-- Payment Method -->
          <div style="margin-bottom: 24px;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 8px; color: #374151;">支付方式</div>
            <div style="display: flex; gap: 12px;">
              <label class="pay-method-label" :class="{ active: payMethod === 'wechat' }" style="display: inline-flex; align-items: center; gap: 6px;">
                <input v-model="payMethod" type="radio" value="wechat" style="display: none;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="#22C55E" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>微信支付
              </label>
              <label class="pay-method-label" :class="{ active: payMethod === 'alipay' }" style="display: inline-flex; align-items: center; gap: 6px;">
                <input v-model="payMethod" type="radio" value="alipay" style="display: none;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="#3B82F6" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>支付宝
              </label>
              <label class="pay-method-label" :class="{ active: payMethod === 'cash' }" style="display: inline-flex; align-items: center; gap: 6px;">
                <input v-model="payMethod" type="radio" value="cash" style="display: none;">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="2" y1="10" x2="22" y2="10"></line>
                </svg>现金/刷卡
              </label>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <t-button theme="default" @click="closeCheckoutDialog">取消</t-button>
            <t-button theme="primary" :loading="checkoutLoading" @click="submitCheckout">确认支付收款 · ¥{{ (payableAmount / 100).toFixed(2) }}</t-button>
          </div>
        </div>

        <!-- Checkout Success state -->
        <div v-else style="text-align: center; padding: 20px 0;">
          <div style="color: #22C55E; margin-bottom: 16px; display: flex; justify-content: center; align-items: center;">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 700; color: #111827; margin: 0 0 8px 0;">收款划扣成功</h3>
          <p style="font-size: 13px; color: #6B7280; margin-bottom: 24px;">
            订单已支付完成，自动标记就诊单，前台小票打印已就绪。
          </p>

          <div style="background: #F9FAFB; padding: 14px; border-radius: 8px; text-align: left; font-size: 13px; color: #4B5563; margin-bottom: 24px; line-height: 1.6;">
            <div><strong>订单编号:</strong> {{ orderResult?.orderNo }}</div>
            <div><strong>实付金额:</strong> <span style="color: #EF4444; font-weight: 700;">¥{{ orderResult?.amount.toFixed(2) }}</span></div>
            <div><strong>交易时间:</strong> {{ orderResult?.time }}</div>
          </div>

          <div style="display: flex; justify-content: center; gap: 10px;">
            <t-button theme="primary" variant="outline" @click="handlePrintInvoice" style="display: inline-flex; align-items: center; gap: 4px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>打印交易小票
            </t-button>
            <t-button theme="default" @click="closeCheckoutDialog">关闭</t-button>
          </div>
        </div>
      </div>
    </t-dialog>

    <!-- Patient Creation Nested Dialog (From Walk-in Dialog) -->
    <PatientCreateDialog
      v-model:visible="apptPatientCreateVisible"
      @success="handleApptPatientCreated"
    />
  </div>
</template>

<style scoped>
.doctor-selector-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
}

.selector-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selector-lbl {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.selector-dropdown {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #D1D5DB;
  font-size: 13px;
  outline: none;
  background: #FFF;
  cursor: pointer;
  color: #374151;
  font-weight: 500;
  box-sizing: border-box;
  transition: border-color 150ms;
}
.selector-dropdown:focus {
  border-color: var(--primary-500);
}

.selector-right {
  display: flex;
  align-items: center;
  font-size: 13px;
  color: #6B7280;
}

.separator {
  margin: 0 10px;
  color: #D1D5DB;
}

.workbench-layout {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 20px;
}

.workbench-left, .workbench-right {
  background: #FFF;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  padding: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  min-height: 600px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pane-header {
  padding: 16px;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0;
}

.pane-title {
  font-size: 16px;
  font-weight: 700;
  color: #1F2937;
}

.status-tag {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.status-tag.green {
  background: #DCFCE7;
  color: #15803D;
}

.status-tag.gray {
  background: #F3F4F6;
  color: #4B5563;
}

/* Active Patient Workspace */
.active-patient-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 16px;
}

.patient-main-info {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.avatar-logo {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--primary-100);
  color: var(--primary-600);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
}

.active-pat-name {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.active-pat-sub {
  font-size: 13px;
  color: #6B7280;
  margin-top: 2px;
}

.vitals-section {
  background: #F9FAFB;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 20px;
  border: 1px solid #E5E7EB;
}

.section-sub-title {
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
  margin-bottom: 12px;
}

.vitals-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.vital-item {
  display: flex;
  flex-direction: column;
  background: #FFF;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #E5E7EB;
  align-items: center;
}

.vital-lbl {
  font-size: 11px;
  color: #9CA3AF;
  margin-bottom: 2px;
}

.vital-val {
  font-size: 14px;
  font-weight: 700;
  color: #1F2937;
}

.text-blue {
  color: var(--primary-600);
}

.vitals-empty {
  font-size: 12px;
  color: #D97706;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  padding: 10px;
  border-radius: 6px;
}

.complaint-section {
  background: #F9FAFB;
  border-left: 4px solid var(--primary-400);
  padding: 12px;
  border-radius: 0 8px 8px 0;
  margin-bottom: auto; /* Push buttons to bottom */
}

.complaint-lbl {
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
}

.complaint-val {
  font-size: 13px;
  color: #6B7280;
  margin-top: 4px;
  line-height: 1.5;
}

.consult-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 24px;
}

.actions-row {
  display: flex;
  gap: 10px;
}

.active-patient-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: #374151;
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 13px;
  color: #9CA3AF;
  max-width: 300px;
  line-height: 1.6;
}

/* Time slots filters */
.time-filter-wrapper {
  overflow-x: auto;
  white-space: nowrap;
  width: 100%;
  margin-bottom: 16px;
  padding-bottom: 6px;
  -webkit-overflow-scrolling: touch;
}

.time-filter-wrapper::-webkit-scrollbar {
  height: 4px;
}

.time-filter-wrapper::-webkit-scrollbar-track {
  background: #F3F4F6;
  border-radius: 2px;
}

.time-filter-wrapper::-webkit-scrollbar-thumb {
  background: #D1D5DB;
  border-radius: 2px;
}

.time-filter-wrapper::-webkit-scrollbar-thumb:hover {
  background: #9CA3AF;
}

.time-filter-wrapper .filter-tabs {
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 0;
}

.time-filter-wrapper .filter-tab {
  flex-shrink: 0;
  white-space: nowrap;
}

/* Right Tabs Control */
.pane-tabs {
  display: flex;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
  margin-bottom: 0;
}

.pane-tab {
  flex: 1;
  text-align: center;
  padding: 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: #6B7280;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 0.15s ease-in-out;
}
.pane-tab.active {
  color: var(--primary-500);
  border-bottom-color: var(--primary-500);
  background: #FFFFFF;
}

.queue-tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;
  padding: 16px;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  max-height: 400px;
  padding-right: 4px;
}

.queue-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  transition: all 0.15s ease-in-out;
}
.queue-item-row:hover {
  border-color: var(--primary-300);
  background: #FFF;
}

.queue-item-row.completed {
  background: #F0FDF4;
  border-color: #BBF7D0;
}

.queue-item-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.queue-idx {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #E5E7EB;
  color: #9CA3AF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
}

.queue-idx.checked {
  background: #DCFCE7;
  color: #15803D;
}

.queue-name {
  font-size: 14px;
  font-weight: 600;
  color: #1F2937;
}

.queue-meta {
  font-size: 11px;
  color: #9CA3AF;
  margin-top: 2px;
}

.status-pending {
  color: #D97706;
  font-weight: 500;
}

.status-arrived {
  color: var(--primary-600);
  font-weight: 500;
}

.queue-item-right {
  display: flex;
  gap: 6px;
}

.no-queue-state {
  text-align: center;
  padding: 40px 0;
  color: #9CA3AF;
  font-size: 13px;
}

/* Dialog components styles */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.form-control {
  width: 100%;
  height: 36px;
  padding: 8px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  box-sizing: border-box;
  font-size: 13px;
  color: #1F2937;
  outline: none;
  background-color: #FFF;
  transition: all 150ms ease;
}
.form-control:focus {
  border-color: var(--primary-500, #3B6BF5);
  box-shadow: 0 0 0 2px rgba(59, 107, 245, 0.1);
}
textarea.form-control {
  height: auto;
  resize: vertical;
  font-family: inherit;
}

.pay-method-label {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  user-select: none;
}
.pay-method-label.active {
  border-color: var(--primary-500);
  background: var(--primary-50);
  color: var(--primary-600);
  font-weight: 600;
}

.btn-add-item {
  width: 100%;
  height: 36px;
  background: #FFF;
  border: 1px dashed var(--primary-400);
  color: var(--primary-600);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}
.btn-add-item:hover {
  background: var(--primary-50);
}

.btn-text-del {
  background: transparent;
  border: none;
  color: #EF4444;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  font-weight: 500;
}
.btn-text-del:hover {
  text-decoration: underline;
}
</style>
