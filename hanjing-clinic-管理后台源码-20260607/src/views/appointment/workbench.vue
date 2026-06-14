<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
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
  status: string; // pending, confirmed (waiting/arrived), completed (done)
  pre_exam?: {
    height?: number;
    weight?: number;
    systolic_bp?: number;
    diastolic_bp?: number;
    neck_circumference?: number;
    bmi?: number;
  };
}

const appointments = ref<QueueItem[]>([])
const doctorsList = ref<any[]>([])
const selectedDoctorId = ref<string>('')
const loading = ref(false)
const activeTimeSlot = ref('all')
const rightPaneTab = ref('waiting') // waiting, completed

// Fetch all doctors to populate selector
const fetchDoctors = async () => {
  try {
    const res: any = await request.get('/api/admin/doctors')
    if (res.code === 200) {
      doctorsList.value = res.data
      if (res.data.length > 0 && !selectedDoctorId.value) {
        selectedDoctorId.value = res.data[0].id.toString()
      }
    }
  } catch (error) {
    console.error('获取医生数据失败:', error)
  }
}

// Fetch queue appointments
const fetchAppointments = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/api/admin/appointments')
    const mapped = res.data.map((item: any) => ({
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
      status: item.status,
      pre_exam: item.pre_exam || null
    }))

    // For each appointment, fetch its pre-exam vitals if confirmed or completed
    for (const appt of mapped) {
      if (appt.status === 'confirmed' || appt.status === 'completed') {
        try {
          const preRes: any = await request.get(`/api/admin/appointments/${appt.id}`)
          if (preRes.code === 200 && preRes.data && preRes.data.pre_exam) {
            appt.pre_exam = preRes.data.pre_exam
          }
        } catch (e) {
          // ignore
        }
      }
    }
    appointments.value = mapped
  } catch (error) {
    console.error(error)
    MessagePlugin.error('获取排队队列数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await fetchDoctors()
  await fetchAppointments()
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
    if (item.doctorId === selectedDoctorId.value && item.status !== 'completed' && item.timeSlot) {
      slots.add(item.timeSlot)
    }
  })
  return Array.from(slots).sort()
})

