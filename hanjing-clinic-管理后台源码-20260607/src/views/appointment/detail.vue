<script setup lang="ts">
import { formatShanghaiDateTime } from '@/utils/dateTime'
import { appointmentTimeline } from '@/utils/appointmentTimeline'
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { createCheckoutLifecycle, settleCashierAppointment, type CheckoutAttempt } from '@/utils/checkoutLifecycle'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { navigateToParent } from '@/utils/routeNavigation'
import {
  createBillingItem,
  createCashierSession,
  appointmentBillingItems,
  createCheckoutReceiptResult,
  confirmedCashierReceipt,
  fetchCheckoutProducts,
  findCheckoutProduct,
  type BillingItem,
  type CheckoutProduct
} from '@/utils/checkoutProducts'
import TechnicianSelect from '@/components/TechnicianSelect.vue'
import { createNativePay, getAdminPayStatus, isPaidStatus } from '@/utils/wechatCashier'
import { speakMandarin } from '@/utils/speech'

const route = useRoute()
const router = useRouter()
const appointmentId = ref(route.params.id as string || '1')
const detailReady = ref(false)
let detailRequestVersion = 0
watch(() => route.fullPath, () => {
  appointmentId.value = String(route.params.id || '')
  fetchAppointmentDetail()
})

/* ---- Appointment Data ---- */
const levelMap: Record<string, string> = {
  normal: '普通',
  silver: 'VIP',
  gold: 'VIP',
  diamond: 'SVIP'
}

const appointmentTypeMap: Record<string, string> = {
  first: '初诊',
  followup: '复诊',
  adjust: '调整'
}

const formatAppointmentType = (type?: string) => {
  const key = String(type || '').trim()
  return appointmentTypeMap[key] || '门诊预约'
}

