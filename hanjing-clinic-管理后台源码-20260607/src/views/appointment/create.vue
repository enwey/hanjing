<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import PatientCreateDialog from '@/components/PatientCreateDialog.vue'

const router = useRouter()
const route = useRoute()

const isReschedule = ref(route.query.reschedule === '1')
const rescheduleId = ref(route.query.id as string || '')

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

const selectedDate = ref(getLocalTodayStr())
const selectedSlot = ref('09:00-09:30')
const visitType = ref('初诊')
const consultFee = ref('0.00')
const depositAmount = ref('0.00')
const remarks = ref('')

// Modal/Form States for registering new patient
const createVisible = ref(false)

const selectedPromoterId = ref<string | null>(null)
const promoterOptions = ref<Array<{ label: string; value: string }>>([])
const requireDeposit = ref(false)
const stores = ref<any[]>([])
const doctors = ref<any[]>([])

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())
const doctorMonthSchedules = ref<any[]>([])

async function fetchDoctorMonthSchedules() {
  if (!selectedDoctor.value) return
  const monthStr = `${currentYear.value}-${String(currentMonth.value + 1).padStart(2, '0')}`
  try {
    const res: any = await request.get('/api/admin/schedules', {
      params: { doctor_id: selectedDoctor.value, date: monthStr }
    })
    doctorMonthSchedules.value = res.data || []
  } catch (error) {
    console.error('获取医生月排班失败:', error)
  }
}

const datesList = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const result = []
  
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  
  const startDay = isCurrentMonth ? today.getDate() : 1
  const endDay = new Date(year, month + 1, 0).getDate()
  
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  
  for (let d = startDay; d <= endDay; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dateObj = new Date(year, month, d)
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
  currentYear.value = newDate.getFullYear()
  currentMonth.value = newDate.getMonth()
  await fetchDoctorMonthSchedules()
  
  const match = datesList.value.find(d => d.hasSchedule)
  if (match) {
    selectedDate.value = match.date
  } else if (datesList.value.length > 0) {
    selectedDate.value = datesList.value[0].date
  }
}

function selectDate(dateStr: string) {
  selectedDate.value = dateStr
}

const selectedDoctorName = computed(() => {
  const doc = doctors.value.find(d => String(d.id) === String(selectedDoctor.value))
  return doc ? doc.name : ''
})

const fetchSettings = async () => {
  try {
    const res: any = await request.get('/api/admin/settings')
    if (res.code === 200 && res.data) {
      requireDeposit.value = res.data.require_deposit === true || res.data.require_deposit === 'true'
      depositAmount.value = (Number(res.data.deposit_amount || 0) / 100).toFixed(2)
    }
  } catch (error) {
    console.error('获取系统设置失败:', error)
  }
}

const fetchPromoters = async () => {
  try {
    const res: any = await request.get('/api/admin/distribution/promoters')
    if (res.code === 200 && res.data) {
      promoterOptions.value = res.data.map((p: any) => ({
        label: `${p.nickname} (${p.user_phone || '无手机号'})`,
        value: p.user_id.toString()
      }))
    }
  } catch (error) {
    console.error('获取推广员列表失败:', error)
  }
}

onMounted(async () => {
  await fetchStoresAndDoctors()
  fetchPromoters()
  fetchSettings()
  if (isReschedule.value) {
    try {
      const res: any = await request.get(`/api/admin/appointments`)
      const appt = res.data.find((a: any) => a.id.toString() === rescheduleId.value)
      if (appt) {
        selectedPatientId.value = appt.patient_id.toString()
        patientOptions.value = [{
          label: `${appt.patient_name} (${appt.patient_phone})`,
          value: appt.patient_id.toString()
        }]
        selectedPatient.value = {
          id: appt.patient_id.toString(),
          name: appt.patient_name,
          gender: appt.patient_gender === 1 ? '男' : '女',
          age: appt.patient_age || 30,
          phone: appt.patient_phone,
          no: `P2026${String(appt.patient_id).padStart(4, '0')}`,
          level: '普通',
          avatarColor: appt.patient_gender === 1 ? '#3B6BF5' : '#EC4899'
        }
        selectedStore.value = String(appt.store_id || stores.value.find(s => s.name === appt.store_name)?.id || '')
        selectedDoctor.value = String(appt.doctor_id || doctors.value.find(d => d.name === appt.doctor_name)?.id || '')
        selectedDate.value = appt.appointment_date ? (() => {
          const d = new Date(appt.appointment_date);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          currentYear.value = year;
          currentMonth.value = d.getMonth();
          return `${year}-${month}-${day}`;
        })() : ''
        selectedSlot.value = appt.appointment_time
        remarks.value = appt.symptom_desc || ''
      }
    } catch (e) {
      console.error(e)
    }
  }
})

