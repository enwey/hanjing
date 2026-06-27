<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()
const route = useRoute()

const getTodayDateString = () => {
  const nowInShanghai = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }))
  const y = nowInShanghai.getFullYear()
  const m = String(nowInShanghai.getMonth() + 1).padStart(2, '0')
  const d = String(nowInShanghai.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Filter states matching UI mockup
const activeTab = ref('all') // Default to 'all' (全部)
const filterStore = ref('全部门店')
const filterDoctor = ref('全部医生')
const filterDate = ref('') // No date filter by default
const searchKeyword = ref('')

const currentPage = ref(1)
const pageSize = ref(30)

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

const baseAppointments = [
  { id: '1', patientId: '1', no: 'BK20260529001', patient: '张明华', phone: '13886666789', avatarChar: '张', avatarColor: '#3B6BF5', store: '龙岗总店', doctor: '古堪民', date: '2026-05-29', time: '09:30', type: '复诊', source: '小程序', status: 'arrived' },
  { id: '2', patientId: '2', no: 'BK20260529002', patient: '李雪琴', phone: '13998882345', avatarChar: '李', avatarColor: '#9333EA', store: '龙岗总店', doctor: '王志远', date: '2026-05-29', time: '10:00', type: '初诊', source: '电话', status: 'waiting' },
  { id: '3', patientId: '3', no: 'BK20260529003', patient: '陈建国', phone: '13556788901', avatarChar: '陈', avatarColor: '#F59E0B', store: '福田门诊部', doctor: '古堪民', date: '2026-05-29', time: '10:30', type: '复诊', source: '小程序', status: 'pending' },
  { id: '4', patientId: '4', no: 'BK20260529004', patient: '周小燕', phone: '13667895678', avatarChar: '周', avatarColor: '#10B981', store: '南山分院', doctor: '刘婉清', date: '2026-05-29', time: '11:00', type: '初诊', source: '到店', status: 'cancelled' },
  { id: '5', patientId: '5', no: 'BK20260529005', patient: '吴佳佳', phone: '13778903456', avatarChar: '吴', avatarColor: '#EC4899', store: '龙岗总店', doctor: '王志远', date: '2026-05-29', time: '14:00', type: '复诊', source: '分销推广', status: 'waiting' }
]

const appointments = ref<Appointment[]>([])

const fetchAppointments = async () => {
  try {
    const res: any = await request.get('/api/admin/appointments')
    appointments.value = res.data.map((item: any) => ({
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
  }
}

onMounted(() => {
  fetchAppointments()
})

const storeOptions = [
  { label: '全部门店', value: '全部门店' },
  { label: '龙岗总店', value: '龙岗总店' },
  { label: '南山分院', value: '南山分院' },
  { label: '福田门诊部', value: '福田门诊部' },
]

const doctorOptions = [
  { label: '全部医生', value: '全部医生' },
  { label: '古堪民', value: '古堪民' },
  { label: '王志远', value: '王志远' },
  { label: '刘婉清', value: '刘婉清' },
]

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

const counts = computed(() => {
  let list = appointments.value

  // 1. Search Keyword
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(a => a.patient.includes(kw) || a.no.toLowerCase().includes(kw))
  }

  // 2. Store filter
  if (filterStore.value && filterStore.value !== '全部门店') {
    list = list.filter(a => a.store.includes(filterStore.value))
  }

  // 3. Doctor filter
  if (filterDoctor.value && filterDoctor.value !== '全部医生') {
    list = list.filter(a => a.doctor === filterDoctor.value)
  }

  // If date filter is set, it affects status tabs. Otherwise they show total counts for all dates.
  let statusList = list
  if (filterDate.value) {
    statusList = list.filter(a => a.date === filterDate.value)
  }

  return {
    all: statusList.length,
    today: list.filter(a => a.date === getTodayDateString()).length,
    pending_payment: statusList.filter(a => a.status === 'pending_payment').length,
    pending: statusList.filter(a => a.status === 'pending').length,
    waiting: statusList.filter(a => a.status === 'waiting').length,
    checked_in: statusList.filter(a => a.status === 'checked_in').length,
    completed: statusList.filter(a => a.status === 'completed').length,
    arrived: statusList.filter(a => a.status === 'arrived').length,
    no_show: statusList.filter(a => a.status === 'no_show').length,
    cancelled: statusList.filter(a => a.status === 'cancelled').length,
  }
})

watch([activeTab, filterStore, filterDoctor, filterDate, searchKeyword], () => {
  currentPage.value = 1
})

function getFilteredAppointments() {
  let list = appointments.value

  // 1. Tab filter
  if (activeTab.value === 'today') {
    list = list.filter(a => a.date === getTodayDateString())
  } else if (activeTab.value === 'pending_payment') {
    list = list.filter(a => a.status === 'pending_payment')
  } else if (activeTab.value === 'pending') {
    list = list.filter(a => a.status === 'pending')
  } else if (activeTab.value === 'waiting') {
    list = list.filter(a => a.status === 'waiting')
  } else if (activeTab.value === 'checked_in') {
    list = list.filter(a => a.status === 'checked_in')
  } else if (activeTab.value === 'completed') {
    list = list.filter(a => a.status === 'completed')
  } else if (activeTab.value === 'arrived') {
    list = list.filter(a => a.status === 'arrived')
  } else if (activeTab.value === 'no_show') {
    list = list.filter(a => a.status === 'no_show')
  } else if (activeTab.value === 'cancelled') {
    list = list.filter(a => a.status === 'cancelled')
  }

  // 2. Search Keyword
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(a => a.patient.includes(kw) || a.no.toLowerCase().includes(kw))
  }

  // 3. Store filter
  if (filterStore.value && filterStore.value !== '全部门店') {
    list = list.filter(a => a.store.includes(filterStore.value))
  }

  // 4. Doctor filter
  if (filterDoctor.value && filterDoctor.value !== '全部医生') {
    list = list.filter(a => a.doctor === filterDoctor.value)
  }

  // 5. Date filter
  if (filterDate.value) {
    list = list.filter(a => a.date === filterDate.value)
  }

  return list
}

function handleExport() {
  const list = getFilteredAppointments()
  if (list.length === 0) {
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

  const rows = list.map(item => {
    const escapeCsv = (val: string) => {
      if (val === null || val === undefined) return ''
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }

    const statusLabel = statusMap[item.status]?.label || item.status

    return [
      escapeCsv(item.no),
      escapeCsv(item.patient),
      escapeCsv(item.phone),
      escapeCsv(item.store),
      escapeCsv(item.doctor),
      escapeCsv(item.date),
      escapeCsv(item.time),
      escapeCsv(item.type),
      escapeCsv(item.source),
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
  
  MessagePlugin.success(`成功导出 ${list.length} 条预约记录`)
}

const paginatedAppointments = computed(() => {
  const filtered = getFilteredAppointments()
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
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

async function handleCheckIn(row: Appointment) {
  try {
    await request.put(`/api/admin/appointments/${row.id}`, { status: 'confirmed' })
    MessagePlugin.success(`患者 ${row.patient} 签到成功`)
    fetchAppointments()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('签到失败')
  }
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


// 呼叫广播叫号并更新状态为就诊中
const callPatient = async (row: Appointment) => {
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
  try {
    await request.put(`/api/admin/appointments/${row.id}`, { status: 'checked_in' })
    MessagePlugin.success(`患者 ${row.patient} 已呼叫就诊中`)
    fetchAppointments()
  } catch (error) {
    console.error(error)
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

function addBillingItem() {
  billingItems.value.push({ product_id: '1', product_name: '定制式可调舌型阻鼾器 HJ-MAD-03', price: 298000, quantity: 1 })
}

function removeBillingItem(idx: number) {
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


function openCheckoutDialog(row: Appointment) {
  selectedCheckoutRow.value = row
  if (row.status === 'pending_payment') {
    const items = []
    if (row.consult_fee && row.consult_fee > 0) {
      items.push({ product_id: '4', product_name: `${row.doctor}医生挂号门诊费`, price: row.consult_fee, quantity: 1 })
    }
    if (row.deposit_amount && row.deposit_amount > 0) {
      items.push({ product_id: '8', product_name: '就诊预约定金', price: row.deposit_amount, quantity: 1 })
    }
    billingItems.value = items.length > 0 ? items : [
      { product_id: '4', product_name: '门诊挂号就诊费', price: 20000, quantity: 1 }
    ]
  } else {
    billingItems.value = [
      { product_id: '4', product_name: '诊所首诊挂号门诊费', price: 20000, quantity: 1 }
    ]
  }
  discountAmount.value = row.status === 'pending_payment' ? 0 : 3000
  payMethod.value = 'wechat'
  checkoutSuccess.value = false
  orderResult.value = null
  
  deliveryType.value = 'offline_direct'
  shippingReceiver.value = row.patient || ''
  shippingPhone.value = row.phone || ''
  shippingAddressStr.value = ''
  
  checkoutVisible.value = true
}

function closeCheckoutDialog() {
  checkoutVisible.value = false
  selectedCheckoutRow.value = null
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
  checkoutLoading.value = true
  try {
    let orderType = 'offline'
    let orderStatus = 'completed'
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
        detail: shippingAddressStr.value
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
        detail: '缺货登记（待货通知自提）'
      }
    } else {
      orderType = 'offline'
      orderStatus = 'completed'
      shipAddr = {
        receiver: shippingReceiver.value || '到店客户',
        phone: shippingPhone.value || '--',
        province: '广东省',
        city: '深圳市',
        district: '到店自提',
        detail: '现场拿走'
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
      try {
        const nextStatus = selectedCheckoutRow.value.status === 'pending_payment' ? 'pending' : 'arrived'
        await request.put(`/api/admin/appointments/${selectedCheckoutRow.value.id}`, { status: nextStatus })
      } catch (err) {
        console.error('更新预约结算状态失败:', err)
      }
      MessagePlugin.success('收银收费结算交易成功！')
      orderResult.value = {
        orderNo: res.data.order_no,
        patientName: selectedCheckoutRow.value.patient,
        total: (totalAmount.value / 100).toFixed(2),
        discount: (discountAmount.value / 100).toFixed(2),
        payable: (payableAmount.value / 100).toFixed(2),
        payMethodText: payMethod.value === 'wechat' ? '微信支付' : payMethod.value === 'alipay' ? '支付宝' : 'POS线下刷卡',
        time: new Date().toLocaleString()
      }
      checkoutSuccess.value = true
      fetchAppointments()
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
        <t-button theme="default" variant="outline" @click="handleExport">📥 导出</t-button>
        <t-button theme="primary" @click="router.push('/appointment/create')">➕ 新建预约</t-button>
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
          <t-date-picker v-model="filterDate" style="width: 135px;" clearable placeholder="选择日期" />
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
                  <button
                    v-if="row.status === 'pending_payment'"
                    class="btn btn-xs btn-danger"
                    @click="cancelStatus(row.id)"
                  >取消</button>

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
                  <button
                    v-if="row.status === 'pending'"
                    class="btn btn-xs btn-danger"
                    @click="cancelStatus(row.id)"
                  >取消</button>
                  
                  <!-- status is waiting (候诊中) -->
                  <button
                    v-if="row.status === 'waiting'"
                    class="btn btn-xs btn-warning"
                    @click="callPatient(row)"
                  >📢 叫号</button>
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
          :total="getFilteredAppointments().length"
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
          <div v-for="item in billingItems" :key="item.product_id" style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
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
          <t-button variant="outline" @click="handlePrintInvoice">🖨️ 打印小票</t-button>
          <t-button theme="primary" @click="closeCheckoutDialog">完成结算</t-button>
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

        <button class="btn-add-item" style="margin-bottom: 16px;" @click="addBillingItem">➕ 添加诊疗费/项目/药品</button>

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
          <div style="font-weight: 700; font-size: 12px; color: #374151;">🚚 快递收货地址</div>
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
          <div style="font-weight: 700; font-size: 12px; color: #D97706;">🏪 缺货自提预订</div>
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
              🟢 微信支付
            </label>
            <label class="pay-method-label" :class="{ active: payMethod === 'alipay' }">
              <input v-model="payMethod" type="radio" value="alipay" style="display: none;">
              🔵 支付宝
            </label>
            <label class="pay-method-label" :class="{ active: payMethod === 'pos' }">
              <input v-model="payMethod" type="radio" value="pos" style="display: none;">
              🪙 现金/刷卡
            </label>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <t-button theme="default" @click="closeCheckoutDialog">取消</t-button>
          <t-button theme="primary" :loading="checkoutLoading" @click="submitCheckout">确认支付收款 · ¥{{ (payableAmount / 100).toFixed(2) }}</t-button>
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