const formatDateOnly = (value: any) => {
  const text = String(value || '').trim()
  if (!text) return ''
  const matched = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (matched) return matched[1]
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const appointment = ref<any>({
  id: appointmentId.value,
  patient_id: null,
  no: '',
  status: '',
  createTime: '',
  patient: '',
  phone: '',
  gender: '',
  age: '',
  level: '',
  isNew: false,
  doctor: '',
  dept: '',
  store: '',
  dateTime: '',
  type: '',
  fee: '0.00',
  feeStatus: 'paid',
  source: '',
  referralPromoter: '',
  symptom: '',
  pre_exam: null,
  latest_pre_exam: null,
  previous_pre_exam: null
})

const patientHistory = ref<any[]>([])
const patientSummary = ref<{visit_count:number; receipts:number; refunds:number; net_receipts:number} | null>(null)
const historyTotal = ref<number | null>(null)
const historyError = ref(false)

const fetchPatientHistory = async (patientId: number, version: number) => {
  try {
    const res: any = await request.get('/api/admin/appointments', {
      params: { patient_id: patientId, page: 1, pageSize: 50 }
    })
    if (version === detailRequestVersion && res.code === 200 && res.data && res.data.list) {
      patientHistory.value = res.data.list
      historyTotal.value = Number.isSafeInteger(res.data.total) ? res.data.total : null
    }
  } catch (error) {
    console.error('获取患者历史预约失败:', error)
    if (version === detailRequestVersion) historyError.value = true
  }
}

const timelineSteps = computed(() => appointmentTimeline(appointment.value))

const getStatusText = (status: string) => {
  if (status === 'arrived' || status === 'settled') return '已完成'
  if (status === 'completed') return '待结算'
  if (status === 'checked_in') return '就诊中'
  if (status === 'confirmed' || status === 'waiting') return '候诊中'
  if (status === 'pending') return '已预约'
  if (status === 'pending_payment') return '待支付'
  if (status === 'cancelled') return '已取消'
  if (status === 'no_show') return '未到诊'
  return status
}

const getStatusTagClass = (status: string) => {
  if (status === 'arrived' || status === 'settled') return 'gray'
  if (status === 'completed') return 'red'
  if (status === 'checked_in') return 'green'
  if (status === 'confirmed' || status === 'waiting') return 'blue'
  if (status === 'pending') return 'green'
  if (status === 'pending_payment') return 'orange'
  if (status === 'cancelled') return 'gray'
  if (status === 'no_show') return 'orange'
  return 'default'
}

const formatHistDate = (dateStr: string) => {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`
  }
  return dateStr
}

const fetchAppointmentDetail = async () => {
  const version = ++detailRequestVersion
  const targetId = appointmentId.value
  detailReady.value = false
  patientHistory.value = []
  patientSummary.value = null
  historyTotal.value = null
  historyError.value = false
  try {
    const res: any = await request.get(`/api/admin/appointments/${targetId}`, {params:{include_patient_summary:1}})
    if (version !== detailRequestVersion || targetId !== String(route.params.id)) return
    if (res.code === 200 && res.data) {
      const appt = res.data
      if (String(appt.id) !== targetId) throw new Error('预约详情不匹配')
      if (appt.patient_summary && ['visit_count','receipts','refunds','net_receipts'].every(key => Number.isSafeInteger(appt.patient_summary[key]))) {
        patientSummary.value = appt.patient_summary
      }
      if (appt.patient_id) {
        fetchPatientHistory(appt.patient_id, version)
      }
      appointment.value = {
        id: appt.id.toString(),
        patient_id: appt.patient_id,
        no: appt.appointment_no,
        status: appt.status,
        createTime: appt.created_at ? formatShanghaiDateTime(appt.created_at, false) : '',
        patient: appt.patient_name,
        patientNo: appt.patient_no || '未生成',
        phone: appt.patient_phone,
        gender: appt.patient_gender === 1 ? '男' : appt.patient_gender === 2 ? '女' : '未知',
        age: appt.patient_age || '--',
        level: levelMap[appt.member_level] || '普通',
        isNew: appt.type === 'first',
        doctor: appt.doctor_name,
        dept: appt.doctor_specialty || '',
        store: appt.store_name,
        dateTime: appt.appointment_date ? `${formatDateOnly(appt.appointment_date)} ${appt.appointment_time}` : appt.appointment_time,
        type: formatAppointmentType(appt.type),
        fee: appt.consult_fee !== null && appt.consult_fee !== undefined ? (appt.consult_fee / 100).toFixed(2) : '0.00',
        feeStatus: appt.status === 'pending_payment' ? 'unpaid' : 'paid',
        source: appt.source === 'mini_app' ? '小程序' : appt.source === 'telephone' ? '电话' : '到店',
        referralPromoter: appt.referral_promoter_name || '',
        symptom: appt.symptom_desc || '',
        deposit: appt.deposit_amount !== null && appt.deposit_amount !== undefined ? (appt.deposit_amount / 100).toFixed(2) : '0.00',
        pre_exam: appt.pre_exam,
        latest_pre_exam: appt.latest_pre_exam,
        previous_pre_exam: appt.previous_pre_exam
      }
      detailReady.value = true
    }
  } catch (error) {
    console.error('获取预约详情失败:', error)
    if (version === detailRequestVersion) MessagePlugin.error('获取预约详情失败')
  }
}

const checkInVisible = ref(false)
const checkInForm = ref({
  height: '',
  weight: '',
  systolicBp: '',
  diastolicBp: '',
  neckCircumference: ''
})

const checkInBmi = computed(() => {
  const h = parseFloat(checkInForm.value.height)
  const w = parseFloat(checkInForm.value.weight)
  if (h > 0 && w > 0) {
    return (w / ((h / 100) * (h / 100))).toFixed(1)
  }
  return ''
})

async function openCheckInDialog() {
  checkInForm.value = {
    height: '',
    weight: '',
    systolicBp: '',
    diastolicBp: '',
    neckCircumference: ''
  }
  try {
    const res: any = await request.get(`/api/admin/appointments/${appointment.value.id}/pre-exam`)
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
}

async function handleCheckInSkip() {
  try {
    await request.put(`/api/admin/appointments/${appointment.value.id}`, { status: 'confirmed' })
    MessagePlugin.success(`患者 ${appointment.value.patient} 签到成功（已跳过体征录入）`)
    checkInVisible.value = false
    fetchAppointmentDetail()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('签到失败')
  }
}

async function handleCheckInSubmit() {
  const { height, weight, systolicBp, diastolicBp, neckCircumference } = checkInForm.value
  if (!height || !weight) {
    MessagePlugin.warning('请填写身高和体重')
    return
  }
  try {
    await request.post(`/api/admin/appointments/${appointment.value.id}/pre-exam`, {
      height: parseFloat(height),
      weight: parseFloat(weight),
      systolicBp: systolicBp ? parseInt(systolicBp) : null,
      diastolicBp: diastolicBp ? parseInt(diastolicBp) : null,
      neckCircumference: neckCircumference ? parseFloat(neckCircumference) : null,
      bmi: checkInBmi.value ? parseFloat(checkInBmi.value) : null
    })
    const isPending = ['pending', 'pending_payment'].includes(appointment.value.status)
    if (isPending) {
      await request.put(`/api/admin/appointments/${appointment.value.id}`, { status: 'confirmed' })
      MessagePlugin.success(`患者 ${appointment.value.patient} 签到与预检体征录入成功`)
    } else {
      MessagePlugin.success(`患者 ${appointment.value.patient} 预检体征录入成功`)
    }
    checkInVisible.value = false
    fetchAppointmentDetail()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('体征录入失败')
  }
}

// 诊车收费结算相关状态与方法
const checkoutVisible = ref(false)
const checkoutLoading = ref(false)
const checkoutSuccess = ref(false)
const orderResult = ref<any>(null)
const nativePayInfo = ref<any>(null)
const nativePayReceipt = ref<any>(null)
const payWaiting = ref(false)
const cashierSession = createCashierSession(request)
const checkoutFlow = createCheckoutLifecycle(() => `${route.fullPath}:${appointmentId.value}`)

const deliveryType = ref<string>('offline_direct')
const shippingReceiver = ref<string>('')
const shippingPhone = ref<string>('')
const shippingAddressStr = ref<string>('')

const productOptions = ref<CheckoutProduct[]>([])

const fetchProducts = async () => {
  try {
    productOptions.value = await fetchCheckoutProducts(request)
  } catch (error) {
    console.error('获取商品列表失败:', error)
    MessagePlugin.error('获取商品列表失败')
  }
}

const billingItems = ref<BillingItem[]>([])
const discountAmount = ref<number>(0)
const payMethod = ref<'cash' | 'wechat' | 'wechat_native'>('cash')
const fulfillmentTechnicianId = ref<string>('')
const isRegistrationCheckout = computed(() => appointment.value?.status === 'pending_payment')

const totalAmount = computed(() => {
  return billingItems.value.reduce((sum, item) => sum + (item.price * item.quantity), 0)
})

const payableAmount = computed(() => {
  const diff = totalAmount.value - discountAmount.value
  return diff > 0 ? diff : 0
})

function addBillingItem() {
  if (isRegistrationCheckout.value) return
  const product = findCheckoutProduct(productOptions.value)
  if (!product) {
    MessagePlugin.warning('暂无可添加的上架商品')
    return
  }
  billingItems.value.push(createBillingItem(product))
}

function removeBillingItem(idx: number) {
  if (isRegistrationCheckout.value) return
  billingItems.value.splice(idx, 1)
}

function onProductChange(idx: number, prodId: string) {
  const prod = productOptions.value.find(p => String(p.id) === String(prodId))
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

async function openCheckoutDialog() {
  if (!detailReady.value || String(appointment.value.id) !== appointmentId.value) {
    MessagePlugin.warning('请等待当前预约详情加载完成后再收银')
    return
  }
  const attempt = checkoutFlow.begin()
  cashierSession.reset()
  checkoutSuccess.value = false
  checkoutLoading.value = true
  if (productOptions.value.length === 0) await fetchProducts()
  try {
    if (!checkoutFlow.isCurrent(attempt)) return
    const items = await appointmentBillingItems(request, productOptions.value, appointmentId.value)
    if (!checkoutFlow.isCurrent(attempt)) return
    billingItems.value = isRegistrationCheckout.value
      ? items.map(item => ({ ...item, quantity: 1 }))
      : items
  } catch (error: any) {
    if (checkoutFlow.isCurrent(attempt)) MessagePlugin.error(error.message || '获取预约收费信息失败')
    return
  } finally {
    if (checkoutFlow.isCurrent(attempt)) checkoutLoading.value = false
  }
  discountAmount.value = 0
  payMethod.value = 'cash'
  fulfillmentTechnicianId.value = ''
  checkoutSuccess.value = false
  orderResult.value = null
  nativePayInfo.value = null
  nativePayReceipt.value = null
  payWaiting.value = false
  
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
  stopPayPolling()
}

function stopPayPolling() {
  checkoutFlow.invalidate()
}

function leaveCheckout() {
  detailRequestVersion++
  detailReady.value = false
  historyRequestVersion++
  historyDialogVisible.value = false
  paginatedHistory.value = []
  stopPayPolling()
  checkoutLoading.value = false
  checkoutVisible.value = false
}
onBeforeRouteLeave(leaveCheckout)
onBeforeRouteUpdate(leaveCheckout)

async function markCheckoutPaid(receipt: any, attempt: CheckoutAttempt | null, isActive = () => checkoutFlow.isCurrent(attempt)) {
  if (!isActive() || String(receipt.orderId) !== attempt?.orderId) return
  receipt = await confirmedCashierReceipt(request, receipt)
  if (!isActive()) return
  checkoutFlow.stopPolling()
  nativePayInfo.value = null
  nativePayReceipt.value = null
  payWaiting.value = false
  orderResult.value = createCheckoutReceiptResult(receipt)
  checkoutSuccess.value = true
  MessagePlugin.success('收款成功')
}

function startPayPolling(orderId: number | string, receipt: any, attempt: CheckoutAttempt | null) {
  if (!checkoutFlow.isCurrent(attempt) || attempt.orderId !== String(orderId)) return
  payWaiting.value = true
  checkoutFlow.poll(attempt, async isActive => {
    try {
      const status = await getAdminPayStatus(orderId)
      if (!isActive()) return
      if (['cancelled', 'refund_pending', 'refunding', 'refunded'].includes(status.status)) {
        checkoutFlow.stopPolling()
        payWaiting.value = false
        MessagePlugin.warning('订单已关闭或进入退款，请核对原订单')
        return
      }
      if (isPaidStatus(status.status)) {
        await markCheckoutPaid(Object.assign({}, receipt, { payAt: status.payAt }), attempt, isActive)
      }
    } catch (error) {
      if (isActive()) console.error('查询支付状态失败:', error)
    }
  })
}

onUnmounted(() => stopPayPolling())

async function completeCheckoutSettlement() {
  if (!appointment.value || !orderResult.value || checkoutLoading.value) return
  const attempt = checkoutFlow.capture()
  const isActive = () => checkoutFlow.isCurrent(attempt) && String(orderResult.value?.orderId) === attempt?.orderId
  if (!isActive()) return
  const targetId = appointmentId.value
  checkoutLoading.value = true
  try {
    if (!await settleCashierAppointment(request, targetId, isActive)) return
    MessagePlugin.success('结算已完成')
    checkoutLoading.value = false
    stopPayPolling()
    checkoutVisible.value = false
    checkoutSuccess.value = false
    orderResult.value = null
    fetchAppointmentDetail()
  } catch (err) {
    console.error('完成结算失败:', err)
    if (isActive()) MessagePlugin.error('完成结算失败，请刷新预约状态后重试')
  } finally {
    if (isActive()) checkoutLoading.value = false
  }
}

function handlePrintInvoice() {
  document.body.classList.add('printing-invoice')
  const cleanup = () => document.body.classList.remove('printing-invoice')
  window.addEventListener('afterprint', cleanup, { once: true })
  window.print()
  window.setTimeout(cleanup, 1000)
}

async function submitCheckout() {
  if (checkoutLoading.value) return
  if (!detailReady.value || String(appointment.value.id) !== appointmentId.value) return
  const attempt = checkoutFlow.capture()
  if (!checkoutFlow.isCurrent(attempt)) return
  if (!appointment.value) return
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
        detail: shippingAddressStr.value,
        deliveryMethod: 'online'
      }
    } else if (deliveryType.value === 'offline_pending') {
      orderType = 'offline'
      orderStatus = 'processing'
      shipAddr = {
        receiver: shippingReceiver.value,
        phone: shippingPhone.value,
        detail: '缺货登记（待货通知自提）',
        deliveryMethod: 'pickup_pending'
      }
    } else {
      orderType = 'offline'
      orderStatus = 'paid'
      shipAddr = {
        receiver: shippingReceiver.value,
        phone: shippingPhone.value,
        detail: '到店自提',
        deliveryMethod: 'pickup'
      }
    }

    const payload = {
      patient_id: appointment.value.patient_id,
      items: billingItems.value.map(item => ({
        ...item,
        quantity: isRegistrationCheckout.value ? 1 : item.quantity
      })),
      pay_amount: payableAmount.value,
      discount_amount: discountAmount.value,
      pay_method: payMethod.value,
      payment_confirmed: payMethod.value === 'cash',
      technician_id: fulfillmentTechnicianId.value ? Number(fulfillmentTechnicianId.value) : undefined,
      appointment_id: Number(appointmentId.value),
      type: isRegistrationCheckout.value ? 'offline' : orderType,
      status: isRegistrationCheckout.value ? 'paid' : orderStatus,
      shipping_address: isRegistrationCheckout.value ? null : shipAddr
    }
    if (payMethod.value === 'cash' && !window.confirm('请确认已实际收到现金。确认后将登记本次线下收款。')) return
    const res: any = await cashierSession.submit(payload)
    if (!checkoutFlow.isCurrent(attempt)) return
    if (res.code === 200) {
      if (!checkoutFlow.bindOrder(attempt, res.data.order_id)) return
      const receipt = res.data.receipt
      if (payload.pay_method === 'wechat') {
        checkoutFlow.invalidate()
        checkoutVisible.value = false
        MessagePlugin.success('待支付订单已发送至用户小程序，请用户在预约详情中支付')
        fetchAppointmentDetail()
      } else if (payload.pay_method === 'wechat_native') {
        const payInfo = await createNativePay(res.data.order_id)
        if (!checkoutFlow.isCurrent(attempt)) return
        if (payInfo.paid) {
          await markCheckoutPaid(receipt, attempt)
        } else {
          nativePayInfo.value = payInfo
          nativePayReceipt.value = receipt
          startPayPolling(res.data.order_id, Object.assign({}, receipt, { payMethod: 'wechat_native' }), attempt)
          MessagePlugin.info('支付二维码已生成，可直接打印给用户扫码')
        }
      } else {
        await markCheckoutPaid(receipt, attempt)
      }
    }
  } catch (error) {
    console.error(error)
    if (checkoutFlow.isCurrent(attempt)) MessagePlugin.error('结算收费失败')
  } finally {
    if (checkoutFlow.isCurrent(attempt)) checkoutLoading.value = false
  }
}

// 叫号
const callPatient = () => {
  const text = `请患者 ${appointment.value.patient}，到 ${appointment.value.doctor} 医生诊室就诊。`
  if (speakMandarin(text)) {
    MessagePlugin.success(`呼叫广播成功: "${text}"`)
  } else {
    MessagePlugin.warning('浏览器不支持语音播报，已通过系统弹窗提示')
  }
}

// 标记为未到诊
async function markAsNoShow() {
  try {
    await request.put(`/api/admin/appointments/${appointment.value.id}`, { status: 'no_show' })
    MessagePlugin.success(`已将患者 ${appointment.value.patient} 标记为未到诊`)
    fetchAppointmentDetail()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('标记未到诊失败')
  }
}

// 诊疗完成
const completeTreatment = async () => {
  try {
    await request.put(`/api/admin/appointments/${appointment.value.id}`, { status: 'completed' })
    MessagePlugin.success(`患者 ${appointment.value.patient} 诊疗已完成`)
    await fetchAppointmentDetail()
    openCheckoutDialog()
  } catch (error) {
    console.error(error)
  }
}

const historyDialogVisible = ref(false)
const historyPage = ref(1)
const historyPageSize = ref(10)
const paginatedHistory = ref<any[]>([])
const historyLoading = ref(false)
const historyPageError = ref(false)
let historyRequestVersion = 0

async function loadHistoryPage(pageInfo = {current:historyPage.value,pageSize:historyPageSize.value}) {
  if (!detailReady.value || !appointment.value.patient_id) return
  const version = ++historyRequestVersion
  const detailVersion = detailRequestVersion
  historyPage.value = pageInfo.current
  historyPageSize.value = pageInfo.pageSize
  paginatedHistory.value = []
  historyLoading.value = true
  historyPageError.value = false
  try {
    const res: any = await request.get('/api/admin/appointments', {params:{patient_id:appointment.value.patient_id,page:pageInfo.current,pageSize:pageInfo.pageSize}})
    if (version !== historyRequestVersion || detailVersion !== detailRequestVersion) return
    if (res.code !== 200 || !Array.isArray(res.data?.list) || !Number.isSafeInteger(res.data.total)) throw new Error('Invalid history response')
    paginatedHistory.value = res.data.list
    historyTotal.value = res.data.total
  } catch (error) {
    if (version === historyRequestVersion && detailVersion === detailRequestVersion) historyPageError.value = true
  } finally {
    if (version === historyRequestVersion) historyLoading.value = false
  }
}

function openHistoryDialog() {
  historyPage.value = 1
  historyDialogVisible.value = true
  loadHistoryPage()
}

onMounted(() => {
  fetchAppointmentDetail()
  fetchProducts()
})

function handleBack() {
  navigateToParent(router, route, '/appointment')
}

function handlePrint() {
  const oldTitle = document.title
  document.title = '兴康明诊所'
  window.print()
  setTimeout(() => {
    document.title = oldTitle
  }, 1000)
}

function handleReschedule() {
  router.push(`/appointment/create?reschedule=1&id=${appointmentId.value}`)
}

async function handleCancel() {
  try {
    await request.put(`/api/admin/appointments/${appointmentId.value}`, { status: 'cancelled', cancel_reason: '后台管理员手动取消' })
    MessagePlugin.success(`预约单 ${appointment.value.no} 已成功取消。`)
    fetchAppointmentDetail()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('取消预约失败')
  }
}

function handleViewProfile() {
  if (appointment.value.patient_id) {
    router.push(`/patient/detail/${appointment.value.patient_id}`)
  } else {
    MessagePlugin.warning('暂无关联的患者档案ID')
  }
}
</script>

<template>
  <div class="page-container">
    <!-- 打印预览专用页眉 -->
    <div class="print-header">兴康明诊所</div>

    <!-- Header Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">
          {{ appointment.no }}
          <span class="status-tag gray" v-if="appointment.status === 'arrived'">已完成</span>
          <span class="status-tag red" v-else-if="appointment.status === 'completed'">待结算</span>
          <span class="status-tag green" v-else-if="appointment.status === 'checked_in'">就诊中</span>
          <span class="status-tag blue" v-else-if="appointment.status === 'confirmed' || appointment.status === 'waiting'">候诊中</span>
          <span class="status-tag green" v-else-if="appointment.status === 'pending'">已预约</span>
          <span class="status-tag gray" v-else-if="appointment.status === 'cancelled'">已取消</span>
          <span class="status-tag orange" v-else-if="appointment.status === 'no_show'">未到诊</span>
        </div>
        <div class="page-title-sub">创建于 {{ appointment.createTime }} · {{ appointment.source }}预约</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" @click="handlePrint"><AppIcon name="print" />  打印</button>
        
        <!-- 挂号收银 -->
        <button
          v-if="appointment.status === 'pending_payment'"
          class="btn btn-primary"
          @click="openCheckoutDialog"
        >挂号收银</button>

        <!-- 签到 -->
        <button
          v-if="appointment.status === 'pending'"
          class="btn btn-primary"
          @click="openCheckInDialog"
        >签到</button>

        <!-- 叫号 -->
        <button
          v-if="appointment.status === 'waiting' || appointment.status === 'confirmed'"
          class="btn btn-warning"
          @click="callPatient"
        ><AppIcon name="megaphone" />  叫号</button>

        <!-- 未到诊 -->
        <button
          v-if="appointment.status === 'pending' || appointment.status === 'waiting' || appointment.status === 'confirmed'"
          class="btn btn-outline"
          @click="markAsNoShow"
        >未到诊</button>

        <!-- 诊疗完成 -->
        <button
          v-if="appointment.status === 'checked_in'"
          class="btn btn-success"
          @click="completeTreatment"
        >诊疗完成</button>

        <!-- 收银结算 -->
        <button
          v-if="appointment.status === 'completed'"
          class="btn btn-warning"
          @click="openCheckoutDialog"
        >收银结算</button>

        <!-- 改约 -->
        <button
          v-if="appointment.status === 'pending_payment' || appointment.status === 'pending' || appointment.status === 'waiting' || appointment.status === 'confirmed'"
          class="btn btn-warning"
          @click="handleReschedule"
        >
          <AppIcon name="edit" />  改约
        </button>

        <!-- 取消 -->
        <button class="btn btn-danger" @click="handleCancel" v-if="appointment.status === 'pending_payment' || appointment.status === 'pending'"><AppIcon name="x-circle" />  取消</button>
      </div>
    </div>

    <!-- Two-Column Panel Info -->
    <div class="card-grid-2">
      <!-- Patient Info -->
      <div class="panel" style="margin: 0; display: flex; flex-direction: column;">
        <div class="panel-header">
          <div class="panel-title"><AppIcon name="patient" />  患者信息</div>
          <button class="btn btn-sm btn-outline" @click="handleViewProfile">查看档案</button>
        </div>
        <div class="panel-body" style="flex: 1; display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; gap: 14px; align-items: flex-start;">
            <div class="avatar avatar-lg" style="background: linear-gradient(135deg, var(--primary-500), #2A52D4);">{{ appointment.patient ? appointment.patient[0] : '' }}</div>
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 18px; font-weight: 700; color: #111827;">{{ appointment.patient }}</span>
                <span class="tag tag-gold">{{ appointment.level }}</span>
                <span class="tag tag-blue">{{ appointment.type }}</span>
              </div>
              <div style="font-size: 13px; color: #6B7280; line-height: 1.8;">
                {{ appointment.gender }} · {{ appointment.age }}岁 · {{ appointment.phone }}<br>
                病历号 {{ appointment.patientNo }} · 可见就诊 {{ patientSummary?.visit_count ?? '--' }}次 ·
                <span title="当前权限范围内，明确归属此患者的订单实收减已确认退款；不含无法归属患者的账号订单">归属净收款 {{ patientSummary ? '¥' + (patientSummary.net_receipts / 100).toFixed(2) : '--' }}</span>
              </div>
            </div>
          </div>

          <!-- Vitals Section -->
          <div class="vitals-section" style="margin-bottom: 0;">
            <div class="section-sub-title" style="display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4.8 3h14.4"></path>
                  <path d="M4.8 3v4.8c0 4.8 7.2 4.8 7.2 9.6v1.8"></path>
                  <path d="M19.2 3v4.8c0 3.6-3.6 4.8-4.8 6.4"></path>
                  <circle cx="12" cy="21" r="2"></circle>
                </svg>
                <span>预检体征数据 (由分诊/护士录入)</span>
              </div>
              <t-button
                v-if="!['completed', 'arrived', 'settled', 'cancelled', 'no_show'].includes(appointment.status)"
                size="extra-small"
                theme="primary"
                variant="outline"
                @click="openCheckInDialog"
              >
                {{ appointment.pre_exam ? '编辑预检体征数据' : '录入预检体征数据' }}
              </t-button>
            </div>
            
            <div v-if="appointment.pre_exam" class="vitals-grid">
              <div class="vital-item">
                <span class="vital-lbl">身高</span>
                <span class="vital-val">{{ appointment.pre_exam.height }} cm</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">体重</span>
                <span class="vital-val">{{ appointment.pre_exam.weight }} kg</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">收缩压 (高压)</span>
                <span class="vital-val">{{ appointment.pre_exam.systolic_bp || '--' }} mmHg</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">舒张压 (低压)</span>
                <span class="vital-val">{{ appointment.pre_exam.diastolic_bp || '--' }} mmHg</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">颈围</span>
                <span class="vital-val">{{ appointment.pre_exam.neck_circumference || '--' }} cm</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">BMI 指数</span>
                <span class="vital-val text-blue">{{ appointment.pre_exam.bmi || '--' }}</span>
              </div>
            </div>
            <div v-else class="vitals-empty" style="display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span>暂无预检体征数据</span>
            </div>
          </div>

          <!-- Previous Vitals Section -->
          <div v-if="!appointment.pre_exam && !['completed', 'arrived', 'settled', 'cancelled', 'no_show'].includes(appointment.status)" class="vitals-section previous-vitals-section" style="margin-bottom: 0; margin-top: 12px;">
            <div class="section-sub-title" style="display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4.8 3h14.4"></path>
                <path d="M4.8 3v4.8c0 4.8 7.2 4.8 7.2 9.6v1.8"></path>
                <path d="M19.2 3v4.8c0 3.6-3.6 4.8-4.8 6.4"></path>
                <circle cx="12" cy="21" r="2"></circle>
              </svg>
              <span>上次预检体征数据 (由分诊/护士录入)</span>
            </div>
            
            <div v-if="appointment.previous_pre_exam" class="vitals-grid">
              <div class="vital-item">
                <span class="vital-lbl">身高</span>
                <span class="vital-val">{{ appointment.previous_pre_exam.height }} cm</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">体重</span>
                <span class="vital-val">{{ appointment.previous_pre_exam.weight }} kg</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">收缩压 (高压)</span>
                <span class="vital-val">{{ appointment.previous_pre_exam.systolic_bp || '--' }} mmHg</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">舒张压 (低压)</span>
                <span class="vital-val">{{ appointment.previous_pre_exam.diastolic_bp || '--' }} mmHg</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">颈围</span>
                <span class="vital-val">{{ appointment.previous_pre_exam.neck_circumference || '--' }} cm</span>
              </div>
              <div class="vital-item">
                <span class="vital-lbl">BMI 指数</span>
                <span class="vital-val text-blue">{{ appointment.previous_pre_exam.bmi || '--' }}</span>
              </div>
            </div>
            <div v-else class="vitals-empty" style="display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#D97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              <span>暂无预检体征数据</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Appointment Info -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header">
          <div class="panel-title"><AppIcon name="calendar" />  预约信息</div>
        </div>
        <div class="info-grid" style="grid-template-columns: 1fr 1fr;">
          <div class="info-item">
            <div class="info-label">就诊门店</div>
            <div class="info-value"><AppIcon name="store" />  {{ appointment.store }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">就诊医生</div>
            <div class="info-value"><AppIcon name="doctor" />  {{ appointment.doctor }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">科室</div>
            <div class="info-value">{{ appointment.dept }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">预约时间</div>
            <div class="info-value" style="color: var(--primary-500);">{{ appointment.dateTime }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">预约来源</div>
            <div class="info-value"><span class="tag tag-green">{{ appointment.source }}</span><div v-if="appointment.referralPromoter">推荐人：{{ appointment.referralPromoter }}</div></div>
          </div>
          <div class="info-item">
            <div class="info-label">挂号费</div>
            <div class="info-value" style="color: var(--primary-500);">¥{{ appointment.fee }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">预约定金</div>
            <div class="info-value" style="color: var(--primary-500);">¥{{ appointment.deposit }}</div>
          </div>
          <div class="info-item" style="grid-column: span 2; border-top: 1px dashed #E5E7EB; padding-top: 12px; margin-top: 4px;">
            <div class="info-label">病症描述/主诉</div>
            <div class="info-value" :style="{ color: appointment.symptom ? '#4B5563' : '#9CA3AF', fontWeight: 'normal', lineHeight: '1.6' }">
              {{ appointment.symptom || '无主诉描述' }}
            </div>
          </div>
        </div>
      </div>
    </div>


    <!-- Timeline Progress -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title"><AppIcon name="clipboard" />  预约流程</div></div>
      <div class="panel-body">
        <div class="timeline">
          <div class="timeline-item" v-for="(step, idx) in timelineSteps" :key="idx">
            <div :class="['timeline-dot', step.dot]"></div>
            <div class="timeline-time">{{ step.time }}</div>
            <div class="timeline-content"><strong>{{ step.title }}</strong> · {{ step.content }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Patient History Table -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header">
        <div class="panel-title"><AppIcon name="history" />  历史预约（{{ historyTotal ?? '--' }}条）</div>
        <button class="btn btn-sm btn-outline" @click="openHistoryDialog">查看全部</button>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>预约单号</th>
            <th>日期</th>
            <th>门店</th>
            <th>医生</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="hist in patientHistory.slice(0, 5)" :key="hist.id">
            <td style="font-family: monospace; font-size: 12px; color: #9CA3AF;">{{ hist.appointment_no }}</td>
            <td>{{ formatHistDate(hist.appointment_date) }}</td>
            <td>{{ hist.store_name }}</td>
            <td>{{ hist.doctor_name }}</td>
            <td>
              <span :class="['status-tag', getStatusTagClass(hist.status)]">
                {{ getStatusText(hist.status) }}
              </span>
            </td>
          </tr>
          <tr v-if="historyError"><td colspan="5">历史预约加载失败</td></tr>
          <tr v-else-if="patientHistory.length === 0">
            <td colspan="5" style="text-align: center; color: #9CA3AF; padding: 20px;">暂无历史预约记录</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 门诊收费结算收银弹窗 -->
    <t-dialog
      v-model:visible="checkoutVisible"
      header="门诊电子收银结算与划扣"
      width="540px"
      :footer="null"
      @cancel="closeCheckoutDialog"
    >
      <div v-if="appointment" class="dialog-body-form" style="padding: 10px 0;">
        <div v-if="checkoutSuccess">
          <div style="margin-bottom: 16px; font-size: 14px; color: #374151;">
            收费结算单支付收款成功！交易收费凭证信息如下：
          </div>
          <div class="invoice-box" style="background: #F3F4F6; padding: 16px; border-radius: 8px; font-family: monospace; border: 1px dashed #D1D5DB;">
            <div style="font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 10px; color: #000;">兴康明诊所 · 收费凭证</div>
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
              谢谢惠顾，请妥善保管收款凭证。
            </div>
          </div>
          <div style="margin-top: 20px; display: flex; gap: 12px;">
            <t-button variant="outline" @click="handlePrintInvoice" style="display: inline-flex; align-items: center; gap: 4px;"><AppIcon name="print" /> 打印小票</t-button>
            <t-button theme="primary" :loading="checkoutLoading" @click="completeCheckoutSettlement">完成结算</t-button>
          </div>
        </div>

        <div v-else-if="nativePayInfo" class="native-payment-view">
          <div class="invoice-box native-payment-sheet">
            <div class="invoice-title">兴康明诊所 · 扫码支付单</div>
            <div class="invoice-divider">================================</div>
            <div class="invoice-row"><span>交易单号:</span><span>{{ nativePayReceipt?.orderNo }}</span></div>
            <div class="invoice-row"><span>结账客户:</span><span>{{ nativePayReceipt?.patientName }}</span></div>
            <div class="invoice-divider">--------------------------------</div>
            <div v-for="item in nativePayReceipt?.items" :key="item.productId" class="invoice-row">
              <span>{{ item.productName }} x{{ item.quantity }}</span>
              <span>¥{{ ((item.price * item.quantity) / 100).toFixed(2) }}</span>
            </div>
            <div class="invoice-divider">--------------------------------</div>
            <div class="invoice-row invoice-payable"><span>待支付金额:</span><span>¥{{ (Number(nativePayReceipt?.payAmount || 0) / 100).toFixed(2) }}</span></div>
            <div class="invoice-payment-footer">
              <div class="invoice-payment-copy"><strong>微信扫码支付</strong><span>等待用户完成支付</span></div>
              <div class="invoice-payment-qr">
                <img :src="nativePayInfo.qrCodeImageUrl" alt="微信扫码支付二维码">
                <span>请使用微信扫码支付</span>
              </div>
            </div>
          </div>
          <div class="native-payment-actions">
            <t-button variant="outline" @click="handlePrintInvoice"><AppIcon name="print" /> 打印支付单</t-button>
            <t-button theme="default" @click="closeCheckoutDialog">关闭</t-button>
          </div>
        </div>

        <div v-else class="dialog-body-form" style="padding: 10px 0;">
          <div style="margin-bottom: 16px; font-size: 14px; color: #374151;">
            正在为患者 <strong>{{ appointment.patient }}</strong> 开立收费结算账单：
          </div>

          <!-- Checkout Items Table -->
          <table class="billing-table" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <thead>
              <tr style="background: #F9FAFB; border-bottom: 1px solid #E5E7EB; text-align: left; font-size: 12px; color: #4B5563;">
                <th style="padding: 8px;">项目/商品名称</th>
                <th style="padding: 8px; width: 100px;">单价</th>
                <th style="padding: 8px; width: 60px;">数量</th>
                <th v-if="!isRegistrationCheckout" style="padding: 8px; width: 50px;">操作</th>
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
                  <div v-if="isRegistrationCheckout" class="fixed-quantity">1</div>
                  <input v-else v-model="item.quantity" type="number" class="form-control" style="height: 30px; padding: 2px 6px; text-align: center;" min="1">
                </td>
                <td v-if="!isRegistrationCheckout" style="padding: 8px;">
                  <button class="btn-text-del" @click="removeBillingItem(idx)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>

          <button v-if="!isRegistrationCheckout" class="btn-add-item" style="margin-bottom: 16px;" @click="addBillingItem"><AppIcon name="plus" />  添加诊疗费/项目/药品</button>

          <!-- Discount & Delivery selector -->
          <div style="display: flex; gap: 16px; margin-bottom: 16px;">
            <div v-if="!isRegistrationCheckout" class="form-group" style="flex: 1;">
              <label class="form-label">卡券折扣金额 (元)</label>
              <t-input-number v-model="discountAmount" :min="0" :step="1000" :format="(val: string | number) => `¥${(Number(val) / 100).toFixed(2)}`" style="width: 100%;" />
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
          <div v-if="!isRegistrationCheckout && deliveryType === 'online'" style="background: #F9FAFB; padding: 12px; border-radius: 8px; border: 1px solid #E5E7EB; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;">
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
          <div v-if="!isRegistrationCheckout && deliveryType === 'offline_pending'" style="background: #FFFBEB; padding: 12px; border-radius: 8px; border: 1px solid #FCD34D; margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px;">
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
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
              <label class="pay-method-label" :class="{ active: payMethod === 'cash' }">
                <input v-model="payMethod" type="radio" value="cash" style="display: none;">
                <AppIcon name="money" />  现金支付
              </label>
              <label class="pay-method-label" :class="{ active: payMethod === 'wechat' }">
                <input v-model="payMethod" type="radio" value="wechat" style="display: none;">
                小程序支付
              </label>
              <label class="pay-method-label" :class="{ active: payMethod === 'wechat_native' }">
                <input v-model="payMethod" type="radio" value="wechat_native" style="display: none;">
                <AppIcon name="qrcode" />  扫码支付
              </label>
            </div>
            <div class="payment-method-tip">{{ payMethod === 'cash' ? '确认后表示线下现金已经实际收取。' : payMethod === 'wechat' ? '将生成待支付订单，并通知用户前往小程序预约详情完成支付。' : '将生成微信支付二维码，可打印支付单交给用户扫码付款。' }}</div>
            <TechnicianSelect v-model="fulfillmentTechnicianId" />
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <t-button theme="default" @click="closeCheckoutDialog">取消</t-button>
            <t-button theme="primary" :loading="checkoutLoading" @click="submitCheckout">{{ payMethod === 'wechat' ? '生成待支付订单并通知' : payMethod === 'wechat_native' ? '生成支付二维码' : '确认现金收款' }} · ¥{{ (payableAmount / 100).toFixed(2) }}</t-button>
          </div>
        </div>
      </div>
    </t-dialog>

    <!-- 签到预检体征录入弹窗 -->
    <t-dialog
      v-model:visible="checkInVisible"
      header="预检体征录入"
      width="480px"
      :footer="null"
      @cancel="closeCheckInDialog"
    >
      <div class="dialog-body-form" style="padding: 10px 0;">
        <div class="form-group" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px;">
          <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">患者姓名</label>
          <input type="text" class="form-control" :value="appointment?.patient" disabled style="background-color: #F3F4F6; width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none;">
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
          <input type="text" class="form-control" :value="checkInBmi" disabled placeholder="输入身高体重后自动计算" style="background-color: #F3F4F6; width: 100%; height: 36px; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; box-sizing: border-box; outline: none; margin-bottom: 16px;">
        </div>
        <!-- Custom Footer -->
        <div style="margin-top: 20px; display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid #E5E7EB; padding-top: 16px;">
          <t-button variant="outline" theme="default" @click="closeCheckInDialog">取消</t-button>
          <t-button
            v-if="['pending', 'pending_payment'].includes(appointment.status)"
            variant="outline"
            theme="warning"
            @click="handleCheckInSkip"
          >跳过录入直接签到</t-button>
          <t-button theme="primary" @click="handleCheckInSubmit">
            {{ ['pending', 'pending_payment'].includes(appointment.status) ? '确认签到' : '确认保存' }}
          </t-button>
        </div>
      </div>
    </t-dialog>

    <!-- 历史预约全部记录弹窗 -->
    <t-dialog
      v-model:visible="historyDialogVisible"
      header="全部历史预约记录"
      width="680px"
      :footer="null"
    >
      <div style="padding: 10px 0;">
        <table class="data-table" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <thead>
            <tr style="background: #F9FAFB; border-bottom: 1px solid #E5E7EB; text-align: left; font-size: 12px; color: #4B5563;">
              <th style="padding: 10px 14px;">预约单号</th>
              <th style="padding: 10px 14px;">日期</th>
              <th style="padding: 10px 14px;">门店</th>
              <th style="padding: 10px 14px;">医生</th>
              <th style="padding: 10px 14px;">状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="hist in paginatedHistory" :key="hist.id" style="border-bottom: 1px solid #F3F4F6;">
              <td style="padding: 10px 14px; font-family: monospace; font-size: 12px; color: #9CA3AF;">{{ hist.appointment_no }}</td>
              <td style="padding: 10px 14px;">{{ formatHistDate(hist.appointment_date) }}</td>
              <td style="padding: 10px 14px;">{{ hist.store_name }}</td>
              <td style="padding: 10px 14px;">{{ hist.doctor_name }}</td>
              <td style="padding: 10px 14px;">
                <span :class="['status-tag', getStatusTagClass(hist.status)]">
                  {{ getStatusText(hist.status) }}
                </span>
              </td>
            </tr>
            <tr v-if="historyLoading"><td colspan="5">加载中</td></tr>
            <tr v-else-if="historyPageError"><td colspan="5">加载失败，请重新打开或切换页码重试</td></tr>
          </tbody>
        </table>
        
        <!-- 分页 -->
        <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
          <t-pagination
            v-model:current="historyPage"
            v-model:pageSize="historyPageSize"
            :total="historyTotal ?? 0"
            @change="loadHistoryPage"
            :pageSizeOptions="[5, 10, 20]"
            size="small"
            style="border: none; padding: 0;"
          />
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>


/* Breadcrumb */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #9CA3AF;
  margin-bottom: 16px;
}
.breadcrumb .current {
  color: #1F2937;
  font-weight: 600;
}
.breadcrumb .sep {
  color: #D1D5DB;
}

/* Screen Label */
.screen-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--primary-500);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.screen-label::before {
  content: '';
  width: 3px;
  height: 16px;
  background: var(--primary-500);
  border-radius: 2px;
}
.screen-sublabel {
  font-size: 12px;
  color: #9CA3AF;
  margin-left: 8px;
  font-weight: 400;
}

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
  display: flex;
  align-items: center;
  gap: 12px;
}
.page-title-sub {
  font-size: 13px;
  color: #9CA3AF;
  margin-top: 4px;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 8px;
}

/* General Layout Elements */
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

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 150ms;
}
.btn-primary {
  background: var(--primary-500);
  color: #fff;
}
.btn-primary:hover {
  background: #2A52D4;
}
.btn-outline {
  background: #fff;
  color: #374151;
  border: 1px solid #E5E7EB;
}
.btn-outline:hover {
  border-color: #BCCFFF;
  color: var(--primary-500);
}
.btn-danger {
  background: #FEF2F2;
  color: #DC2626;
  border: 1px solid #FECACA;
}
.btn-danger:hover {
  background: #FEE2E2;
}
.btn-warning {
  background: #FFFBEB;
  color: #D97706;
  border: 1px solid #FDE68A;
}
.btn-warning:hover {
  background: #FEF3C7;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

/* Grids */
.card-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
}
.info-item {
  padding: 14px 20px;
  border-bottom: 1px solid #F9FAFB;
}
.info-item:nth-child(even) {
  border-left: 1px solid #F9FAFB;
}
.info-label {
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 4px;
}
.info-value {
  font-size: 14px;
  font-weight: 600;
  color: #1F2937;
}

/* Status & Tags */
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.status-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status-tag.green {
  background: #ECFDF5;
  color: #16A34A;
}
.status-tag.green::before {
  background: #22C55E;
}
.status-tag.blue {
  background: #EEF4FF;
  color: #2A52D4;
}
.status-tag.blue::before {
  background: var(--primary-500);
}
.status-tag.gray {
  background: #F3F4F6;
  color: #6B7280;
}
.status-tag.gray::before {
  background: #9CA3AF;
}
.status-tag.red {
  background: #FEF2F2;
  color: #DC2626;
}
.status-tag.red::before {
  background: #EF4444;
}
.status-tag.orange {
  background: #FFFBEB;
  color: #D97706;
}
.status-tag.orange::before {
  background: #F59E0B;
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
.tag-blue {
  background: #EEF4FF;
  color: #2A52D4;
}
.tag-green {
  background: #ECFDF5;
  color: #16A34A;
}

/* Avatar */
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}
.avatar-lg {
  width: 56px;
  height: 56px;
  font-size: 24px;
}

/* Timeline */
.timeline {
  position: relative;
  padding-left: 24px;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: #E5E7EB;
}
.timeline-item {
  position: relative;
  padding-bottom: 20px;
}
.timeline-item:last-child {
  padding-bottom: 0;
}
.timeline-dot {
  position: absolute;
  left: -20px;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 2px #E5E7EB;
}
.timeline-dot.blue {
  background: var(--primary-500);
  box-shadow: 0 0 0 2px #BCCFFF;
}
.timeline-dot.green {
  background: #22C55E;
  box-shadow: 0 0 0 2px #ECFDF5;
}
.timeline-dot.gray {
  background: #D1D5DB;
  box-shadow: 0 0 0 2px #F3F4F6;
}
.timeline-dot.orange {
  background: #F59E0B;
  box-shadow: 0 0 0 2px #FEF3C7;
}
.timeline-dot.red {
  background: #EF4444;
  box-shadow: 0 0 0 2px #FEE2E2;
}
.timeline-time {
  font-size: 11px;
  color: #9CA3AF;
  margin-bottom: 4px;
}
.timeline-content {
  font-size: 13px;
  color: #4B5563;
  line-height: 1.6;
}

/* Data Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  text-align: left;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #9CA3AF;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
}
.data-table td {
  padding: 12px 14px;
  font-size: 13px;
  color: #4B5563;
  border-bottom: 1px solid #F3F4F6;
  vertical-align: middle;
}
.data-table tr:hover td {
  background: #F9FAFB;
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

.fixed-quantity {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  background: #F9FAFB;
  color: #374151;
}

.payment-method-tip { margin-top: 10px; padding: 10px 12px; border-radius: 8px; background: #F9FAFB; color: #6B7280; font-size: 12px; line-height: 1.6; }
.native-payment-view { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 10px 0; }
.native-payment-sheet { width: 100%; box-sizing: border-box; padding: 20px; border: 1px solid #E5E7EB; border-radius: 8px; background: #FCFCFA; color: #111827; font-family: monospace; }
.invoice-title { margin-bottom: 10px; color: #000; font-size: 16px; font-weight: 700; text-align: center; }
.invoice-divider { margin: 6px 0; color: #9CA3AF; text-align: center; overflow: hidden; }
.invoice-row { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 4px; font-size: 12px; }
.invoice-payable { color: #000; font-size: 14px; font-weight: 700; }
.invoice-payment-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-top: 18px; padding-top: 14px; border-top: 1px dashed #D1D5DB; }
.invoice-payment-copy { display: flex; flex-direction: column; gap: 6px; color: #374151; font-size: 12px; }
.invoice-payment-copy span { color: #6B7280; }
.invoice-payment-qr { display: flex; flex-direction: column; align-items: center; gap: 5px; color: #4B5563; font-size: 10px; text-align: center; }
.invoice-payment-qr img { width: 132px; height: 132px; border: 1px solid #E5E7EB; background: #FFF; object-fit: contain; }
.native-payment-actions { display: flex; justify-content: flex-end; gap: 10px; width: 100%; }

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
  color: var(--primary-500);
}

.vitals-empty {
  font-size: 12px;
  color: #D97706;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  padding: 10px;
}
.print-header {
  display: none;
}
</style>

<style>
@page {
  size: auto;
  margin: 0mm; /* Hides default browser header (title/date) and footer (URL/page numbers) */
}

@media print {
  body.printing-invoice * {
    visibility: hidden !important;
  }

  body.printing-invoice .t-dialog__wrapper,
  body.printing-invoice .t-dialog__ctx,
  body.printing-invoice .t-dialog,
  body.printing-invoice .invoice-box,
  body.printing-invoice .invoice-box * {
    display: block !important;
    visibility: visible !important;
  }

  body.printing-invoice .invoice-box {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    border: 0 !important;
    box-shadow: none !important;
  }

  body.printing-invoice .invoice-row,
  body.printing-invoice .invoice-payment-footer,
  body.printing-invoice .invoice-payment-qr,
  body.printing-invoice .invoice-payment-copy {
    display: flex !important;
  }

  body.printing-invoice .invoice-payment-footer { break-inside: avoid; }
  body.printing-invoice .invoice-payment-qr img { width: 132px !important; height: 132px !important; }

  /* Hide all layouts, sidebar toggle buttons, top headers and custom app layouts */
  aside,
  header,
  nav,
  .app-sidebar, 
  .sidebar-toggle-btn, 
  .topbar, 
  .sidebar,
  .sidebar-logo,
  .t-layout__aside,
  .t-layout__header,
  .action-buttons,
  /* Hide all dialogues, overlays, popups, and contextual components */
  .t-dialog__wrapper,
  .t-dialog__ctx,
  .t-dialog,
  .t-popup,
  .t-overlay,
  /* Hide all buttons, actions and interactive controls */
  button,
  .btn,
  .btn-sm,
  .btn-outline,
  .t-button,
  .panel-header button,
  .panel-header .btn {
    display: none !important;
  }
  
  /* Render custom print-only header on page */
  .print-header {
    display: block !important;
    text-align: center;
    font-size: 22px;
    font-weight: bold;
    color: #111827;
    margin-bottom: 20px !important;
    border-bottom: 2px solid #E5E7EB;
    padding-bottom: 8px;
  }

  /* Reset document flow and overflow controls to allow multi-page printing */
  html, 
  body, 
  #app, 
  .app-layout, 
  .t-layout, 
  .app-content,
  .t-layout__content,
  .t-layout__inner,
  main,
  section {
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
    background: #FFF !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    position: static !important;
    display: block !important;
  }

  /* Add border margins manually so content doesn't print against paper edges */
  body {
    padding: 10mm 15mm !important;
  }

  .page-container {
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  .card-grid-2 {
    display: flex !important;
    flex-direction: column !important;
    gap: 16px !important;
  }

  .panel {
    border: 1px solid #E5E7EB !important;
    box-shadow: none !important;
    margin-top: 12px !important;
    background: #FFF !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  .previous-vitals-section {
    display: none !important;
  }
}</style>
