<script setup lang="ts">
import { genderLabel, genderColor } from '@/utils/gender'
import AppointmentChargeDialog from '@/components/AppointmentChargeDialog.vue'
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'
import PatientCreateDialog from '@/components/PatientCreateDialog.vue'
import { navigateToParent } from '@/utils/routeNavigation'


const router = useRouter()
const route = useRoute()

const isReschedule = ref(route.query.reschedule === '1')
const rescheduleId = ref(route.query.id as string || '')
const storeIdFromQuery = route.query.store_id as string
const doctorIdFromQuery = route.query.doctor_id as string
const patientIdFromQuery = route.query.patient_id as string

/* ---- State Management ---- */
const searchQuery = ref('')
const selectedPatient = ref<any>(null)
const selectedPatientId = ref('')
const isSearching = ref(false)
const searchResults = ref<any[]>([])
const patientOptions = ref<Array<{ label: string; value: string }>>([])
const selectedStore = ref('')
const selectedDoctor = ref('')

const getLocalTodayStr = () => {
  const d = new Date()
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000)
  const shanghaiDate = new Date(utc + (3600000 * 8))
  const year = shanghaiDate.getFullYear()
  const month = String(shanghaiDate.getMonth() + 1).padStart(2, '0')
  const day = String(shanghaiDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const normalizeDateOnly = (value: any) => value ? formatShanghaiDateTime(value, false).slice(0, 10) : ''

const selectedDate = ref(getLocalTodayStr())
const selectedSlot = ref('09:00-09:30')
const visitType = ref('初诊')
const visitTypeValueMap: Record<string, string> = {
  初诊: 'first',
  复诊: 'followup',
  调整: 'adjust'
}
const consultFee = ref('0.00')
const depositAmount = ref('0.00')
const remarks = ref('')

// Modal/Form States for registering new patient
const createVisible = ref(false)

const requireDeposit = ref(false)
const stores = ref<any[]>([])
const doctors = ref<any[]>([])
const bookingInterval = ref(30)

const currentYear = ref(Number(getLocalTodayStr().slice(0, 4)))
const currentMonth = ref(Number(getLocalTodayStr().slice(5, 7)) - 1)
const canGoPreviousMonth = computed(() =>
  `${currentYear.value}-${String(currentMonth.value + 1).padStart(2, '0')}` > getLocalTodayStr().slice(0, 7))
let monthRequestVersion = 0
let monthChangeVersion = 0
const doctorMonthSchedules = ref<any[]>([])

async function fetchDoctorMonthSchedules() {
  const version = ++monthRequestVersion
  doctorMonthSchedules.value = []
  if (!selectedDoctor.value) return
  const monthStr = `${currentYear.value}-${String(currentMonth.value + 1).padStart(2, '0')}`
  try {
    const res: any = await request.get('/api/admin/appointments/options/schedules', {
      params: { doctor_id: selectedDoctor.value, date: monthStr }
    })
    if (version !== monthRequestVersion) return
    doctorMonthSchedules.value = res.data || []
  } catch (error) {
    console.error('获取医生月排班失败:', error)
  }
}

const datesList = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const result = []
  
  const [todayYear, todayMonth, todayDay] = getLocalTodayStr().split('-').map(Number)
  const isCurrentMonth = todayYear === year && todayMonth - 1 === month
  
  const startDay = isCurrentMonth ? todayDay : 1
  const endDay = new Date(year, month + 1, 0).getDate()
  
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  
  for (let d = startDay; d <= endDay; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dateObj = new Date(year, month, d)
    if (dateStr < getLocalTodayStr()) continue
    const hasSchedule = doctorMonthSchedules.value.some((s: any) => s.date === dateStr)
    
    result.push({
      date: dateStr,
      day: d,
      weekday: weekdays[dateObj.getDay()],
      hasSchedule
    })
  }
  return result
})