const allWaitingItems = computed(() => {
  return appointments.value.filter(item => item.doctorId === selectedDoctorId.value && item.status !== 'completed')
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

// Doctor's active treating patient (first 'confirmed' appointment)
const currentPatient = computed(() => {
  return appointments.value.find(item => item.doctorId === selectedDoctorId.value && item.status === 'confirmed') || null
})

// Doctor's waiting queue (excluding the active currentPatient)
const waitingQueue = computed(() => {
  const list = appointments.value.filter(item => {
    if (item.doctorId !== selectedDoctorId.value) return false
    if (item.status === 'completed') return false
    if (currentPatient.value && item.id === currentPatient.value.id) return false
    return true
  })
  
  if (activeTimeSlot.value !== 'all') {
    return list.filter(item => item.timeSlot === activeTimeSlot.value)
  }
  return list
})

// Doctor's completed queue for today
const completedQueue = computed(() => {
  return appointments.value.filter(item => item.doctorId === selectedDoctorId.value && item.status === 'completed')
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

const openCheckInDialog = (item: QueueItem) => {
  selectedQueueItem.value = item
  checkInForm.value = {
    height: '172',
    weight: '75',
    systolicBp: '128',
    diastolicBp: '82',
    neckCircumference: '38.5'
  }
  checkInVisible.value = true
}

const closeCheckInDialog = () => {
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
    await fetchAppointments()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('签到保存失败')
  }
}

// Call next patient / Call selected patient to active seat
const handleCallToConsult = (item: QueueItem) => {
  if (currentPatient.value) {
    MessagePlugin.warning('当前已有接诊中患者，请先录入病历或将其移出诊室')
    return
  }
  callPatient(item.patientName, item.doctorName)
  if (item.status === 'pending') {
    openCheckInDialog(item)
  } else {
    MessagePlugin.success(`正在接诊患者 [${item.patientName}]`)
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

const productOptions = [
  { id: '1', name: '定制式可调舌型阻鼾器 HJ-MAD-03', price: 298000 },
  { id: '2', name: '鼾静阻鼾器专用清洁泡腾片 (60片/盒)', price: 4900 },
  { id: '3', name: '鼾静智能阻鼾舒眠记忆枕', price: 29900 },
  { id: '4', name: '诊所首诊挂号门诊费', price: 20000 },
  { id: '5', name: '诊所专家诊断评估费', price: 50000 }
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

async function submitCheckout() {
  if (!selectedQueueItem.value) return
  if (billingItems.value.length === 0) {
    MessagePlugin.warning('结账明细不能为空')
    return
  }
  checkoutLoading.value = true
  try {
    const payload = {
      patient_id: parseInt(selectedQueueItem.value.patientId, 10),
      items: billingItems.value,
      pay_amount: payableAmount.value,
      discount_amount: discountAmount.value,
      pay_method: payMethod.value
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
const apptStore = ref('🏥 鼾静健康·龙岗总店')
const apptDate = ref(new Date().toISOString().split('T')[0])
const apptSlot = ref('09:30')
const apptVisitType = ref('复诊')
const apptRemarks = ref('')
const apptPatientCreateVisible = ref(false)

function openCreateApptDialog() {
  apptSearchQuery.value = ''
  apptSelectedPatient.value = null
  apptDate.value = new Date().toISOString().split('T')[0]
  apptSlot.value = '09:30'
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
    const payload = {
      patient_id: parseInt(apptSelectedPatient.value.id, 10),
      store_id: currentDoctor.value?.store_id || 1,
      doctor_id: parseInt(selectedDoctorId.value, 10),
      schedule_id: 1, // seed placeholder
      appointment_date: apptDate.value,
      appointment_time: apptSlot.value,
      type: apptVisitType.value === '复诊' ? 'return' : 'first',
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
        <div class="page-title">🩺 医生专属接诊工作台</div>
        <div class="page-title-sub">独立诊室呼叫、体征查阅、病历处方录入与费用结算</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <t-button theme="primary" variant="outline" @click="fetchAppointments" :loading="loading">
          🔄 刷新队列
        </t-button>
        <t-button theme="primary" @click="openCreateApptDialog">
          ➕ 现场登记挂号
        </t-button>
      </div>
    </div>

    <!-- Doctor selector workbench bar -->
    <div class="panel">
      <div class="doctor-selector-bar">
        <div class="selector-left">
          <span class="selector-lbl">当前接诊诊室：</span>
          <select v-model="selectedDoctorId" class="selector-dropdown" @change="activeTimeSlot = 'all'">
            <option v-for="d in doctorsList" :key="d.id" :value="d.id.toString()">
              👨‍⚕️ {{ d.name }} · {{ d.title }} ({{ d.specialty }})
            </option>
          </select>
        </div>
        <div class="selector-right">
          <span>🏥 当前门店：{{ currentStoreName }}</span>
          <span class="separator">|</span>
          <span>科室：睡眠呼吸障碍治疗门诊</span>
        </div>
      </div>
    </div>

    <!-- Main Workspace Layout -->
    <div class="workbench-layout">
      <!-- Left Panel: Currently Treating Patient -->
      <div class="workbench-left panel">
        <div class="pane-header">
          <div class="pane-title">🔊 当前诊室就诊中</div>
          <span v-if="currentPatient" class="status-tag green">就诊中</span>
          <span v-else class="status-tag gray">空闲</span>
        </div>

        <div v-if="currentPatient" class="active-patient-card">
          <!-- Vitals Header -->
          <div class="patient-main-info">
            <div class="avatar-logo">
              {{ currentPatient.patientName.charAt(0) }}
            </div>
            <div>
              <div class="active-pat-name">{{ currentPatient.patientName }}</div>
              <div class="active-pat-sub">
                {{ currentPatient.phone }} · {{ currentPatient.timeSlot }} 预约挂号
              </div>
            </div>
          </div>

          <!-- Pre-exam Vitals -->
          <div class="vitals-section">
            <div class="section-sub-title">🩺 预检体征数据 (由分诊/护士录入)</div>
            
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
            <div v-else class="vitals-empty">
              ⚠️ 该患者尚未录入身高、血压等预检体征信息，建议点击右侧“签到/录入”完善指标。
            </div>
          </div>

          <!-- Symptoms complaint -->
          <div class="complaint-section">
            <span class="complaint-lbl">📋 就诊主诉与描述：</span>
            <p class="complaint-val">{{ currentPatient.symptom }}</p>
          </div>

          <!-- Consultation Actions -->
          <div class="consult-actions">
            <t-button block size="medium" theme="primary" @click="goToEmr(currentPatient)">
              📝 开始看诊 & 录入病历处方
            </t-button>
            <div class="actions-row">
              <t-button size="medium" theme="warning" variant="outline" style="flex: 1;" @click="openCheckoutDialog(currentPatient)">
                💰 诊后划扣收费
              </t-button>
              <t-button size="medium" theme="default" variant="outline" style="flex: 1;" @click="callPatient(currentPatient.patientName, currentPatient.doctorName)">
                🔊 再次呼叫叫号
              </t-button>
            </div>
          </div>
        </div>

        <div v-else class="active-patient-empty">
          <div class="empty-icon">🛋️</div>
          <div class="empty-title">诊室当前空闲中</div>
          <p class="empty-desc">
            目前没有正在就诊中的患者。请从右侧的“候诊队列”中点击“呼叫接诊”邀请下一位患者进入诊室就诊。
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
          >
            ⏳ 等待就诊 ({{ waitingQueue.length }}人)
          </div>
          <div 
            class="pane-tab" 
            :class="{ active: rightPaneTab === 'completed' }" 
            @click="rightPaneTab = 'completed'"
          >
            ✅ 今日已诊 ({{ completedQueue.length }}人)
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
              <div class="queue-item-left">
                <span class="queue-idx">{{ idx + 1 }}</span>
                <div>
                  <div class="queue-name font-bold">{{ item.patientName }}</div>
                  <div class="queue-meta">
                    {{ item.timeSlot }} · 
                    <span :class="item.status === 'pending' ? 'status-pending' : 'status-arrived'">
                      {{ item.status === 'pending' ? '待报到签到' : '候诊中' }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="queue-item-right">
                <t-button v-if="item.status === 'pending'" size="extra-small" theme="warning" variant="outline" @click="openCheckInDialog(item)">
                  签到
                </t-button>
                <t-button v-else size="extra-small" theme="primary" variant="outline" @click="handleCallToConsult(item)">
                  呼叫接诊
                </t-button>
                <t-button size="extra-small" theme="default" variant="text" @click="delayPatient(item)">
                  顺延
                </t-button>
              </div>
            </div>
            
            <div v-if="waitingQueue.length === 0" class="no-queue-state">
              🎉 候诊队列为空，今日接诊任务完成！
            </div>
          </div>
        </div>

        <!-- Tab Content 2: Completed List -->
        <div v-else class="queue-tab-content">
          <div class="queue-list">
            <div v-for="item in completedQueue" :key="item.id" class="queue-item-row completed">
              <div class="queue-item-left">
                <span class="queue-idx checked">✓</span>
                <div>
                  <div class="queue-name font-bold">{{ item.patientName }}</div>
                  <div class="queue-meta">已完成就诊 · {{ item.timeSlot }}</div>
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

    <!-- 签到预检体征录入弹窗 -->
    <t-dialog
      v-model:visible="checkInVisible"
      header="患者报到签到 & 预检体征录入"
      width="480px"
      confirm-btn="确认签到"
      cancel-btn="取消"
      @confirm="handleCheckInSubmit"
      @cancel="closeCheckInDialog"
    >
      <div class="dialog-body-form" style="padding: 10px 0;">
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">就诊人姓名</label>
          <input type="text" class="form-control" :value="selectedQueueItem?.patientName" disabled style="background-color: #F3F4F6;">
        </div>
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">身高 (cm) <span class="required" style="color: #EF4444;">*</span></label>
          <input v-model="checkInForm.height" type="number" class="form-control" placeholder="输入身高（例如：175）">
        </div>
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">体重 (kg) <span class="required" style="color: #EF4444;">*</span></label>
          <input v-model="checkInForm.weight" type="number" class="form-control" placeholder="输入体重（例如：70）">
        </div>
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">血压 (收缩压/舒张压, mmHg)</label>
          <div style="display: flex; gap: 10px;">
            <input v-model="checkInForm.systolicBp" type="number" class="form-control" placeholder="高压 (如：120)" style="flex: 1;">
            <input v-model="checkInForm.diastolicBp" type="number" class="form-control" placeholder="低压 (如：80)" style="flex: 1;">
          </div>
        </div>
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">颈围 (cm)</label>
          <input v-model="checkInForm.neckCircumference" type="number" step="0.1" class="form-control" placeholder="输入测量颈围（例如：38）">
        </div>
        <div v-if="computedBmi" style="margin-top: 10px; font-size: 13px; color: #1E40AF; background: #EFF6FF; padding: 10px; border-radius: 6px;">
          💡 自动推算患者 BMI 指数：<strong>{{ computedBmi }}</strong>
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

          <button class="btn-add-item" style="margin-bottom: 16px;" @click="addBillingItem">➕ 添加诊疗费/项目/药品</button>

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
              <label class="pay-method-label" :class="{ active: payMethod === 'wechat' }">
                <input v-model="payMethod" type="radio" value="wechat" style="display: none;">
                🟢 微信支付
              </label>
              <label class="pay-method-label" :class="{ active: payMethod === 'alipay' }">
                <input v-model="payMethod" type="radio" value="alipay" style="display: none;">
                🔵 支付宝
              </label>
              <label class="pay-method-label" :class="{ active: payMethod === 'cash' }">
                <input v-model="payMethod" type="radio" value="cash" style="display: none;">
                🪙 现金/刷卡
              </label>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <t-button theme="default" @click="closeCheckoutDialog">取消</t-button>
            <t-button theme="primary" :loading="checkoutLoading" @click="submitCheckout">确认支付收款</t-button>
          </div>
        </div>

        <!-- Checkout Success state -->
        <div v-else style="text-align: center; padding: 20px 0;">
          <div style="font-size: 48px; color: #22C55E; margin-bottom: 16px;">✓</div>
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
            <t-button theme="primary" variant="outline" @click="handlePrintInvoice">🖨️ 打印交易小票</t-button>
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
  margin-bottom: 16px;
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
  overflow-y: auto;
  padding: 16px;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
