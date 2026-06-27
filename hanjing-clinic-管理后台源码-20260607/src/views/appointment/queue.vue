<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import PatientCreateDialog from '@/components/PatientCreateDialog.vue'

const router = useRouter()

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
  status: string;
}

const appointments = ref<QueueItem[]>([])
const loading = ref(false)

const fetchAppointments = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/api/admin/appointments')
    appointments.value = res.data.map((item: any) => ({
      id: item.id.toString(),
      patientId: item.patient_id.toString(),
      no: item.appointment_no,
      patientName: item.patient_name,
      phone: item.patient_phone,
      doctorName: item.doctor_name,
      doctorId: item.doctor_id.toString(),
      storeName: item.store_name,
      timeSlot: item.appointment_time,
      symptom: item.symptom_desc || '无主诉描述',
      status: item.status // pending, confirmed (waiting), completed (arrived)
    }))
  } catch (error) {
    console.error(error)
    MessagePlugin.error('获取排队数据失败')
  } finally {
    loading.value = false
  }
}

// Time slot filter state
const activeTimeSlot = ref('all')

// Extract all waiting list items globally to count slots and show numbers
const allWaitingItems = computed(() => {
  return appointments.value.filter(item => item.status === 'confirmed' || item.status === 'pending')
})

// Dynamically extract and sort unique time slots that have waiting patients
const uniqueTimeSlots = computed(() => {
  const slots = new Set<string>()
  allWaitingItems.value.forEach(item => {
    if (item.timeSlot) {
      slots.add(item.timeSlot)
    }
  })
  return Array.from(slots).sort()
})

// Count waiting patients in a specific time slot
function getSlotCount(slot: string) {
  return allWaitingItems.value.filter(item => item.timeSlot === slot).length
}

// Get doctor avatar background color
function getDoctorAvatarBg(doctorId: string) {
  const gradients = [
    'linear-gradient(135deg, #3B6BF5, #2A52D4)',
    'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    'linear-gradient(135deg, #EC4899, #BE185D)',
    'linear-gradient(135deg, #10B981, #047857)'
  ]
  const idx = parseInt(doctorId) || 0
  return gradients[idx % gradients.length]
}

// Badge style for filter tabs
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

// Group appointments by doctor
const doctorQueues = computed(() => {
  const queues: Record<string, { doctorName: string; storeName: string; waitingList: QueueItem[]; current: QueueItem | null }> = {}
  
  appointments.value.forEach(item => {
    // Only show today's or pending/confirmed/checked_in in the queue
    if (item.status === 'completed' || item.status === 'arrived') return
    
    if (!queues[item.doctorId]) {
      queues[item.doctorId] = {
        doctorName: item.doctorName,
        storeName: item.storeName,
        waitingList: [],
        current: null
      }
    }
    
    if (item.status === 'checked_in') {
      queues[item.doctorId].current = item
    } else if (item.status === 'confirmed') {
      queues[item.doctorId].waitingList.push(item)
    } else if (item.status === 'pending') {
      queues[item.doctorId].waitingList.push(item)
    }
  })
  
  return Object.entries(queues).map(([id, queue]) => {
    // Filter waitingList by activeTimeSlot
    let filteredList = queue.waitingList
    if (activeTimeSlot.value !== 'all') {
      filteredList = queue.waitingList.filter(item => item.timeSlot === activeTimeSlot.value)
    }
    return {
      doctorId: id,
      doctorName: queue.doctorName,
      storeName: queue.storeName,
      current: queue.current,
      waitingList: filteredList
    }
  })
})

// Call patient voice broadcast and update status to checked_in (就诊中)
const callPatient = async (item: QueueItem, doctorName: string) => {
  if ('speechSynthesis' in window) {
    const text = `请患者 ${item.patientName}，到 ${doctorName} 医生诊室就诊。`
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
    MessagePlugin.success(`呼叫广播成功: "${text}"`)
  } else {
    MessagePlugin.warning('浏览器不支持语音播报，已通过系统弹窗提示')
  }
  try {
    await request.put(`/api/admin/appointments/${item.id}`, { status: 'checked_in' })
    fetchAppointments()
  } catch (error) {
    console.error('更新就诊状态失败:', error)
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
  if (h > 0 && w > 0) {
    return (w / ((h / 100) * (h / 100))).toFixed(1)
  }
  return ''
})

function openCheckInDialog(item: QueueItem) {
  selectedQueueItem.value = item
  checkInForm.value = {
    height: '',
    weight: '',
    systolicBp: '',
    diastolicBp: '',
    neckCircumference: ''
  }
  checkInVisible.value = true
}

function closeCheckInDialog() {
  checkInVisible.value = false
  selectedQueueItem.value = null
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
    fetchAppointments()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('签到保存失败')
  }
}