async function changeMonth(delta: number) {
  const newDate = new Date(currentYear.value, currentMonth.value + delta, 1)
  const targetMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`
  if (targetMonth < getLocalTodayStr().slice(0, 7)) return
  const version = ++monthChangeVersion
  selectedDate.value = ''
  selectedSlot.value = ''
  timeSlots.value = []
  currentYear.value = newDate.getFullYear()
  currentMonth.value = newDate.getMonth()
  await fetchDoctorMonthSchedules()
  if (version !== monthChangeVersion) return
  
  const match = datesList.value.find(d => d.hasSchedule)
  if (match) {
    selectedDate.value = match.date
  } else if (datesList.value.length > 0) {
    selectedDate.value = datesList.value[0].date
  }
}

function selectDate(dateStr: string) {
  if (dateStr < getLocalTodayStr()) return
  selectedDate.value = dateStr
}

const selectedDoctorName = computed(() => {
  const doc = doctors.value.find(d => String(d.id) === String(selectedDoctor.value))
  return doc ? doc.name : ''
})

const selectableDoctors = computed(() => {
  if (!selectedStore.value) return doctors.value
  return doctors.value.filter((doctor: any) => {
    const storeIds = Array.isArray(doctor.store_ids) ? doctor.store_ids.map((id: any) => String(id)) : []
    return storeIds.includes(String(selectedStore.value))
  })
})

const fetchSettings = async () => {
  try {
    const res: any = await request.get('/api/admin/appointments/options/booking-settings')
    if (res.code === 200 && res.data) {
      requireDeposit.value = res.data.require_deposit === true || res.data.require_deposit === 'true'
      depositAmount.value = (Number(res.data.deposit_amount || 0) / 100).toFixed(2)
      const interval = Number(res.data.booking_interval || 30)
      bookingInterval.value = Number.isFinite(interval) && interval > 0 ? interval : 30
    }
  } catch (error) {
    console.error('获取系统设置失败:', error)
  }
}



function setSelectedPatientFromRecord(record: any) {
  const levelMap: Record<string, string> = {
    normal: '普通',
    silver: 'VIP',
    gold: 'VIP',
    diamond: 'SVIP'
  }
  selectedPatientId.value = String(record.id)
  patientOptions.value = [{
    label: `${record.name} (${record.phone || record.user_phone || '无手机号'})`,
    value: String(record.id)
  }]
  searchResults.value = [record]
  selectedPatient.value = {
    id: String(record.id),
    name: record.name,
    gender: genderLabel(record.gender),
    age: record.age || 30,
    phone: record.phone || record.user_phone || '',
    no: record.patient_no || '未生成',
    level: levelMap[record.member_level] || '普通',
    avatarColor: genderColor(record.gender)
  }
  checkPatientVisitType(String(record.id))
}

onMounted(async () => {
  await fetchSettings()
  await fetchStoresAndDoctors()
  if (isReschedule.value) {
    try {
      const res: any = await request.get(`/api/admin/appointments/${rescheduleId.value}`)
      const appt = res.data
      if (appt) {
        selectedPatientId.value = appt.patient_id.toString()
        patientOptions.value = [{
          label: `${appt.patient_name} (${appt.patient_phone})`,
          value: appt.patient_id.toString()
        }]
        selectedPatient.value = {
          id: appt.patient_id.toString(),
          name: appt.patient_name,
          gender: genderLabel(appt.patient_gender),
          age: appt.patient_age || 30,
          phone: appt.patient_phone,
          no: appt.patient_no || '未生成',
          level: '普通',
          avatarColor: genderColor(appt.patient_gender)
        }
        selectedStore.value = String(appt.store_id || stores.value.find(s => s.name === appt.store_name)?.id || '')
        selectedDoctor.value = String(appt.doctor_id || doctors.value.find(d => d.name === appt.doctor_name)?.id || '')
        selectedDate.value = normalizeDateOnly(appt.appointment_date) < getLocalTodayStr() ? getLocalTodayStr() : normalizeDateOnly(appt.appointment_date)
        if (selectedDate.value) {
          const [year, month] = selectedDate.value.split('-').map(Number)
          currentYear.value = year
          currentMonth.value = month - 1
        }
        selectedSlot.value = appt.appointment_time
        remarks.value = appt.symptom_desc || ''
      }
    } catch (e) {
      console.error(e)
    }
  } else if (patientIdFromQuery) {
    try {
      const res: any = await request.get(`/api/admin/patients/${patientIdFromQuery}`)
      if (res.code === 200 && res.data) {
        setSelectedPatientFromRecord(res.data)
      }
    } catch (e) {
      console.error(e)
    }
  }
})

watch([selectedStore, selectedDoctor, selectedDate], () => {
  fetchTimeSlots()
})

watch(selectedStore, () => {
  if (!selectableDoctors.value.some((doctor: any) => String(doctor.id) === String(selectedDoctor.value))) {
    selectedDoctor.value = selectableDoctors.value[0] ? String(selectableDoctors.value[0].id) : ''
  }
})

watch(selectedDoctor, (newDoctorId) => {
  const doc = doctors.value.find(d => String(d.id) === String(newDoctorId))
  if (doc) {
    consultFee.value = (Number(doc.consult_fee || 0) / 100).toFixed(2)
  } else {
    consultFee.value = '0.00'
  }
  fetchDoctorMonthSchedules()
}, { immediate: true })

async function fetchStoresAndDoctors() {
  const [storeRes, doctorRes]: any[] = await Promise.all([
    request.get('/api/admin/appointments/options/stores'),
    request.get('/api/admin/appointments/options/doctors')
  ])
  stores.value = storeRes.data || []
  doctors.value = doctorRes.data || []
  
  if (storeIdFromQuery) {
    selectedStore.value = storeIdFromQuery
  } else if (!selectedStore.value && stores.value.length) {
    selectedStore.value = String(stores.value[0].id)
  }
  
  if (doctorIdFromQuery) {
    selectedDoctor.value = doctorIdFromQuery
  } else if (!selectedDoctor.value && selectableDoctors.value.length) {
    selectedDoctor.value = String(selectableDoctors.value[0].id)
  }
  
  await fetchDoctorMonthSchedules()
  await fetchTimeSlots()
}

let patientSearchSequence = 0
async function handleSearchInput(val: string) {
  const sequence = ++patientSearchSequence
  searchQuery.value = val
  const q = val.trim()
  if (!q) {
    isSearching.value = false
    searchResults.value = []
    patientOptions.value = []
    return
  }
  try {
    isSearching.value = true
    const res: any = await request.get(`/api/admin/patients?search=${encodeURIComponent(q)}`)
    if (sequence !== patientSearchSequence) return
    searchResults.value = res.data || []
    patientOptions.value = searchResults.value.map((p: any) => ({
      label: `${p.name} (${p.phone || p.user_phone || '无手机号'})`,
      value: p.id.toString()
    }))
  } catch (error) {
    console.error(error)
  } finally {
    if (sequence === patientSearchSequence) isSearching.value = false
  }
}

async function checkPatientVisitType(patientId: string) {
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId}`)
    if (res.code === 200 && res.data && res.data.appointments) {
      const hasCompletedAppt = res.data.appointments.some((appt: any) => 
        appt.status === 'completed' || appt.status === 'arrived'
      )
      visitType.value = hasCompletedAppt ? '复诊' : '初诊'
    } else {
      visitType.value = '初诊'
    }
  } catch (error) {
    console.error('获取患者预约历史失败:', error)
    visitType.value = '初诊'
  }
}

