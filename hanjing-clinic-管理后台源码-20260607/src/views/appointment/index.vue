<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import {
  createBillingItem,
  createCheckoutReceiptResult,
  fetchCheckoutProducts,
  findCheckoutProduct,
  type BillingItem,
  type CheckoutProduct
} from '@/utils/checkoutProducts'

const router = useRouter()
const route = useRoute()

const getTodayDateString = () => {
  const nowInShanghai = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }))
  const y = nowInShanghai.getFullYear()
  const m = String(nowInShanghai.getMonth() + 1).padStart(2, '0')
  const d = String(nowInShanghai.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const activeTab = ref(localStorage.getItem('appt_list_active_tab') || 'all')
const filterStore = ref(localStorage.getItem('appt_list_filter_store') || '全部门店')
const filterDoctor = ref(localStorage.getItem('appt_list_filter_doctor') || '全部医生')

const getStoredFilterDate = () => {
  const stored = localStorage.getItem('appt_list_filter_date')
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    if (stored.includes(',')) return stored.split(',')
    return stored ? [stored, stored] : []
  }
}
const filterDate = ref<any[]>(getStoredFilterDate())
const searchKeyword = ref(localStorage.getItem('appt_list_search_keyword') || '')

watch(activeTab, (newVal) => { localStorage.setItem('appt_list_active_tab', newVal) })
watch(filterStore, (newVal) => { localStorage.setItem('appt_list_filter_store', newVal) })
watch(filterDoctor, (newVal) => { localStorage.setItem('appt_list_filter_doctor', newVal) })
watch(filterDate, (newVal) => {
  if (Array.isArray(newVal) && newVal.length > 0) {
    localStorage.setItem('appt_list_filter_date', JSON.stringify(newVal))
  } else {
    localStorage.removeItem('appt_list_filter_date')
  }
})
watch(searchKeyword, (newVal) => { localStorage.setItem('appt_list_search_keyword', newVal) })

const currentPage = ref(1)
const pageSize = ref(30)
const totalAppointments = ref(0)
const stores = ref<any[]>([])
const doctors = ref<any[]>([])
const loading = ref(false)

interface Appointment {
  id: string;
  patientId: string;
  no: string;
  patient: string;
  phone: string;
  avatarChar: string;
  avatarColor: string;
  store: string;
  doctor: string;
  date: string;
  time: string;
  type: string;
  source: string;
  status: string;
  createdAt: string;
}

const appointments = ref<Appointment[]>([])

const fetchStores = async () => {
  try {
    const res: any = await request.get('/api/admin/stores')
    stores.value = res.data || []
  } catch (error) {
    console.error('Failed to load stores:', error)
  }
}

const fetchDoctors = async () => {
  try {
    const res: any = await request.get('/api/admin/doctors')
    doctors.value = res.data || []
  } catch (error) {
    console.error('Failed to load doctors:', error)
  }
}