// Start treatment (sign-in triage)
const startTreatment = (item: QueueItem) => {
  openCheckInDialog(item)
}

// Complete treatment
const completeTreatment = async (item: QueueItem) => {
  try {
    await request.put(`/api/admin/appointments/${item.id}`, { status: 'completed' })
    MessagePlugin.success(`患者 ${item.patientName} 诊疗已完成`)
    fetchAppointments()
    // Directly open checkout cashier dialog
    openCheckoutDialog(item)
  } catch (error) {
    console.error(error)
  }
}

// Cashier Checkout dialog state & actions inside queue console
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
  shippingReceiver.value = item.patientName || ''
  shippingPhone.value = item.phone || ''
  shippingAddressStr.value = ''
  
  checkoutVisible.value = true
}

function closeCheckoutDialog() {
  checkoutVisible.value = false
  selectedQueueItem.value = null
}

function goToEmr(item: QueueItem) {
  router.push(`/appointment/emr/${item.id}`)
}

function handlePrintInvoice() {
  MessagePlugin.success('已发送打印指令，正在打印交易凭证小票...')
}

async function submitCheckout() {
  if (!selectedQueueItem.value) return
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
      try {
        await request.put(`/api/admin/appointments/${selectedQueueItem.value.id}`, { status: 'arrived' })
      } catch (err) {
        console.error('更新预约结算状态失败:', err)
      }
      MessagePlugin.success('收银收费结算交易成功！')
      orderResult.value = {
        orderNo: res.data.order_no,
        patientName: selectedQueueItem.value.patientName,
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

// Move patient down the queue (顺延)
const delayPatient = (item: QueueItem) => {
  // Local swap for simulation
  const index = appointments.value.findIndex(a => a.id === item.id)
  if (index !== -1) {
    const [moved] = appointments.value.splice(index, 1)
    appointments.value.push(moved) // move to end
    MessagePlugin.success(`已将 ${item.patientName} 的顺序往后顺延`)
  }
}

onMounted(() => {
  fetchAppointments()
})

// Walk-in Registration dialog states & actions
const createApptVisible = ref(false)
const apptSearchQuery = ref('')
const apptSelectedPatient = ref<any>(null)
const apptStore = ref('🏥 鼾静健康·龙岗总店')
const apptDoctor = ref('古堪民 · 主任医师 · 睡眠呼吸科')
const apptDate = ref('2026-05-29')
const apptSlot = ref('09:30')
const apptVisitType = ref('复诊')
const apptPromoterId = ref<string | null>(null)
const apptRemarks = ref('')

const apptPatientCreateVisible = ref(false)

function openCreateApptDialog() {
  apptSearchQuery.value = ''
  apptSelectedPatient.value = null
  apptStore.value = '🏥 鼾静健康·龙岗总店'
  apptDoctor.value = '古堪民 · 主任医师 · 睡眠呼吸科'
  apptDate.value = '2026-05-29'
  apptSlot.value = '09:30'
  apptVisitType.value = '复诊'
  apptPromoterId.value = null
  apptRemarks.value = ''
  createApptVisible.value = true
}

function closeCreateApptDialog() {
  createApptVisible.value = false
}

async function handlePatientSearch() {
  const q = apptSearchQuery.value.trim()
  if (!q) {
    MessagePlugin.warning('请输入患者姓名或手机号搜索')
    return
  }
  try {
    const res: any = await request.get(`/api/admin/patients?search=${q}`)
    if (res.data && res.data.length > 0) {
      const found = res.data[0]
      apptSelectedPatient.value = {
        id: found.id.toString(),
        name: found.name,
        gender: found.gender === 1 ? '男' : '女',
        phone: found.phone || found.user_phone
      }
      MessagePlugin.success(`已自动选择患者 [${found.name}]`)
    } else {
      MessagePlugin.info('未找到匹配的已有患者，您可以直接点击 “建档” 按钮录入新患者')
    }
  } catch (error) {
    console.error(error)
  }
}

function openNewPatientCreate() {
  apptPatientCreateVisible.value = true
}

function handleNewPatientSuccess(newP: any) {
  apptSelectedPatient.value = {
    id: newP.id.toString(),
    name: newP.name,
    gender: newP.gender,
    phone: newP.phone
  }
  apptPatientCreateVisible.value = false
}

async function handleCreateApptSubmit() {
  if (!apptSelectedPatient.value) {
    MessagePlugin.error('请先选择或建档患者')
    return
  }

  let storeId = 1
  if (apptStore.value.includes('南山分院')) storeId = 2
  else if (apptStore.value.includes('福田门诊部')) storeId = 3

  let doctorId = 1
  if (apptDoctor.value.includes('王志远')) doctorId = 2
  else if (apptDoctor.value.includes('刘婉清')) doctorId = 3

  const slotHour = parseInt(apptSlot.value.split(':')[0])
  const period = slotHour < 12 ? 'morning' : 'afternoon'

  try {
    await request.post('/api/admin/appointments', {
      patient_id: parseInt(apptSelectedPatient.value.id),
      store_id: storeId,
      doctor_id: doctorId,
      date: apptDate.value,
      period: period,
      time: apptSlot.value,
      type: apptVisitType.value === '初诊' ? 'first' : 'followup',
      symptom_desc: apptRemarks.value
    })

    if (apptPromoterId.value) {
      try {
        await request.post(`/api/admin/patients/${apptSelectedPatient.value.id}/bind-promoter`, {
          promoter_user_id: parseInt(apptPromoterId.value)
        })
      } catch (bindErr) {
        console.error('绑定推荐人失败:', bindErr)
      }
    }

    MessagePlugin.success('现场挂号新建预约成功')
    createApptVisible.value = false
    fetchAppointments()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('挂号新建预约失败')
  }
}

// Today's appointments list search & filter
const apptListSearch = ref('')
const filteredTodayAppointments = computed(() => {
  let list = appointments.value
  if (apptListSearch.value) {
    const kw = apptListSearch.value.toLowerCase()
    list = list.filter(a => a.patientName.includes(kw) || a.no.toLowerCase().includes(kw))
  }
  return list
})
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">排队分诊控制台</div>
        <div class="page-title-sub">实时呼叫、就诊安排与队列顺延管理</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <t-button theme="primary" variant="outline" @click="fetchAppointments" :loading="loading">
          🔄 刷新队列
        </t-button>
        <t-button theme="primary" @click="router.push('/appointment/create?from=queue')">➕ 新建预约</t-button>
      </div>
    </div>

    <!-- 时段过滤面板 -->
    <div class="panel">
      <div class="filter-bar" style="flex-wrap: wrap; gap: 16px; border-bottom: none; padding: 12px 20px;">
        <div class="filter-tabs" style="flex-wrap: wrap; gap: 8px;">
          <div
            class="filter-tab"
            :class="{ active: activeTimeSlot === 'all' }"
            @click="activeTimeSlot = 'all'"
            :style="{
              display: 'flex',
              alignItems: 'center',
              borderRadius: '20px',
              borderLeft: activeTimeSlot === 'all' ? '1px solid var(--primary-500)' : '1px solid #E5E7EB',
              marginLeft: '0'
            }"
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
            :style="{
              display: 'flex',
              alignItems: 'center',
              borderRadius: '20px',
              borderLeft: activeTimeSlot === slot ? '1px solid var(--primary-500)' : '1px solid #E5E7EB',
              marginLeft: '0'
            }"
          >
            <span>{{ slot }}</span>
            <span :style="getBadgeStyle(activeTimeSlot === slot)">
              {{ getSlotCount(slot) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="doctorQueues.length === 0" class="empty-state">
      <div style="font-size: 48px; margin-bottom: 16px;">👥</div>
      <div style="font-size: 16px; color: #4B5563; font-weight: 500;">今日暂无排队候诊中的患者</div>
      <div style="font-size: 12px; color: #9CA3AF; margin-top: 8px;">小程序端预约确认或前台登记后，数据将在此同步。</div>
    </div>

    <div v-else class="queue-grid">
      <div v-for="q in doctorQueues" :key="q.doctorId" class="doctor-card">
        <div class="doctor-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <!-- Doctor Avatar -->
            <div :style="{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: getDoctorAvatarBg(q.doctorId),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              color: '#fff',
              fontWeight: '700',
              flexShrink: 0
            }">
              {{ q.doctorName.charAt(0) }}
            </div>
            <div>
              <div class="doc-name">{{ q.doctorName }}</div>
              <div class="doc-sub">{{ q.storeName }} · 睡眠门诊</div>
            </div>
          </div>
          <t-tag theme="primary" size="small">就诊室</t-tag>
        </div>

        <!-- Current Patient -->
        <div class="current-section">
          <div class="section-title">🔊 当前就诊中</div>
          <div v-if="q.current" class="current-patient-card">
            <div class="patient-info">
              <div class="pat-name">{{ q.current.patientName }}</div>
              <div class="pat-time">预约时段: {{ q.current.timeSlot }}</div>
            </div>
            <div class="action-row">
              <t-button size="extra-small" theme="primary" variant="outline" @click="callPatient(q.current, q.doctorName)">
                叫号
              </t-button>
              <t-button size="extra-small" theme="warning" variant="outline" @click="openCheckoutDialog(q.current)">
                收银
              </t-button>
            </div>
          </div>
          <div v-else class="no-patient">
            当前无就诊中患者，请呼叫下一位
          </div>
        </div>

        <!-- Waiting List -->
        <div class="waiting-section">
          <div class="section-title">⏳ 候诊队列 ({{ q.waitingList.length }}人)</div>
          <div class="waiting-list">
            <div v-for="(item, idx) in q.waitingList" :key="item.id" class="waiting-item">
              <div class="wait-left">
                <span class="wait-idx">{{ idx + 1 }}</span>
                <div>
                  <div class="wait-name">{{ item.patientName }}</div>
                  <div class="wait-time">{{ item.timeSlot }} · {{ item.status === 'pending' ? '已预约' : '候诊中' }}</div>
                </div>
              </div>
              <div class="wait-right">
                <t-button v-if="item.status === 'pending'" size="extra-small" theme="warning" variant="outline" @click="startTreatment(item)">
                  签到
                </t-button>
                <t-button v-else size="extra-small" theme="primary" variant="outline" @click="callPatient(item, q.doctorName)">
                  叫号
                </t-button>
                <t-button size="extra-small" theme="default" variant="text" @click="delayPatient(item)">
                  顺延
                </t-button>
              </div>
            </div>
            <div v-if="q.waitingList.length === 0" class="no-waiting">
              队列为空
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 签到预检体征录入弹窗 -->
    <t-dialog
      v-model:visible="checkInVisible"
      header="到店签到 & 预检体征录入"
      width="480px"
      confirm-btn="确认签到"
      cancel-btn="取消"
      @confirm="handleCheckInSubmit"
      @cancel="closeCheckInDialog"
    >
      <div class="dialog-body-form" style="padding: 10px 0;">
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">患者姓名</label>
          <input type="text" class="form-control" :value="selectedQueueItem?.patientName" disabled style="background-color: #F3F4F6; width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none;">
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
          <input type="text" class="form-control" :value="computedBmi" disabled placeholder="输入身高体重后自动计算" style="background-color: #F3F4F6; width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none;">
        </div>
      </div>
    </t-dialog>

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
          正在为患者 <strong>{{ selectedQueueItem?.patientName }}</strong> 开立收费结算账单：
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
.empty-state {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 60px 20px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.queue-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 20px;
}
.doctor-card {
  background: #FFFFFF;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  border: 1px solid #E5E7EB;
  display: flex;
  flex-direction: column;
}
.doctor-header {
  padding: 16px;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.doc-name {
  font-size: 16px;
  font-weight: 700;
  color: #1F2937;
}
.doc-sub {
  font-size: 12px;
  color: #6B7280;
  margin-top: 2px;
}
.current-section {
  padding: 16px;
  border-bottom: 1px solid #E5E7EB;
  background: #EEF4FF;
}
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
  margin-bottom: 10px;
  text-transform: uppercase;
}
.current-patient-card {
  background: #FFFFFF;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #BFDBFE;
  box-shadow: 0 2px 4px rgba(59, 107, 245, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.patient-info {
  margin-bottom: 0;
}
.pat-name {
  font-size: 16px;
  font-weight: 700;
  color: #1F2937;
}
.pat-time {
  font-size: 12px;
  color: #4B5563;
  margin-top: 2px;
}
.action-row {
  display: flex;
  gap: 8px;
}
.no-patient {
  background: #FFFFFF;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  color: #9CA3AF;
  font-size: 12px;
  border: 1px dashed #D1D5DB;
}
.waiting-section {
  padding: 16px;
  flex: 1;
}
.waiting-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
}
.waiting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #F9FAFB;
  border-radius: 6px;
  border: 1px solid #E5E7EB;
}
.wait-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.wait-idx {
  font-size: 14px;
  font-weight: 700;
  color: #9CA3AF;
  background: #E5E7EB;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wait-name {
  font-size: 14px;
  font-weight: 600;
  color: #1F2937;
}
.wait-time {
  font-size: 11px;
  color: #6B7280;
}
.wait-right {
  display: flex;
  gap: 4px;
  align-items: center;
}
.no-waiting {
  text-align: center;
  color: #9CA3AF;
  font-size: 12px;
  padding: 20px 0;
}

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