function handlePatientChange(val: any) {
  if (!val) {
    selectedPatient.value = null
    return
  }
  const found = searchResults.value.find((p: any) => p.id.toString() === val.toString())
  if (found) {
    const levelMap: Record<string, string> = {
      normal: '普通',
      silver: 'VIP',
      gold: 'VIP',
      diamond: 'SVIP'
    }
    selectedPatient.value = {
      id: found.id.toString(),
      name: found.name,
      gender: genderLabel(found.gender),
      age: found.age || 30,
      phone: found.phone || found.user_phone,
      no: found.patient_no || '未生成',
      level: levelMap[found.member_level] || '普通',
      avatarColor: genderColor(found.gender)
    }
    checkPatientVisitType(found.id.toString())
  }
}

function handleAddNewPatient() {
  createVisible.value = true
}

function handleCreatePatientSuccess(newP: any) {
  const pId = newP.id.toString()
  selectedPatientId.value = pId
  patientOptions.value = [{
    label: `${newP.name} (${newP.phone || '无手机号'})`,
    value: pId
  }]
  selectedPatient.value = {
    id: pId,
    name: newP.name,
    gender: newP.gender,
    age: newP.age || 30,
    phone: newP.phone,
    no: newP.patient_no || '未生成',
    level: newP.level || '普通',
    avatarColor: genderColor(newP.gender)
  }
  visitType.value = '初诊'
}