const fetchAppointments = async () => {
  try {
    loading.value = true
    const params: any = {
      page: currentPage.value,
      pageSize: pageSize.value
    }
    if (searchKeyword.value && searchKeyword.value.trim()) {
      params.search = searchKeyword.value.trim()
    }
    if (filterStore.value && filterStore.value !== '全部门店') {
      params.store_name = filterStore.value
    }
    if (filterDoctor.value && filterDoctor.value !== '全部医生') {
      params.doctor_name = filterDoctor.value
    }
    if (activeTab.value === 'today') {
      params.date = getTodayDateString()
    } else if (Array.isArray(filterDate.value) && filterDate.value.length === 2 && filterDate.value[0] && filterDate.value[1]) {
      params.date = filterDate.value.join(',')
    } else if (filterDate.value && typeof filterDate.value === 'string') {
      params.date = filterDate.value
    }
    if (activeTab.value !== 'all' && activeTab.value !== 'today') {
      params.status = activeTab.value
    }

    const res: any = await request.get('/api/admin/appointments', { params })
    const rawList = res.data?.list || []
    totalAppointments.value = res.data?.total || 0

    if (res.data?.counts) {
      counts.value = res.data.counts
    }

    appointments.value = rawList.map((item: any) => ({
      id: item.id.toString(),
      patientId: item.patient_id.toString(),
      no: item.appointment_no,
      patient: item.patient_name,
      phone: item.patient_phone,
      avatarChar: item.patient_name[0] || '患',
      avatarColor: item.patient_gender === 1 ? '#3B6BF5' : '#EC4899',
      store: item.store_name,
      doctor: item.doctor_name,
      date: item.appointment_date ? (() => {
        const d = new Date(item.appointment_date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })() : '',
      time: item.appointment_time,
      type: item.type === 'first' ? '初诊' : '复诊',
      source: item.source === 'mini_app' ? '小程序' : item.source === 'telephone' ? '电话' : '到店',
      status: item.status === 'arrived' || item.status === 'settled' ? 'arrived' : item.status === 'completed' ? 'completed' : item.status === 'checked_in' ? 'checked_in' : item.status === 'confirmed' || item.status === 'waiting' || item.status === 'called' ? 'waiting' : item.status === 'pending' ? 'pending' : item.status === 'pending_payment' ? 'pending_payment' : item.status === 'no_show' ? 'no_show' : 'cancelled',
      createdAt: item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', { hour12: false }) : '',
      consult_fee: item.consult_fee || 0,
      deposit_amount: item.deposit_amount || 0
    }))

    if (route.query.checkout_id) {
      const appt = appointments.value.find(a => String(a.id) === String(route.query.checkout_id))
      if (appt) {
        openCheckoutDialog(appt)
      }
    }
  } catch (error) {
    console.error('Failed to load appointments:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchStores()
  fetchDoctors()
  fetchProducts()
  fetchAppointments()
})

const storeOptions = computed(() => [
  { label: '全部门店', value: '全部门店' },
  ...stores.value.map(store => ({ label: store.name, value: store.name }))
])

const doctorOptions = computed(() => [
  { label: '全部医生', value: '全部医生' },
  ...doctors.value.map(doc => ({ label: doc.name, value: doc.name }))
])

const tabOptions = [
  { label: '全部', value: 'all' },
  { label: '今日', value: 'today' },
  { label: '待支付', value: 'pending_payment' },
  { label: '已预约', value: 'pending' },
  { label: '候诊中', value: 'waiting' },
  { label: '就诊中', value: 'checked_in' },
  { label: '待结算', value: 'completed' },
  { label: '已完成', value: 'arrived' },
  { label: '未到诊', value: 'no_show' },
  { label: '已取消', value: 'cancelled' },
]

const statusMap: Record<string, { label: string; theme: string }> = {
  arrived: { label: '已完成', theme: 'success' },
  completed: { label: '待结算', theme: 'danger' },
  checked_in: { label: '就诊中', theme: 'warning' },
  waiting: { label: '候诊中', theme: 'primary' },
  pending: { label: '已预约', theme: 'success' },
  pending_payment: { label: '待支付', theme: 'warning' },
  no_show: { label: '未到诊', theme: 'default' },
  cancelled: { label: '已取消', theme: 'danger' }
}

const counts = ref<Record<string, number>>({
  all: 0,
  today: 0,
  pending_payment: 0,
  pending: 0,
  waiting: 0,
  checked_in: 0,
  completed: 0,
  arrived: 0,
  no_show: 0,
  cancelled: 0
})

watch([activeTab, filterStore, filterDoctor, filterDate, searchKeyword], () => {
  currentPage.value = 1
  fetchAppointments()
})

watch([currentPage, pageSize], () => {
  fetchAppointments()
})

async function handleExport() {
  try {
    const params: any = { is_export: 1 }
    if (searchKeyword.value && searchKeyword.value.trim()) {
      params.search = searchKeyword.value.trim()
    }
    if (filterStore.value && filterStore.value !== '全部门店') {
      params.store_name = filterStore.value
    }
    if (filterDoctor.value && filterDoctor.value !== '全部医生') {
      params.doctor_name = filterDoctor.value
    }
    if (activeTab.value === 'today') {
      params.date = getTodayDateString()
    } else if (Array.isArray(filterDate.value) && filterDate.value.length === 2 && filterDate.value[0] && filterDate.value[1]) {
      params.date = filterDate.value.join(',')
    } else if (filterDate.value && typeof filterDate.value === 'string') {
      params.date = filterDate.value
    }
    if (activeTab.value !== 'all' && activeTab.value !== 'today') {
      params.status = activeTab.value
    }

    const res: any = await request.get('/api/admin/appointments', { params })
    const rawList = Array.isArray(res.data) ? res.data : (res.data?.list || [])

    if (rawList.length === 0) {
      MessagePlugin.warning('当前无匹配的预约记录可供导出')
      return
    }

    const headers = [
      '预约单号',
      '患者姓名',
      '手机号',
      '就诊门店',
      '就诊医生',
      '预约日期',
      '预约时间',
      '就诊类型',
      '来源渠道',
      '预约状态'
    ]

    const rows = rawList.map(item => {
      const escapeCsv = (val: string) => {
        if (val === null || val === undefined) return ''
        const str = String(val).replace(/"/g, '""')
        return `"${str}"`
      }

      const rawStatus = item.status === 'arrived' || item.status === 'settled' ? 'arrived' : item.status === 'completed' ? 'completed' : item.status === 'checked_in' ? 'checked_in' : item.status === 'confirmed' || item.status === 'waiting' || item.status === 'called' ? 'waiting' : item.status === 'pending' ? 'pending' : item.status === 'pending_payment' ? 'pending_payment' : item.status === 'no_show' ? 'no_show' : 'cancelled'
      const statusLabel = statusMap[rawStatus]?.label || item.status

      return [
        escapeCsv(item.appointment_no),
        escapeCsv(item.patient_name),
        escapeCsv(item.patient_phone),
        escapeCsv(item.store_name),
        escapeCsv(item.doctor_name),
        escapeCsv(item.appointment_date ? item.appointment_date.substring(0, 10) : ''),
        escapeCsv(item.appointment_time),
        escapeCsv(item.type === 'first' ? '初诊' : '复诊'),
        escapeCsv(item.source === 'mini_app' ? '小程序' : item.source === 'telephone' ? '电话' : '到店'),
        escapeCsv(statusLabel)
      ]
    })

    const csvContent = '\uFEFF' + [headers.join(',')].concat(rows.map(r => r.join(','))).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    
    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    link.setAttribute('download', `预约挂号导出_${dateStr}.csv`)
    
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    MessagePlugin.success(`成功导出 ${rawList.length} 条预约记录`)
  } catch (error) {
    console.error(error)
    MessagePlugin.error('导出失败')
  }
}

const paginatedAppointments = computed(() => {
  return appointments.value
})



const operationColumnWidth = computed(() => {
  if (paginatedAppointments.value.length === 0) {
    return '80px'
  }
  
  let maxButtons = 1
  let hasPending = false
  let hasPendingPayment = false
  let hasWaiting = false
  let hasCompletedOrCheckedIn = false
  
  for (const row of paginatedAppointments.value) {
    if (row.status === 'pending') {
      maxButtons = Math.max(maxButtons, 4)
      hasPending = true
    } else if (row.status === 'pending_payment') {
      maxButtons = Math.max(maxButtons, 3)
      hasPendingPayment = true
    } else if (row.status === 'waiting') {
      maxButtons = Math.max(maxButtons, 3)
      hasWaiting = true
    } else if (row.status === 'checked_in' || row.status === 'completed') {
      maxButtons = Math.max(maxButtons, 2)
      hasCompletedOrCheckedIn = true
    }
  }
  
  if (maxButtons === 4) {
    return '270px'
  } else if (maxButtons === 3) {
    return hasPendingPayment ? '220px' : '200px'
  } else if (maxButtons === 2) {
    return hasCompletedOrCheckedIn ? '160px' : '140px'
  } else {
    return '80px'
  }
})

watch(operationColumnWidth, () => {
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'))
  }, 100)
})

function getAvatarColor(name: string) {
  const colors = ['#3B6BF5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function formatDateTime(dateStr: string, timeStr: string) {
  if (!dateStr) return timeStr
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    const month = parseInt(parts[1], 10)
    const day = parseInt(parts[2], 10)
    return `${month}/${day} ${timeStr}`
  }
  return `${dateStr} ${timeStr}`
}

const checkInVisible = ref(false)
const selectedQueueItem = ref<any>(null)
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
  if (h > 0 && w > 0) {
    return (w / ((h / 100) * (h / 100))).toFixed(1)
  }
  return ''
})