watch([selectedStore, selectedDoctor, selectedDate], () => {
  fetchTimeSlots()
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
    request.get('/api/admin/stores'),
    request.get('/api/admin/doctors')
  ])
  stores.value = storeRes.data || []
  doctors.value = doctorRes.data || []
  if (!selectedStore.value && stores.value.length) selectedStore.value = String(stores.value[0].id)
  if (!selectedDoctor.value && doctors.value.length) selectedDoctor.value = String(doctors.value[0].id)
  await fetchDoctorMonthSchedules()
  await fetchTimeSlots()
}

async function handleSearchInput(val: string) {
  searchQuery.value = val
  const q = val.trim()
  if (!q) {
    patientOptions.value = []
    return
  }
  try {
    isSearching.value = true
    const res: any = await request.get(`/api/admin/patients?search=${q}`)
    searchResults.value = res.data || []
    patientOptions.value = searchResults.value.map((p: any) => ({
      label: `${p.name} (${p.phone || p.user_phone || '无手机号'})`,
      value: p.id.toString()
    }))
  } catch (error) {
    console.error(error)
  } finally {
    isSearching.value = false
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
      gender: found.gender === 1 ? '男' : '女',
      age: found.age || 30,
      phone: found.phone || found.user_phone,
      no: `P2026${String(found.id).padStart(4, '0')}`,
      level: levelMap[found.member_level] || '普通',
      avatarColor: found.gender === 1 ? '#3B6BF5' : '#EC4899'
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
    no: `P2026${String(newP.id).padStart(4, '0')}`,
    level: newP.level || '普通',
    avatarColor: newP.gender === '男' ? '#3B6BF5' : '#EC4899'
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

const timeSlots = ref<Array<{ time: string; status: string; label: string; period: string; booked?: number; total?: number }>>([])

function buildSlots(start: string, end: string) {
  const result: string[] = []
  const [startHour, startMinute] = start.slice(0, 5).split(':').map(Number)
  const [endHour, endMinute] = end.slice(0, 5).split(':').map(Number)
  const cursor = new Date(2026, 0, 1, startHour, startMinute)
  const endDate = new Date(2026, 0, 1, endHour, endMinute)
  while (cursor < endDate) {
    const startStr = `${String(cursor.getHours()).padStart(2, '0')}:${String(cursor.getMinutes()).padStart(2, '0')}`
    cursor.setMinutes(cursor.getMinutes() + 30)
    if (cursor > endDate) {
      const endStr = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
      result.push(`${startStr}-${endStr}`)
      break
    }
    const endStr = `${String(cursor.getHours()).padStart(2, '0')}:${String(cursor.getMinutes()).padStart(2, '0')}`
    result.push(`${startStr}-${endStr}`)
  }
  return result
}

async function fetchTimeSlots() {
  if (!selectedDoctor.value || !selectedDate.value) return
  try {
    const res: any = await request.get('/api/admin/schedules', {
      params: { doctor_id: selectedDoctor.value, date: selectedDate.value }
    })
    const rows = (res.data || []).filter((row: any) => String(row.store_id) === String(selectedStore.value))
    
    // 获取当天的所有预约以便精准计算每个分时段的占用情况
    const apptRes: any = await request.get('/api/admin/appointments', {
      params: { date: selectedDate.value }
    })
    const allAppts = apptRes.data || []
    const activeAppointmentStatuses = new Set(['pending_payment', 'pending', 'confirmed', 'checked_in', 'arrived'])
    const doctorAppts = allAppts.filter((appt: any) => 
      String(appt.doctor_id) === String(selectedDoctor.value) &&
      activeAppointmentStatuses.has(String(appt.status || '').trim())
    )

    timeSlots.value = rows.flatMap((row: any) => {
      const peoplePerSlot = Number(row.people_per_slot || 1)
      return buildSlots(row.start_time || '09:00:00', row.end_time || '12:00:00').map(time => {
        const bookedCount = doctorAppts.filter((appt: any) => appt.appointment_time === time).length
        const remaining = Math.max(0, peoplePerSlot - bookedCount)
        return {
          time,
          period: row.period,
          status: remaining > 0 ? 'available' : 'full',
          booked: bookedCount,
          total: peoplePerSlot,
          label: remaining > 0 ? '可约' : '已满'
        }
      })
    })
    const firstAvailable = timeSlots.value.find(slot => slot.status === 'available')
    selectedSlot.value = firstAvailable?.time || (timeSlots.value[0]?.time || '')
  } catch (error) {
    MessagePlugin.error('加载号源失败')
  }
}

function selectSlot(slot: any) {
  selectedSlot.value = slot.time
}

function handleCancel() {
  if (isReschedule.value) {
    router.push(`/appointment/detail/${rescheduleId.value}`)
  } else if (route.query.from === 'queue') {
    router.push('/queue')
  } else {
    router.push('/appointment')
  }
}

async function handleCreate() {
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

  const slotHour = parseInt(selectedSlot.value.split(':')[0])
  const period = slotHour < 12 ? 'morning' : 'afternoon'

  try {
    if (isReschedule.value) {
      await request.put(`/api/admin/appointments/${rescheduleId.value}`, {
        patient_id: parseInt(selectedPatient.value.id),
        store_id: storeId,
        doctor_id: doctorId,
        date: dateStr,
        period: period,
        time: selectedSlot.value,
        status: 'pending',
        symptom_desc: remarks.value
      })
      MessagePlugin.success(`预约改约成功！已修改就诊时间。`)
      router.push(`/appointment/detail/${rescheduleId.value}`)
    } else {
      const parsedConsultFee = Math.round((Number(consultFee.value) || 0) * 100)
      const parsedDepositAmount = Math.round((Number(depositAmount.value) || 0) * 100)

      const res: any = await request.post('/api/admin/appointments', {
        patient_id: parseInt(selectedPatient.value.id),
        store_id: storeId,
        doctor_id: doctorId,
        date: dateStr,
        period: period,
        time: selectedSlot.value,
        type: visitType.value === '初诊' ? 'first' : 'followup',
        symptom_desc: remarks.value,
        consult_fee: parsedConsultFee,
        deposit_amount: parsedDepositAmount
      })
      if (selectedPromoterId.value) {
        try {
          await request.post(`/api/admin/patients/${selectedPatient.value.id}/bind-promoter`, {
            promoter_user_id: parseInt(selectedPromoterId.value)
          })
        } catch (bindErr) {
          console.error('绑定推荐人失败:', bindErr)
        }
      }
      
      const sum = parsedConsultFee + parsedDepositAmount
      if (sum > 0 && res.data && res.data.id) {
        const doc = doctors.value.find(d => String(d.id) === String(selectedDoctor.value))
        const patientName = selectedPatient.value ? selectedPatient.value.name : ''
        const patientPhone = selectedPatient.value ? selectedPatient.value.phone : ''
        
        const row = {
          id: res.data.id.toString(),
          patientId: selectedPatient.value.id.toString(),
          no: res.data.appointment_no,
          patient: patientName,
          phone: patientPhone,
          doctor: doc ? doc.name : '',
          consult_fee: parsedConsultFee,
          deposit_amount: parsedDepositAmount,
          status: 'pending_payment'
        }
        openCheckoutDialog(row)
      } else {
        MessagePlugin.success(`预约创建成功！已写入门诊就诊记录`)
        if (route.query.from === 'queue') {
          router.push('/queue')
        } else {
          router.push('/appointment')
        }
      }
    }
  } catch (error) {
    console.error(error)
  }
}

/* ---- 诊所收银结算弹窗相关状态与方法 ---- */
const checkoutVisible = ref(false)
const checkoutLoading = ref(false)
const checkoutSuccess = ref(false)
const orderResult = ref<any>(null)
const selectedCheckoutRow = ref<any>(null)
const checkoutClosing = ref(false)

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
const discountAmount = ref<number>(0)
const payMethod = ref<string>('wechat')

const totalAmount = computed(() => {
  return billingItems.value.reduce((sum, item) => sum + (item.price * item.quantity), 0)
})

const payableAmount = computed(() => {
  const diff = totalAmount.value - discountAmount.value
  return diff > 0 ? diff : 0
})

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

function openCheckoutDialog(row: any) {
  selectedCheckoutRow.value = row
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
  discountAmount.value = 0
  payMethod.value = 'wechat'
  checkoutSuccess.value = false
  orderResult.value = null
  
  deliveryType.value = 'offline_direct'
  shippingReceiver.value = row.patient || ''
  shippingPhone.value = row.phone || ''
  shippingAddressStr.value = ''
  
  checkoutVisible.value = true
}

async function closeCheckoutDialog() {
  if (checkoutLoading.value || checkoutClosing.value) return

  const currentCheckoutRow = selectedCheckoutRow.value
  const shouldCancelAppointment = !!currentCheckoutRow && !checkoutSuccess.value && currentCheckoutRow.status === 'pending_payment'

  if (shouldCancelAppointment) {
    checkoutClosing.value = true
    try {
      await request.put(`/api/admin/appointments/${currentCheckoutRow.id}`, {
        status: 'cancelled',
        cancel_reason: '支付窗口取消预约'
      })
      MessagePlugin.success('已取消本次预约')
    } catch (error) {
      console.error('取消待支付预约失败:', error)
      MessagePlugin.error('取消预约失败，请稍后重试')
      checkoutClosing.value = false
      return
    }
    checkoutClosing.value = false
  }

  checkoutVisible.value = false
  selectedCheckoutRow.value = null
  router.push('/appointment')
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
    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">{{ isReschedule ? '预约改约' : '新建预约' }}</div>
        <div class="page-title-sub">{{ isReschedule ? '调整已有预约的时间及就诊规则' : '手动为患者创建预约' }}</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <t-button variant="outline" theme="default" @click="handleCancel">取消</t-button>
        <t-button theme="primary" @click="handleCreate">{{ isReschedule ? '确认改约' : '确认创建' }}</t-button>
      </div>
    </div>

    <!-- Step 1: Select Patient -->
    <div class="panel">
      <div class="panel-header"><div class="panel-title">① {{ isReschedule ? '就诊患者' : '选择患者' }}</div></div>
      <div class="panel-body">
        <!-- Search bar (hidden during reschedule) -->
        <div v-if="!isReschedule" style="display: flex; gap: 12px; align-items: center; width: 100%;">
          <t-select
            v-model="selectedPatientId"
            filterable
            placeholder="输入姓名/手机号搜索并选择患者"
            :loading="isSearching"
            :options="patientOptions"
            style="flex: 1;"
            @search="handleSearchInput"
            @change="handlePatientChange"
            clearable
          />
          <t-button variant="outline" theme="primary" @click="handleAddNewPatient">
            ➕ 新患者建档
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
                v-for="doctor in doctors"
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
          <span class="month-arrow" @click="changeMonth(-1)">‹</span>
          <span class="month-label">{{ currentYear }}年{{ String(currentMonth + 1).padStart(2, '0') }}月</span>
          <span class="month-arrow" @click="changeMonth(1)">›</span>
          
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
            <div class="slot-status-label" style="font-size: 11px; margin-top: 2px;">
              {{ selectedSlot === slot.time ? '已选' : slot.status === 'full' ? '约满' : '可约' }} 
              <span style="opacity: 0.8; margin-left: 2px;">{{ slot.booked }}/{{ slot.total }}</span>
            </div>
          </div>
        </div>
        <div v-else style="padding: 24px; text-align: center; color: #EF4444; background: #FFF5F5; border-radius: 8px; border: 1px dashed #FCA5A5; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; justify-content: center;">
          <span style="font-size: 20px;">📅</span>
          <div>
            <strong style="color: #DC2626;">{{ selectedDate }}</strong> 
            <span style="color: #4B5563; margin: 0 6px;">{{ selectedDoctorName }}医生</span>
            <strong style="color: #DC2626;">未排班</strong>
          </div>
          <span style="font-size: 12px; color: #9CA3AF;">您可以尝试切换就诊日期、就诊门店或医生</span>
        </div>
      </div>
    </div>

    <!-- Step 4: Supplemental Information -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">④ 补充信息</div></div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">初诊/复诊</label>
            <t-select v-model="visitType" placeholder="初诊/复诊">
              <t-option value="初诊" label="初诊" />
              <t-option value="复诊" label="复诊" />
            </t-select>
          </div>
          <div class="form-group">
            <label class="form-label">挂号费</label>
            <div class="input-group">
              <span class="input-prefix">¥</span>
              <input type="number" class="form-control-inner" v-model="consultFee" placeholder="请输入挂号费" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">分销推荐人</label>
            <t-select v-model="selectedPromoterId" clearable filterable placeholder="选择分销推荐人（可选）" :options="promoterOptions" />
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
    
    <!-- 统一共用新患者建档弹窗 -->
    <PatientCreateDialog
      v-model:visible="createVisible"
      :default-name="searchQuery"
      @success="handleCreatePatientSuccess"
    />

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
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in billingItems" :key="idx" style="border-bottom: 1px solid #F3F4F6; font-size: 13px;">
              <td style="padding: 8px;">
                <div style="min-height: 30px; display: flex; align-items: center; padding: 0 8px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; color: #374151;">
                  {{ item.product_name }}
                </div>
              </td>
              <td style="padding: 8px;">¥{{ (item.price / 100).toFixed(2) }}</td>
              <td style="padding: 8px;">
                <div style="min-height: 30px; display: flex; align-items: center; justify-content: center; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; color: #374151;">
                  {{ item.quantity }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

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
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  padding: 10px;
  text-align: center;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms;
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
  font-size: 24px;
  color: #9CA3AF;
  cursor: pointer;
  user-select: none;
  transition: color 150ms;
  line-height: 1;
}
.month-arrow:hover {
  color: var(--primary-500);
}
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