function handleRemovePatient() {
  selectedPatient.value = null
  selectedPatientId.value = ''
  patientOptions.value = []
  searchQuery.value = ''
  visitType.value = '初诊'
}

const timeSlots = ref<Array<{ time: string; status: string; label: string; period: string; booked?: number; total?: number; schedule_id?: number }>>([])

const slotLoadState = ref<'loading' | 'error' | 'ready'>('ready')
const hasDaySlots = ref(false)
const emptySlotText = computed(() => slotLoadState.value === 'loading' ? '正在加载时段' : slotLoadState.value === 'error' ? '时段加载失败，请重试' : hasDaySlots.value ? '当日预约时段已全部过期' : '未排班')

let slotRequestVersion = 0
async function fetchTimeSlots() {
  const version = ++slotRequestVersion
  const date = selectedDate.value
  timeSlots.value = []
  hasDaySlots.value = false
  slotLoadState.value = 'ready'
  if (!selectedDoctor.value || !date) { selectedSlot.value = ''; return }
  slotLoadState.value = 'loading'
  try {
    const res: any = await request.get('/api/admin/appointments/options/day-slots', {
      params: {
        doctor_id: selectedDoctor.value,
        store_id: selectedStore.value,
        date
      }
    })
    if (version !== slotRequestVersion || date !== selectedDate.value) return
    hasDaySlots.value = (res.data || []).length > 0
    slotLoadState.value = 'ready'
    timeSlots.value = (res.data || []).filter((slot: any) =>
      Date.parse(`${selectedDate.value}T${slot.time.split('-')[1].trim()}:00+08:00`) > Date.now())
    const firstAvailable = timeSlots.value.find(slot => slot.status === 'available')
    if (!timeSlots.value.some(slot => slot.time === selectedSlot.value)) {
      selectedSlot.value = firstAvailable?.time || (timeSlots.value[0]?.time || '')
    }
  } catch (error) {
    if (version === slotRequestVersion) { slotLoadState.value = 'error'; selectedSlot.value = ''; MessagePlugin.error('加载号源失败') }
  }
}

function selectSlot(slot: any) {
  if (!(Date.parse(`${selectedDate.value}T${slot.time.split('-')[1].trim()}:00+08:00`) > Date.now())) {
    MessagePlugin.warning('该时段已过期，请选择其他时段')
    fetchTimeSlots()
    return
  }
  selectedSlot.value = slot.time
}

function handleCancel() {
  if (isReschedule.value) {
    router.push(`/appointment/detail/${rescheduleId.value}`)
  } else {
    navigateToParent(router, route, '/appointment')
  }
}

const creatingAppointment = ref(false)

async function handleCreate() {
  if (creatingAppointment.value) return
  if (!selectedPatient.value) {
    MessagePlugin.error('请先选择或新建患者')
    return
  }

  const storeId = Number(selectedStore.value)
  const doctorId = Number(selectedDoctor.value)
  const dateStr = selectedDate.value

  if (!storeId) {
    MessagePlugin.error('请选择就诊门店')
    return
  }
  if (!doctorId) {
    MessagePlugin.error('请选择就诊医生')
    return
  }
  if (!dateStr) {
    MessagePlugin.error('请选择预约日期')
    return
  }
  if (!selectedSlot.value) {
    MessagePlugin.error('请选择预约时间段（如无可用时间段，请更换日期或医生）')
    return
  }

  if (!(Date.parse(`${dateStr}T${selectedSlot.value.split('-')[1].trim()}:00+08:00`) > Date.now())) {
    MessagePlugin.error('该时段已过期，请重新选择预约时间')
    await fetchTimeSlots()
    return
  }

  const slotHour = parseInt(selectedSlot.value.split(':')[0])
  const period = slotHour < 12 ? 'morning' : 'afternoon'

  creatingAppointment.value = true
  try {
    if (isReschedule.value) {
      await request.put(`/api/admin/appointments/${rescheduleId.value}`, {
        patient_id: parseInt(selectedPatient.value.id),
        store_id: storeId,
        doctor_id: doctorId,
        date: dateStr,
        period: period,
        time: selectedSlot.value,
        symptom_desc: remarks.value
      })
      MessagePlugin.success(`预约改约成功！已修改就诊时间。`)
      router.push(`/appointment/detail/${rescheduleId.value}`)
    } else {
      const parsedConsultFee = Math.round((Number(consultFee.value) || 0) * 100)
      const parsedDepositAmount = requireDeposit.value
        ? Math.round((Number(depositAmount.value) || 0) * 100)
        : 0

      const res: any = await request.post('/api/admin/appointments', {
        patient_id: parseInt(selectedPatient.value.id),
        store_id: storeId,
        doctor_id: doctorId,
        date: dateStr,
        period: period,
        time: selectedSlot.value,
        type: visitTypeValueMap[visitType.value] || 'first',
        symptom_desc: remarks.value,
        consult_fee: parsedConsultFee,
        deposit_amount: parsedDepositAmount
      })
      const sum = parsedConsultFee + parsedDepositAmount
      if (sum > 0 && res.data && res.data.id) {
        await appointmentCharge.value?.open(res.data.id)
      } else {
        MessagePlugin.success(`预约创建成功！已写入门诊就诊记录`)
        navigateToParent(router, route, '/appointment')
      }
    }
  } catch (error) {
    console.error(error)
  } finally {
    creatingAppointment.value = false
  }
}