async function openCheckInDialog(row: any) {
  selectedQueueItem.value = row
  checkInForm.value = {
    height: '',
    weight: '',
    systolicBp: '',
    diastolicBp: '',
    neckCircumference: ''
  }
  try {
    const res: any = await request.get(`/api/admin/appointments/${row.id}/pre-exam`)
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

function closeCheckInDialog() {
  checkInVisible.value = false
  selectedQueueItem.value = null
}

async function handleCheckInSkip() {
  if (!selectedQueueItem.value) return
  try {
    await request.put(`/api/admin/appointments/${selectedQueueItem.value.id}`, { status: 'confirmed' })
    MessagePlugin.success(`患者 ${selectedQueueItem.value.patient} 签到成功（已跳过体征录入）`)
    checkInVisible.value = false
    fetchAppointments()
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
    MessagePlugin.success(`患者 ${selectedQueueItem.value.patient} 签到与预检体征录入成功`)
    checkInVisible.value = false
    fetchAppointments()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('签到保存失败')
  }
}

function handleCheckIn(row: Appointment) {
  openCheckInDialog(row)
}

async function cancelStatus(id: string) {
  try {
    await request.put(`/api/admin/appointments/${id}`, { status: 'cancelled', cancel_reason: '后台管理员手动取消' })
    MessagePlugin.success('已取消该预约')
    fetchAppointments()
  } catch (error) {
    console.error(error)
  }
}

async function markAsNoShow(row: Appointment) {
  try {
    await request.put(`/api/admin/appointments/${row.id}`, { status: 'no_show' })
    MessagePlugin.success(`已将患者 ${row.patient} 标记为未到诊`)
    fetchAppointments()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('标记未到诊失败')
  }
}


// 呼叫广播叫号，不改变状态
const callPatient = (row: Appointment) => {
  if ('speechSynthesis' in window) {
    const text = `请患者 ${row.patient}，到 ${row.doctor} 医生诊室就诊。`
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
    MessagePlugin.success(`呼叫广播成功: "${text}"`)
  } else {
    MessagePlugin.warning('浏览器不支持语音播报，已通过系统弹窗提示')
  }
}

// 诊疗完成
const completeTreatment = async (row: Appointment) => {
  try {
    await request.put(`/api/admin/appointments/${row.id}`, { status: 'completed' })
    MessagePlugin.success(`患者 ${row.patient} 诊疗已完成`)
    fetchAppointments()
    // 自动打开收银结算弹窗
    openCheckoutDialog(row)
  } catch (error) {
    console.error(error)
  }
}

// 诊所收银结算弹窗相关状态与方法
const checkoutVisible = ref(false)
const checkoutLoading = ref(false)
const checkoutSuccess = ref(false)
const orderResult = ref<any>(null)
const selectedCheckoutRow = ref<Appointment | null>(null)

const deliveryType = ref<string>('offline_direct')
const shippingReceiver = ref<string>('')
const shippingPhone = ref<string>('')
const shippingAddressStr = ref<string>('')

const productOptions = ref<CheckoutProduct[]>([])

const billingItems = ref<BillingItem[]>([])
const discountAmount = ref<number>(0)
const payMethod = ref<string>('wechat')

const totalAmount = computed(() => {
  return billingItems.value.reduce((sum, item) => sum + (item.price * item.quantity), 0)
})

const payableAmount = computed(() => {
  const diff = totalAmount.value - discountAmount.value
  return diff > 0 ? diff : 0
})

function addBillingItem() {
  const product = findCheckoutProduct(productOptions.value)
  if (!product) {
    MessagePlugin.warning('暂无可添加的上架商品')
    return
  }
  billingItems.value.push(createBillingItem(product))
}

function removeBillingItem(idx: number) {
  billingItems.value.splice(idx, 1)
}

function onProductChange(idx: number, prodId: string) {
  const prod = productOptions.value.find(p => p.id === prodId)
  if (prod) {
    billingItems.value[idx] = createBillingItem(prod, { quantity: billingItems.value[idx].quantity })
  }
}

watch(deliveryType, (newVal) => {
  if (newVal === 'online') {
    const freightProduct = findCheckoutProduct(productOptions.value, '运费')
    if (!freightProduct) {
      MessagePlugin.warning('商品管理中暂无上架运费项目，请先配置后再选择快递邮寄')
      deliveryType.value = 'offline_direct'
      return
    }
    const exists = billingItems.value.some(item => item.product_id === freightProduct.id)
    if (!exists) {
      billingItems.value.push(createBillingItem(freightProduct))
    }
  } else {
    const freightProduct = findCheckoutProduct(productOptions.value, '运费')
    const idx = billingItems.value.findIndex(item => item.product_id === freightProduct?.id || item.product_name.includes('运费'))
    if (idx !== -1) {
      billingItems.value.splice(idx, 1)
    }
  }
})

const fetchProducts = async () => {
  try {
    productOptions.value = await fetchCheckoutProducts(request)
  } catch (error) {
    console.error('获取商品列表失败:', error)
    MessagePlugin.error('获取商品列表失败')
  }
}

async function openCheckoutDialog(row: Appointment) {
  if (productOptions.value.length === 0) {
    await fetchProducts()
  }
  const consultProduct = findCheckoutProduct(productOptions.value)
  if (!consultProduct) {
    MessagePlugin.warning('暂无上架商品，无法开立收费账单')
    return
  }
  selectedCheckoutRow.value = row
  if (row.status === 'pending_payment') {
    const items: BillingItem[] = []
    if (row.consult_fee && row.consult_fee > 0) {
      items.push(createBillingItem(consultProduct, {
        name: `${row.doctor}医生挂号门诊费`,
        price: row.consult_fee
      }))
    }
    if (row.deposit_amount && row.deposit_amount > 0) {
      const depositProduct = findCheckoutProduct(productOptions.value, '定金')
      if (!depositProduct) {
        MessagePlugin.warning('商品管理中暂无上架预约定金项目，请先配置后再收银')
        return
      }
      items.push(createBillingItem(depositProduct, { price: row.deposit_amount }))
    }
    billingItems.value = items.length > 0 ? items : [createBillingItem(consultProduct)]
  } else {
    billingItems.value = [
      createBillingItem(consultProduct)
    ]
  }
  discountAmount.value = 0
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
  if (checkoutSuccess.value) {
    MessagePlugin.warning('请点击底部“完成结算”完成本次结算流程')
    checkoutVisible.value = true
    return
  }
  checkoutVisible.value = false
  selectedCheckoutRow.value = null
}

async function completeCheckoutSettlement() {
  if (!selectedCheckoutRow.value || !orderResult.value) return
  checkoutLoading.value = true
  try {
    const nextStatus = selectedCheckoutRow.value.status === 'pending_payment' ? 'pending' : 'arrived'
    await request.put(`/api/admin/appointments/${selectedCheckoutRow.value.id}`, { status: nextStatus })
    MessagePlugin.success('结算已完成')
    checkoutVisible.value = false
    selectedCheckoutRow.value = null
    checkoutSuccess.value = false
    orderResult.value = null
    fetchAppointments()
  } catch (err) {
    console.error('完成结算失败:', err)
    MessagePlugin.error('完成结算失败，请稍后重试')
  } finally {
    checkoutLoading.value = false
  }
}

function handlePrintInvoice() {
  MessagePlugin.success('已发送打印指令，正在打印交易凭证小票...')
}

async function submitCheckout() {
  if (!selectedCheckoutRow.value) return
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
    let shipAddr: any = null

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
      patient_id: parseInt(selectedCheckoutRow.value.patientId, 10),
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
      MessagePlugin.success('收银收费结算交易成功！')
      orderResult.value = createCheckoutReceiptResult(res.data.receipt)
      checkoutSuccess.value = true
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('结算收费失败')
  } finally {
    checkoutLoading.value = false
  }
}

</script>

<template>
  <div class="page-container">
    <!-- Header aligned with UI mockup -->
    <div class="page-title-row">
      <div>
        <div class="page-title">预约管理</div>
        <div class="page-title-sub">管理所有预约挂号记录</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-outline" @click="handleExport"><AppIcon name="download" />  导出</button>
        <button class="btn btn-primary" @click="router.push('/appointment/create')"><AppIcon name="plus" />  新建预约</button>
      </div>
    </div>

    <!-- Panel Wrapper -->
    <div class="panel">
      <!-- Filter panel with Status Tabs (Left) and Dropdowns (Right) -->
      <div class="filter-bar" style="flex-wrap: nowrap; overflow-x: auto; gap: 16px;">
        <!-- Left: Filter Tabs -->
        <div class="filter-tabs" style="flex-shrink: 0;">
          <div
            v-for="tab in tabOptions"
            :key="tab.value"
            :class="['filter-tab', activeTab === tab.value ? 'active' : '']"
            @click="activeTab = tab.value"
            style="display: flex; align-items: center; gap: 4px;"
          >
            <span>{{ tab.label }}</span>
            <span :style="{ 
              opacity: activeTab === tab.value ? '0.9' : '0.6', 
              fontSize: '11px', 
              fontWeight: '500',
              background: activeTab === tab.value ? 'rgba(255, 255, 255, 0.25)' : '#F3F4F6',
              color: activeTab === tab.value ? '#FFF' : '#6B7280',
              padding: '1px 5px',
              borderRadius: '10px',
              display: 'inline-block',
              lineHeight: '1.2'
            }">
              {{ counts[tab.value] }}
            </span>
          </div>
        </div>

        <!-- Right: Dropdowns and Search -->
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; flex-shrink: 0;">
          <t-input
            v-model="searchKeyword"
            placeholder="搜索患者/预约单号"
            clearable
            style="width: 180px;"
          />
          <t-select v-model="filterStore" :options="storeOptions" style="width: 125px;" />
          <t-select v-model="filterDoctor" :options="doctorOptions" style="width: 110px;" />
          <t-date-range-picker v-model="filterDate" style="width: 240px;" clearable :placeholder="['开始日期', '结束日期']" />
        </div>
      </div>

      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>预约单号</th>
              <th>患者</th>
              <th>门店</th>
              <th>医生</th>
              <th>预约时间</th>
              <th>来源</th>
              <th>状态</th>
              <th>预约创建时间</th>
              <th :style="{ width: operationColumnWidth, minWidth: operationColumnWidth, textAlign: 'right' }">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedAppointments" :key="row.id">
              <td style="font-family: monospace; font-weight: 600; color: var(--primary-500);">{{ row.no }}</td>
              <td>
                <div style="display: flex; align-items: center; gap: 10px; min-width: 0; overflow: hidden;">
                  <div :style="{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: getAvatarColor(row.patient),
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    flexShrink: 0
                  }">{{ row.patient.substring(0, 1) }}</div>
                  <div style="min-width: 0; overflow: hidden; display: flex; flex-direction: column;">
                    <div style="font-weight: 600; color: #1F2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ row.patient }}</div>
                    <div style="font-size: 11px; color: #9CA3AF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ row.phone }}</div>
                  </div>
                </div>
              </td>
              <td>{{ row.store }}</td>
              <td>{{ row.doctor }}</td>
              <td style="font-size: 12px;">{{ formatDateTime(row.date, row.time) }}</td>
              <td>
                <t-tag size="small" variant="light" :theme="row.source === '小程序' ? 'success' : 'primary'">
                  {{ row.source }}
                </t-tag>
              </td>
              <td>
                <t-tag
                  :theme="statusMap[row.status]?.theme || 'default'"
                  size="small"
                  variant="light"
                >
                  {{ statusMap[row.status]?.label || row.status }}
                </t-tag>
              </td>
              <td style="font-size: 12px; color: #4B5563;">{{ row.createdAt || '--' }}</td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;">
                  <button
                    class="btn btn-xs btn-outline"
                    @click="router.push('/appointment/detail/' + row.id)"
                  >详情</button>

                  <!-- status is pending_payment (待支付) -->
                  <button
                    v-if="row.status === 'pending_payment'"
                    class="btn btn-xs btn-primary"
                    @click="openCheckoutDialog(row)"
                  >挂号收银</button>

                  <!-- status is pending (已预约) -->
                  <button
                    v-if="row.status === 'pending'"
                    class="btn btn-xs btn-primary"
                    @click="handleCheckIn(row)"
                  >签到</button>
                  <button
                    v-if="row.status === 'pending'"
                    class="btn btn-xs btn-warning"
                    @click="markAsNoShow(row)"
                  >未到诊</button>
                  
                  <!-- status is waiting (候诊中) -->
                  <button
                    v-if="row.status === 'waiting'"
                    class="btn btn-xs btn-warning"
                    @click="callPatient(row)"
                  ><AppIcon name="megaphone" />  叫号</button>
                  <button
                    v-if="row.status === 'waiting'"
                    class="btn btn-xs btn-warning"
                    @click="markAsNoShow(row)"
                  >未到诊</button>

                  <!-- status is checked_in (就诊中) -->
                  <button
                    v-if="row.status === 'checked_in'"
                    class="btn btn-xs btn-success"
                    @click="completeTreatment(row)"
                  >诊疗完成</button>

                  <!-- status is completed (待结算) -->
                  <button
                    v-if="row.status === 'completed'"
                    class="btn btn-xs btn-warning"
                    @click="openCheckoutDialog(row)"
                  >收银结算</button>

                </div>
              </td>
            </tr>
            <tr v-if="paginatedAppointments.length === 0">
              <td colspan="9" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无匹配的预约记录数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="totalAppointments"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>



    <!-- 收银结算弹窗 -->
    <t-dialog
      v-model:visible="checkoutVisible"
      header="门诊电子收银结算与划扣"
      width="540px"
      :footer="false"
      @close="closeCheckoutDialog"
    >
      <div v-if="checkoutSuccess" style="display: flex; flex-direction: column; align-items: center; padding: 10px 0;">
        <div class="invoice-box" style="width: 100%; background: #FCFCFA; border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; font-family: monospace;">
          <div style="font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 10px; color: #000;">鼾静健康诊所 · 收费凭证</div>
          <div style="text-align: center; color: #9CA3AF; margin: 6px 0;">================================</div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span>交易单号:</span> <span>{{ orderResult?.orderNo }}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span>结账客户:</span> <span>{{ orderResult?.patientName }}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span>交易时间:</span> <span>{{ orderResult?.time }}</span></div>
          <div style="text-align: center; color: #9CA3AF; margin: 6px 0;">--------------------------------</div>
          <div v-for="item in orderResult?.items" :key="item.product_id" style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
            <span>{{ item.product_name }} x{{ item.quantity }}</span>
            <span>¥{{ ((item.price * item.quantity) / 100).toFixed(2) }}</span>
          </div>
          <div style="text-align: center; color: #9CA3AF; margin: 6px 0;">--------------------------------</div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span>总计金额:</span> <span>¥{{ orderResult?.total }}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; color: #EF4444;"><span>优惠折扣:</span> <span>-¥{{ orderResult?.discount }}</span></div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; color: #000; margin-bottom: 4px;">
            <span>实收金额:</span> <span>¥{{ orderResult?.payable }}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;"><span>支付方式:</span> <span>{{ orderResult?.payMethodText }}</span></div>
          <div style="text-align: center; color: #9CA3AF; margin: 6px 0;">================================</div>
          <div style="font-size: 11px; color: #9CA3AF; text-align: center; margin-top: 10px; line-height: 1.4;">
            谢谢惠顾，定制式舌型阻鼾器会在1-3个工作日内根据您的三维口腔模型制作完成并包邮寄送。
          </div>
        </div>
        <div style="margin-top: 20px; display: flex; gap: 12px;">
          <t-button variant="outline" @click="handlePrintInvoice" style="display: inline-flex; align-items: center; gap: 4px;"><AppIcon name="print" /> 打印小票</t-button>
          <t-button theme="primary" :loading="checkoutLoading" @click="completeCheckoutSettlement">完成结算</t-button>
        </div>
      </div>

      <div v-else class="dialog-body-form" style="padding: 10px 0;">
        <div style="margin-bottom: 16px; font-size: 14px; color: #374151;">
          正在为患者 <strong>{{ selectedCheckoutRow?.patient }}</strong> 开立收费结算账单：
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

        <button class="btn-add-item" style="margin-bottom: 16px;" @click="addBillingItem"><AppIcon name="plus" />  添加诊疗费/项目/药品</button>

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
          <div style="font-weight: 700; font-size: 12px; color: #374151;"><AppIcon name="truck" />  快递收货地址</div>
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
          <div style="font-weight: 700; font-size: 12px; color: #D97706;"><AppIcon name="pickup" />  缺货自提预订</div>
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

        <!-- Payment Settings Summary Block -->
        <div style="background: #F9FAFB; padding: 14px; border-radius: 8px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; color: #4B5563;">
            <span>项目总额：</span>
            <span>¥{{ (totalAmount / 100).toFixed(2) }}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; color: #4B5563;">
            <span>优惠折扣：</span>
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
            <label class="pay-method-label" :class="{ active: payMethod === 'wechat' }">
              <input v-model="payMethod" type="radio" value="wechat" style="display: none;">
              <AppIcon name="wechat" />  微信支付
            </label>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <t-button theme="default" @click="closeCheckoutDialog">取消</t-button>
          <t-button theme="primary" :loading="checkoutLoading" @click="submitCheckout">确认支付收款 · ¥{{ (payableAmount / 100).toFixed(2) }}</t-button>
        </div>
      </div>
    </t-dialog>

    <!-- 签到预检体征录入弹窗 -->
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
  </div>
</template>

<style scoped>
.dialog-body-form {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

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

.required {
  color: #EF4444;
  margin-left: 2px;
}

.form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 13px;
  color: #1F2937;
  outline: none;
  background: #fff;
  transition: all 150ms ease;
  height: 36px;
  box-sizing: border-box;
}

.form-control:focus {
  border-color: var(--primary-500, #3B6BF5);
  box-shadow: 0 0 0 2px rgba(59, 107, 245, 0.1);
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
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