const appointmentCharge = ref<InstanceType<typeof AppointmentChargeDialog>>()
</script>

<template>
  <div class="page-container appointment-form-page">
    <AppointmentChargeDialog ref="appointmentCharge" @closed="id => navigateToParent(router, route, `/appointment/detail/${id}`)" />
    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">{{ isReschedule ? '预约改约' : '新建预约' }}</div>
        <div class="page-title-sub">{{ isReschedule ? '调整已有预约的时间及就诊规则' : '手动为患者创建预约' }}</div>
      </div>
    </div>

    <div class="appointment-workspace">
      <div class="appointment-fields">
    <!-- Step 1: Select Patient -->
    <div class="panel">
      <div class="panel-header"><div class="panel-title">① {{ isReschedule ? '就诊患者' : '选择患者' }}</div></div>
      <div class="panel-body">
        <!-- Search bar (hidden during reschedule) -->
        <div v-if="!isReschedule" class="patient-picker">
          <t-select
            v-model="selectedPatientId"
            filterable
            placeholder="输入姓名/手机号搜索并选择患者"
            :filter="() => true"
            :loading="isSearching"
            :options="patientOptions"
            class="patient-picker-select"
            @search="handleSearchInput"
            @change="handlePatientChange"
            clearable
          />
          <t-button v-permission="'patient:add'" variant="outline" theme="primary" @click="handleAddNewPatient">
            <AppIcon name="plus" />  新患者建档
          </t-button>
        </div>

        <!-- Selected Patient details (visible only when selectedPatient is not null) -->
        <div
          v-if="selectedPatient"
          style="margin-top: 12px; padding: 12px 16px; background: #EEF4FF; border-radius: 6px; border: 1px solid #BCCFFF; display: flex; align-items: center; gap: 12px;"
        >
          <t-avatar size="36px" :style="{ background: selectedPatient.avatarColor }">
            {{ selectedPatient.name.charAt(0) }}
          </t-avatar>
          <div style="flex: 1; font-size: 13px; color: #1F2937;">
            <strong>{{ selectedPatient.name }}</strong> · {{ selectedPatient.gender }} · {{ selectedPatient.age }}岁 · {{ selectedPatient.phone }} · {{ selectedPatient.no }}
          </div>
          <span class="tag tag-gold" v-if="selectedPatient.level === 'VIP'">VIP</span>
          <t-button v-if="!isReschedule" size="small" variant="outline" theme="danger" @click="handleRemovePatient">
            移除
          </t-button>
        </div>
      </div>
    </div>

    <!-- Step 2: Choose Store & Doctor -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">② 选择门店 & 医生</div></div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">就诊门店<span class="required">*</span></label>
            <t-select v-model="selectedStore" placeholder="请选择门店">
              <t-option v-for="store in stores" :key="store.id" :value="String(store.id)" :label="store.name" />
            </t-select>
          </div>
          <div class="form-group">
            <label class="form-label">就诊医生<span class="required">*</span></label>
            <t-select v-model="selectedDoctor" placeholder="请选择医生">
              <t-option
                v-for="doctor in selectableDoctors"
                :key="doctor.id"
                :value="String(doctor.id)"
                :label="`${doctor.name} · ${doctor.title || ''} · ${doctor.specialty || ''}`"
              />
            </t-select>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 3: Select Date & Time Slot -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">③ 选择时间段</div></div>
      <div class="panel-body">
        <!-- Month Selector Header -->
        <div class="calendar-month-selector">
          <button type="button" class="month-arrow" aria-label="上个月" :disabled="!canGoPreviousMonth" @click="changeMonth(-1)">‹</button>
          <span class="month-label">{{ currentYear }}年{{ String(currentMonth + 1).padStart(2, '0') }}月</span>
          <button type="button" class="month-arrow" aria-label="下个月" @click="changeMonth(1)">›</button>
          
          <div class="legend-container" style="margin-left: auto;">
            <span class="legend-item"><span class="dot green">●</span> 可约</span>
            <span class="legend-item"><span class="dot gray">●</span> 约满</span>
            <span class="legend-item"><span class="dot blue">●</span> 已选</span>
          </div>
        </div>
        
        <!-- Dates Scroller Row -->
        <div class="dates-scroller" style="margin-bottom: 20px;">
          <div
            v-for="item in datesList"
            :key="item.date"
            class="date-item"
            :class="{
              'selected': selectedDate === item.date,
              'has-schedule': item.hasSchedule && selectedDate !== item.date,
              'no-schedule': !item.hasSchedule && selectedDate !== item.date
            }"
            @click="selectDate(item.date)"
          >
            <div class="date-weekday">{{ item.weekday }}</div>
            <div class="date-day">{{ item.day }}</div>
            <div class="date-dot" v-if="item.hasSchedule"></div>
          </div>
        </div>
        
        <div class="slots-grid" v-if="timeSlots.length > 0">
          <div
            v-for="slot in timeSlots"
            :key="slot.time"
            class="slot-item"
            :class="{
              'full': slot.status === 'full' && selectedSlot !== slot.time,
              'available': slot.status === 'available' && selectedSlot !== slot.time,
              'selected': selectedSlot === slot.time
            }"
            @click="selectSlot(slot)"
          >
            <div class="slot-time">{{ slot.time }}</div>
            <div class="slot-status-label">
              {{ selectedSlot === slot.time ? '已选' : slot.status === 'full' ? '约满' : '可约' }} 
              <span style="opacity: 0.8; margin-left: 2px;">{{ slot.booked }}/{{ slot.total }}</span>
            </div>
          </div>
        </div>
        <div v-else style="padding: 24px; text-align: center; color: #EF4444; background: #FFF5F5; border-radius: 8px; border: 1px dashed #FCA5A5; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; justify-content: center;">
          <span style="font-size: 20px;"><AppIcon name="calendar" /> </span>
          <div>
            <strong style="color: #DC2626;">{{ selectedDate }}</strong> 
            <span style="color: #4B5563; margin: 0 6px;">{{ selectedDoctorName }}医生</span>
            <strong style="color: #DC2626;">{{ emptySlotText }}</strong>
          </div>
          <span style="font-size: 12px; color: #9CA3AF;">{{ hasDaySlots && slotLoadState === 'ready' ? '已结束的时段不可预约，请选择其他日期' : '您可以尝试切换就诊日期、就诊门店或医生' }}</span>
        </div>
      </div>
    </div>

    <!-- Step 4: Supplemental Information -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">④ 补充信息</div></div>
      <div class="panel-body">
        <div class="form-grid supplementary-grid">
          <div class="form-group">
            <label class="form-label">预约类型</label>
            <t-select v-model="visitType" placeholder="预约类型">
              <t-option value="初诊" label="初诊" />
              <t-option value="复诊" label="复诊" />
              <t-option value="调整" label="调整" />
            </t-select>
          </div>
          <div class="form-group">
            <label class="form-label">挂号费</label>
            <div class="input-group">
              <span class="input-prefix">¥</span>
              <input type="number" class="form-control-inner" v-model="consultFee" placeholder="请输入挂号费" />
            </div>
          </div>
          <div class="form-group" v-if="requireDeposit">
            <label class="form-label">预约定金</label>
            <div class="input-group">
              <span class="input-prefix">¥</span>
              <input type="number" class="form-control-inner" v-model="depositAmount" placeholder="请输入预约定金" />
            </div>
          </div>
          <div class="form-group full">
            <label class="form-label">备注</label>
            <t-textarea v-model="remarks" placeholder="填写症状描述或其他备注信息" :autosize="{ minRows: 3, maxRows: 6 }" />
          </div>
        </div>
      </div>
    </div>
    
      </div>
      <aside class="panel appointment-summary" aria-labelledby="appointment-summary-title">
        <div class="panel-header">
          <div id="appointment-summary-title" class="panel-title">预约摘要</div>
        </div>
        <div class="panel-body">
          <dl class="appointment-summary-list">
            <div><dt>就诊患者</dt><dd>{{ selectedPatient?.name || '请选择患者' }}</dd></div>
            <div><dt>就诊门店</dt><dd>{{ stores.find(store => String(store.id) === String(selectedStore))?.name || '请选择门店' }}</dd></div>
            <div><dt>就诊医生</dt><dd>{{ selectedDoctor ? selectedDoctorName : '请选择医生' }}</dd></div>
            <div><dt>就诊时间</dt><dd>{{ selectedDate && selectedSlot ? selectedDate + ' ' + selectedSlot : '请选择日期和时段' }}</dd></div>
            <div><dt>预约类型</dt><dd>{{ visitType || '—' }}</dd></div>
            <div><dt>挂号费</dt><dd>¥{{ Number(consultFee || 0).toFixed(2) }}</dd></div>
            <div v-if="requireDeposit"><dt>预约定金</dt><dd>¥{{ Number(depositAmount || 0).toFixed(2) }}</dd></div>
          </dl>
          <div class="appointment-summary-actions">
            <t-button variant="outline" theme="default" @click="handleCancel">取消</t-button>
            <t-button v-permission="'appointment:add'" theme="primary" :loading="creatingAppointment" @click="handleCreate">{{ isReschedule ? '确认改约' : '确认创建' }}</t-button>
          </div>
        </div>
      </aside>
    </div>

    <!-- 统一共用新患者建档弹窗 -->
    <PatientCreateDialog
      v-model:visible="createVisible"
      :default-name="searchQuery"
      @success="handleCreatePatientSuccess"
    />


  </div>
</template>

<style scoped>


/* Page Title Row */
.page-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}
.page-title-sub {
  font-size: 13px;
  color: #9CA3AF;
  margin-top: 4px;
}

/* Panels */
.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #F3F4F6;
}
.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.panel-body {
  padding: 20px;
}

/* Form Styles */
.appointment-form-page {
  max-width: 1440px;
  margin-inline: auto;
}
.appointment-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 300px);
  gap: 24px;
  align-items: start;
}
.appointment-fields {
  min-width: 0;
}
.appointment-summary {
  position: sticky;
  top: 20px;
}
.appointment-summary-list {
  display: grid;
  gap: 14px;
  margin: 0;
}
.appointment-summary-list > div {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 12px;
  font-size: 13px;
}
.appointment-summary-list dt {
  color: #6b7280;
}
.appointment-summary-list dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.appointment-summary-actions {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}
@media (max-width: 1100px) {
  .appointment-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .appointment-summary {
    position: static;
  }
}
.patient-picker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.patient-picker-select {
  width: min(100%, 440px);
}
.form-grid.supplementary-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
  max-width: 940px;
}
.supplementary-grid .form-group.full {
  grid-column: 1 / -1;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 360px));
  gap: 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group.full {
  grid-column: span 2;
}
@media (max-width: 640px) {
  .appointment-form-page .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .appointment-form-page .form-group.full {
    grid-column: 1 / -1;
  }
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.form-label .required {
  color: var(--error-500);
  margin-left: 2px;
}

/* Date & Legends */
.legend-container {
  font-size: 13px;
  color: #9CA3AF;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.legend-item .dot {
  font-size: 10px;
}
.legend-item .dot.green { color: #10B981; }
.legend-item .dot.gray { color: #9CA3AF; }
.legend-item .dot.blue { color: var(--primary-500); }

/* Slots Grid */
.slots-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.slot-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 64px;
  padding: 10px;
  text-align: center;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms;
  box-sizing: border-box;
}
.slot-item.full {
  background: #F9FAFB;
  color: #D1D5DB;
  cursor: pointer;
  border: 1px solid #E5E7EB;
}
.slot-item.full:hover {
  background: #EAEAEA;
}
.slot-item.available {
  background: #ECFDF5;
  color: #16A34A;
  border: 1px solid #BBF7D0;
}
.slot-item.available:hover {
  background: #D3F5E3;
}
.slot-item.selected {
  background: var(--primary-500);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(59, 107, 245, 0.3);
  transition: none !important;
}

.slot-time {
  line-height: 1.3;
}

.slot-status-label {
  min-height: 16px;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.3;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.tag-gold {
  background: #FFF9E6;
  color: #D4930A;
}

/* Horizontal Calendar Styles */
.calendar-month-selector {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.month-arrow {
  border: 0; background: transparent; width: 28px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center;
  font-size: 24px;
  color: #9CA3AF;
  cursor: pointer;
  user-select: none;
  transition: color 150ms;
  line-height: 1;
}
.month-arrow:not(:disabled):hover {
  color: var(--primary-500);
}
.month-arrow:disabled { color: #d1d5db; cursor: not-allowed; }
.month-arrow:focus-visible { outline: 2px solid var(--primary-500); border-radius: 4px; }
.month-label {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  min-width: 100px;
  text-align: center;
}
.dates-scroller {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 10px 2px;
  scrollbar-width: none; /* Firefox */
}
.dates-scroller::-webkit-scrollbar {
  display: none; /* Safari and Chrome */
}
.date-item {
  flex: 0 0 56px;
  height: 76px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid #E5E7EB;
  cursor: pointer;
  transition: all 150ms;
  background: #F9FAFB;
  position: relative;
  box-sizing: border-box;
}
.date-item.no-schedule {
  opacity: 0.65;
  background: #FFF;
}
.date-item.has-schedule {
  border-color: #BCCFFF;
  background: #EEF4FF;
}
.date-item.has-schedule .date-weekday {
  color: #4B5563;
}
.date-item.has-schedule .date-day {
  color: var(--primary-500);
  font-weight: 700;
}
.date-item.selected {
  background: var(--primary-500) !important;
  border-color: var(--primary-500) !important;
  box-shadow: 0 4px 10px rgba(59, 107, 245, 0.25);
  transition: none !important;
}
.date-item.selected .date-weekday {
  color: #FFF !important;
  opacity: 0.8;
}
.date-item.selected .date-day {
  color: #FFF !important;
  font-weight: 700;
}
.date-weekday {
  font-size: 11px;
  color: #9CA3AF;
  margin-bottom: 4px;
}
.date-day {
  font-size: 17px;
  font-weight: 600;
  color: #1F2937;
}
.date-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  position: absolute;
  bottom: 8px;
}
.date-item.has-schedule .date-dot {
  background: #10B981;
}
.date-item.selected .date-dot {
  background: #FFF;
}

/* === 输入框组 (前缀/后缀) === */
.input-group {
  display: flex;
  align-items: center;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  background: #fff;
  transition: all 150ms ease;
  height: 36px;
  width: 100%;
  box-sizing: border-box;
}
.input-group:focus-within {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 2px rgba(59, 107, 245, 0.1);
}
.input-group:hover {
  border-color: #BCCFFF;
}
.input-prefix {
  padding-left: 12px;
  color: #9CA3AF;
  font-size: 14px;
  user-select: none;
  display: flex;
  align-items: center;
}
.input-suffix {
  padding-right: 12px;
  color: #9CA3AF;
  font-size: 14px;
  user-select: none;
  display: flex;
  align-items: center;
}
.form-control-inner {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  padding: 8px 12px;
  font-size: 13px;
  color: #1F2937;
  height: 100%;
  box-sizing: border-box;
}
.input-group .input-prefix + .form-control-inner {
  padding-left: 4px;
}
.form-control-inner-suffix {
  padding-right: 4px;
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
