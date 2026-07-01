<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import * as echarts from 'echarts'
import request from '@/utils/request'
import { navigateToParent } from '@/utils/routeNavigation'

const route = useRoute()
const router = useRouter()
const activeTab = ref('info')

const patientId = ref(route.params.id as string || '1')

/* ---- Family Members State ---- */
const familyMembers = ref<any[]>([])

const relationMap: Record<string, string> = {
  self: '本人',
  spouse: '配偶',
  child: '子女',
  parent: '父母',
  sibling: '兄弟姐妹',
  other: '其他'
}

function getMemberRelationLabel(member: any) {
  if (String(member.id) === String(patientId.value)) {
    return '本人'
  }
  if (member.relation === 'self') {
    return '主账号'
  }
  return relationMap[member.relation] || member.relation
}

function getMemberRelationTagClass(member: any) {
  return String(member.id) === String(patientId.value) ? 'tag-blue' : 'tag-gray'
}

function normalizeRiskLevel(level: string): string {
  if (!level) return 'normal'
  const val = String(level).toLowerCase()
  if (val.includes('正常') || val.includes('normal') || val.includes('low') || val.includes('低')) return 'normal'
  if (val.includes('轻') || val === 'mild') return 'mild'
  if (val.includes('中') || val === 'moderate' || val === 'medium') return 'moderate'
  if (val.includes('重') || val === 'severe' || val === 'high' || val === 'higher' || val.includes('高')) return 'severe'
  return val
}

function getRiskLevelLabel(level: string): string {
  const map: Record<string, string> = {
    normal: '正常',
    mild: '轻度',
    moderate: '中度',
    severe: '重度'
  }
  return map[normalizeRiskLevel(level)] || level || '未知'
}

function getRiskLevelStyle(level: string) {
  const norm = normalizeRiskLevel(level)
  if (norm === 'normal') return { color: '#10B981', fontWeight: 'bold' } // green
  if (norm === 'mild' || norm === 'moderate') return { color: '#F59E0B', fontWeight: 'bold' } // orange
  if (norm === 'severe') return { color: '#EF4444', fontWeight: 'bold' } // red
  return { color: '#6B7280' }
}

/* ---- Patient Data ---- */
const patient = ref({
  id: patientId.value,
  no: '',
  name: '',
  phone: '',
  gender: '',
  age: null as number | null,
  level: '',
  source: '',
  referrer: '',
  regDate: '',
  totalVisits: 0,
  totalSpent: 0,
  nextFollowup: '',
  diagnosis: '',
  plan: '',
  medical_history: '',
  allergy_history: '',
  lastVisit: '',
  followerId: '',
  followerName: '',
  crmStage: ''
})

const editVisible = ref(false)
const savingEdit = ref(false)
const fullPhoneLoaded = ref(false)
const editForm = ref({
  name: '',
  phone: '',
  gender: '男',
  age: null as number | null,
  level: '普通',
  source: '门店',
  medical_history: '',
  allergy_history: ''
})
const levelOptions = ['普通', 'VIP', 'SVIP']
const sourceOptions = ['小程序', '分销', '转介绍', '门店', '直播']

/* ---- Departments Progress ---- */
const depts = ref<any[]>([])

/* ---- Timeline Events ---- */
const timelineEvents = ref<any[]>([])

/* ---- Orders Records ---- */
const orders = ref<any[]>([])
const sleepDiagnostics = ref<any>(null)

/* ---- Followup Tasks ---- */
const followups = ref<any[]>([])
const followupRecords = ref<any[]>([])
const completingFollowupId = ref('')
const reschedulingFollowupId = ref('')

/* ---- ECharts for Sleep Trends ---- */
const chartRef = ref<HTMLDivElement | null>(null)
let myChart: echarts.ECharts | null = null

const sourceMap: Record<string, string> = {
  mini_app: '小程序',
  mini_program: '小程序',
  wechat: '小程序',
  distribution: '分销',
  promoter: '分销',
  referral: '转介绍',
  referred: '转介绍',
  walk_in: '门店',
  store: '门店',
  offline: '门店',
  live: '直播',
  livestream: '直播',
  admin: '后台',
  '小程序': '小程序',
  '分销': '分销',
  '转介绍': '转介绍',
  '门店': '门店',
  '直播': '直播'
}

const deptColors = ['var(--primary-500)', '#5A85F5', 'var(--success-500)', '#F59E0B', '#8B5CF6']
const appointmentStatusMap: Record<string, { title: string; color: string }> = {
  pending_payment: { title: '待支付', color: 'gold' },
  pending: { title: '已预约', color: 'green' },
  waiting: { title: '候诊中', color: 'blue' },
  confirmed: { title: '候诊中', color: 'blue' },
  called: { title: '已叫号', color: 'blue' },
  checked_in: { title: '就诊中', color: 'gold' },
  completed: { title: '待结算', color: 'red' },
  arrived: { title: '已完成', color: 'green' },
  settled: { title: '已完成', color: 'green' },
  no_show: { title: '未到诊', color: 'gray' },
  cancelled: { title: '已取消', color: 'red' }
}

function formatDate(value: string) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).substring(0, 10)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatGender(value: number) {
  if (value === 1) return '男'
  if (value === 2) return '女'
  return ''
}

function genderToNumber(value: string) {
  if (value === '男') return 1
  if (value === '女') return 2
  return 0
}

function formatSource(value: string) {
  return sourceMap[value] || value || ''
}

function updateChart(logs: any[] = []) {
  if (!myChart) return
  const sortedLogs = [...logs].reverse()
  myChart.setOption({
    xAxis: { data: sortedLogs.map((l: any) => formatDate(l.date).slice(5)) },
    series: [
      { data: sortedLogs.map((l: any) => Number(l.wear_duration || 0)) },
      { data: sortedLogs.map((l: any) => l.ahi_index === null || l.ahi_index === undefined ? null : Number(l.ahi_index)) }
    ]
  })
}

const loadPatientDetails = async () => {
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId.value}`)
    const p = res.data

    const levelMap: Record<string, string> = {
      normal: '普通',
      silver: 'VIP',
      gold: 'VIP',
      diamond: 'SVIP'
    }
    const appointments = Array.isArray(p.appointments) ? p.appointments : []
    const validVisitAppointments = appointments.filter((a: any) => !['cancelled', 'no_show'].includes(a.status))
    const latestVisit = validVisitAppointments[0]

    patient.value = {
      id: p.id.toString(),
      no: p.patient_no || '未生成',
      name: p.name,
      phone: p.phone || p.user_phone || '',
      gender: formatGender(p.gender),
      age: p.age ?? null,
      level: levelMap[p.member_level] || '',
      source: formatSource(p.source),
      referrer: p.referrer_name || '',
      regDate: formatDate(p.created_at),
      totalVisits: validVisitAppointments.length,
      totalSpent: (p.total_spent || 0) / 100,
      nextFollowup: p.next_followup ? `${formatDate(p.next_followup.due_date)} ${p.next_followup.title}` : '',
      diagnosis: p.latest_medical_record?.diagnosis || '',
      plan: p.active_treatment ? `定制阻鼾器 ${p.active_treatment.device_model} (当前前伸量: ${p.active_treatment.current_advancement}mm)` : '',
      medical_history: p.medical_history || '',
      allergy_history: p.allergy_history || '',
      lastVisit: latestVisit ? `${formatDate(latestVisit.appointment_date)} ${latestVisit.store_name || ''} ${latestVisit.doctor_name || ''}`.trim() : '',
      followerId: p.follower_id ? p.follower_id.toString() : '',
      followerName: p.follower_name || '未分配',
      crmStage: p.crm_stage || '未跟进'
    }
    fullPhoneLoaded.value = false

    // Map departments progress
    if (validVisitAppointments.length) {
      const deptCountMap = validVisitAppointments.reduce((map: Record<string, number>, a: any) => {
        const name = a.doctor_specialty || ''
        if (!name) return map
        map[name] = (map[name] || 0) + 1
        return map
      }, {})
      const total = Object.values(deptCountMap).reduce((sum: number, count: any) => sum + Number(count || 0), 0)

      depts.value = Object.entries(deptCountMap).map(([name, visits], index) => ({
        name,
        visits,
        percentage: total ? Math.round((Number(visits) / total) * 100) : 0,
        color: deptColors[index % deptColors.length]
      }))

      // Map timeline events
      timelineEvents.value = validVisitAppointments.map((a: any) => {
        const status = appointmentStatusMap[a.status] || { title: a.status || '未知状态', color: 'gray' }
        return {
          id: a.id.toString(),
          date: [formatDate(a.appointment_date), a.store_name, a.doctor_name].filter(Boolean).join(' · '),
          title: status.title,
          content: a.symptom_desc || '',
          color: status.color
        }
      })
    } else {
      depts.value = []
      timelineEvents.value = []
    }

    // Load orders and family members
    fetchOrders()
    familyMembers.value = Array.isArray(p.family_members) ? p.family_members : []
  } catch (error) {
    console.error('Failed to load patient detail:', error)
  }
}

const fetchOrders = async () => {
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId.value}/orders`)
    orders.value = (res.data || []).map((o: any) => {
      const prodName = o.items && o.items[0] ? o.items[0].product_name : ''
      const productDesc = o.items && o.items.length > 1 ? `${prodName} 等${o.items.length}件` : prodName
      
      const addr = typeof o.shipping_address === 'string' ? (() => {
        try {
          return JSON.parse(o.shipping_address || '{}')
        } catch(e) {
          return {}
        }
      })() : (o.shipping_address || {})
      
      let deliveryLabel = ''
      if (o.type === 'online') {
        deliveryLabel = `快递邮寄${o.status === 'shipped' ? ' (已发货)' : ''}`
      } else if (o.type) {
        deliveryLabel = `到店自提${addr.status ? ` (${addr.status})` : ''}`
      }

      const statusMap: Record<string, string> = {
        completed: '已完成',
        processing: '自提待到货',
        shipping: '快递待发货',
        shipped: '已发货',
        paid: '已支付',
        pending_payment: '待支付',
        cancelled: '已取消',
        refunded: '已退款'
      }

      return {
        id: o.id.toString(),
        no: o.order_no,
        productName: productDesc,
        price: o.pay_amount / 100,
        date: formatDate(o.created_at),
        delivery: deliveryLabel,
        status: statusMap[o.status] || o.status || ''
      }
    })
  } catch (error) {
    console.error(error)
  }
}

const fetchFollowups = async () => {
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId.value}/follow-ups`)
    const { tasks, records } = res.data
    followupRecords.value = records || []
    followups.value = tasks.map((t: any) => ({
      id: String(t.id),
      doctorId: String(t.doctor_id || ''),
      type: t.title,
      time: formatDate(t.due_date),
      executor: t.doctor_name,
      content: t.description || '',
      statusRaw: t.status,
      status: t.status === 'completed' ? '已完成' : t.status === 'cancelled' ? '已取消' : '待执行'
    }))
  } catch (error) {
    console.error(error)
  }
}

const loadTreatmentAndChart = async () => {
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId.value}/treatment`)
    if (res.data) {
      if (res.data.device_model) {
        patient.value.plan = `定制阻鼾器 ${res.data.device_model} (当前前伸量: ${res.data.current_advancement}mm)`
      }
      const { logs } = res.data
      updateChart(logs || [])
    } else {
      updateChart([])
    }
  } catch (error) {
    console.error(error)
  }
}

const loadSleepDiagnostics = async () => {
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId.value}/sleep-diagnostics`)
    sleepDiagnostics.value = res.data || null
  } catch (error) {
    console.error('获取睡眠诊断汇总失败:', error)
  }
}

const medicalRecords = ref<any[]>([])
const selectedRecord = ref<any>(null)
const recordDialogVisible = ref(false)
const uploadingAttachment = ref(false)
const selectedAttachmentRecordId = ref('')

const allAttachments = computed(() => medicalRecords.value.flatMap((record: any) => {
  const attachments = Array.isArray(record.attachments) ? record.attachments : []
  return attachments.map((item: any) => ({
    ...item,
    recordId: String(record.id),
    recordDate: record.visit_date,
    diagnosis: record.diagnosis
  }))
}))

const fetchMedicalRecords = async () => {
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId.value}/medical-records`)
    if (res.code === 200) {
      medicalRecords.value = res.data
      if (!selectedAttachmentRecordId.value && res.data && res.data.length > 0) {
        selectedAttachmentRecordId.value = String(res.data[0].id)
      }
      if (res.data && res.data.length > 0) {
        patient.value.diagnosis = res.data[0].diagnosis
      }
    }
  } catch (error) {
    console.error('获取门诊病历失败:', error)
  }
}

const showMedicalRecordDetail = (record: any) => {
  selectedRecord.value = record
  recordDialogVisible.value = true
}

onMounted(() => {
  if (chartRef.value) {
    myChart = echarts.init(chartRef.value)
    const option = {
      title: {
        text: '设备佩戴时长趋势（AHI 未录入时不展示）',
        left: 'left',
        textStyle: { fontSize: 14, color: '#111827', fontWeight: 600 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: ['佩戴时长 (小时)', 'AHI 指数（真实记录）'],
        right: 0
      },
      grid: {
        left: '4%',
        right: '4%',
        top: '18%',
        bottom: '8%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: [],
        axisLine: { lineStyle: { color: '#D1D5DB' } },
        axisLabel: { color: '#4B5563' }
      },
      yAxis: [
        {
          type: 'value',
          name: '时长',
          min: 0,
          max: 10,
          axisLabel: { formatter: '{value} h' }
        },
        {
          type: 'value',
          name: 'AHI',
          min: 0,
          max: 40,
          position: 'right',
          axisLabel: { formatter: '{value}' }
        }
      ],
      series: [
        {
          name: '佩戴时长 (小时)',
          type: 'bar',
          data: [],
          itemStyle: { color: 'var(--primary-500)', borderRadius: [4, 4, 0, 0] },
          barWidth: '25%'
        },
        {
          name: 'AHI 指数（真实记录）',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: [],
          itemStyle: { color: 'var(--success-500)' },
          lineStyle: { width: 3 }
        }
      ]
    }
    myChart.setOption(option)
    
    window.addEventListener('resize', () => {
      myChart?.resize()
    })
  }

  loadPatientDetails()
  fetchFollowups()
  loadTreatmentAndChart()
  loadSleepDiagnostics()
  fetchMedicalRecords()
  loadFollowers()
  loadPromoters()
  loadCrmRecords()
})

watch(() => route.params.id, (newId) => {
  if (newId) {
    patientId.value = newId as string
    loadPatientDetails()
    fetchFollowups()
    loadTreatmentAndChart()
    loadSleepDiagnostics()
    fetchMedicalRecords()
    loadFollowers()
    loadPromoters()
    loadCrmRecords()
  }
})

function handleBack() {
  navigateToParent(router, route, '/patient')
}

async function handleEdit() {
  if (!fullPhoneLoaded.value) {
    try {
      const res: any = await request.get(`/api/admin/patients/${patientId.value}/phone`)
      patient.value.phone = res.data?.phone || patient.value.phone
      fullPhoneLoaded.value = true
    } catch (error) {
      console.error(error)
      MessagePlugin.error('获取完整手机号失败，暂不能编辑患者信息')
      return
    }
  }
  editForm.value = {
    name: patient.value.name,
    phone: patient.value.phone,
    gender: patient.value.gender || '男',
    age: patient.value.age,
    level: patient.value.level || '普通',
    source: patient.value.source || '门店',
    medical_history: patient.value.medical_history || '',
    allergy_history: patient.value.allergy_history || ''
  }
  editVisible.value = true
}

function handleNewAppointment() {
  router.push({ path: '/appointment/create', query: { patient_id: patientId.value } })
}

function handleFollowup() {
  router.push('/patient/followup/' + patientId.value)
}

async function handleSavePatientEdit() {
  if (!editForm.value.name.trim()) {
    MessagePlugin.warning('请填写患者姓名')
    return
  }
  savingEdit.value = true
  try {
    await request.put(`/api/admin/patients/${patientId.value}`, {
      name: editForm.value.name.trim(),
      phone: editForm.value.phone.trim(),
      gender: genderToNumber(editForm.value.gender),
      age: editForm.value.age,
      level: editForm.value.level,
      source: editForm.value.source,
      medical_history: editForm.value.medical_history,
      allergy_history: editForm.value.allergy_history
    })
    MessagePlugin.success('保存患者信息成功')
    editVisible.value = false
    await loadPatientDetails()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('保存患者信息失败')
  } finally {
    savingEdit.value = false
  }
}

async function handleRevealPhone() {
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId.value}/phone`)
    patient.value.phone = res.data?.phone || patient.value.phone
    editForm.value.phone = patient.value.phone
    fullPhoneLoaded.value = true
    MessagePlugin.success('已显示完整手机号')
  } catch (error) {
    console.error(error)
    MessagePlugin.error('查看完整手机号失败')
  }
}

async function handleCompleteFollowup(task: any) {
  if (!task.doctorId) {
    MessagePlugin.warning('该随访任务缺少执行人，无法完成')
    return
  }
  completingFollowupId.value = task.id
  try {
    await request.post(`/api/admin/patients/${patientId.value}/follow-ups/records`, {
      task_id: task.id,
      doctor_id: Number(task.doctorId),
      contact_type: task.type,
      summary: task.content || '后台患者详情标记随访已完成'
    })
    MessagePlugin.success('随访任务已完成')
    await fetchFollowups()
    await loadPatientDetails()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('完成随访失败')
  } finally {
    completingFollowupId.value = ''
  }
}

async function handleRescheduleFollowup(task: any) {
  const nextDate = window.prompt('请输入新的计划执行日期（YYYY-MM-DD）', task.time || new Date().toISOString().slice(0, 10))
  if (!nextDate) return
  reschedulingFollowupId.value = task.id
  try {
    await request.put(`/api/admin/patients/${patientId.value}/follow-ups/${task.id}`, {
      due_date: nextDate,
      status: 'pending'
    })
    MessagePlugin.success('随访任务已改期')
    await fetchFollowups()
    await loadPatientDetails()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('随访改期失败')
  } finally {
    reschedulingFollowupId.value = ''
  }
}

async function handleCancelFollowup(task: any) {
  if (!window.confirm('确认取消该随访任务？')) return
  try {
    await request.put(`/api/admin/patients/${patientId.value}/follow-ups/${task.id}`, {
      status: 'cancelled'
    })
    MessagePlugin.success('随访任务已取消')
    await fetchFollowups()
    await loadPatientDetails()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('取消随访失败')
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function uploadAttachmentFile(file: File) {
  const dataUrl = await fileToDataUrl(file)
  const res: any = await request.post('/api/admin/uploads/files', {
    fileName: file.name,
    mimeType: file.type,
    fileData: dataUrl,
    context: 'patient-record'
  })
  return {
    name: res.data?.name || file.name,
    url: res.data?.url || res.data?.path,
    path: res.data?.path || res.data?.url,
    size: res.data?.size || file.size,
    mimeType: res.data?.mimeType || file.type,
    uploaded_at: new Date().toISOString()
  }
}

async function handleAttachmentUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return
  if (!selectedAttachmentRecordId.value) {
    MessagePlugin.warning('请选择要归属的病历记录')
    return
  }
  const record = medicalRecords.value.find((item: any) => String(item.id) === String(selectedAttachmentRecordId.value))
  if (!record) {
    MessagePlugin.warning('病历记录不存在')
    return
  }
  uploadingAttachment.value = true
  try {
    const uploaded = []
    for (const file of files) {
      uploaded.push(await uploadAttachmentFile(file))
    }
    const nextAttachments = [...(Array.isArray(record.attachments) ? record.attachments : []), ...uploaded]
    const res: any = await request.put(`/api/admin/patients/${patientId.value}/medical-records/${record.id}/attachments`, {
      attachments: nextAttachments
    })
    record.attachments = res.data || nextAttachments
    MessagePlugin.success('病历附件已上传')
  } catch (error) {
    console.error(error)
    MessagePlugin.error('上传病历附件失败')
  } finally {
    uploadingAttachment.value = false
  }
}

async function handleRemoveAttachment(file: any) {
  if (!window.confirm('确认删除该附件？')) return
  const record = medicalRecords.value.find((item: any) => String(item.id) === String(file.recordId))
  if (!record) return
  try {
    const nextAttachments = (record.attachments || []).filter((item: any) => item.url !== file.url)
    const res: any = await request.put(`/api/admin/patients/${patientId.value}/medical-records/${record.id}/attachments`, {
      attachments: nextAttachments
    })
    record.attachments = res.data || nextAttachments
    MessagePlugin.success('附件已删除')
  } catch (error) {
    console.error(error)
    MessagePlugin.error('删除附件失败')
  }
}

/* ---- CRM Follow-up Functionality ---- */
const followers = ref<any[]>([])
const crmRecords = ref<any[]>([])
const promoters = ref<Array<{ label: string; value: string }>>([])
const selectedPromoterId = ref('')
const bindingPromoter = ref(false)
const loadingCrm = ref(false)
const submittingCrm = ref(false)

const crmStageTheme: Record<string, string> = {
  '未跟进': 'default',
  '意向中': 'primary',
  '考虑中': 'warning',
  '已成单': 'success',
  '已放弃': 'danger'
}

const loadFollowers = async () => {
  try {
    const res: any = await request.get('/api/admin/admin-users')
    followers.value = res.data || []
  } catch (error) {
    console.error('Failed to load followers:', error)
  }
}

const loadPromoters = async () => {
  try {
    const res: any = await request.get('/api/admin/distribution/promoters')
    promoters.value = (res.data || []).map((item: any) => ({
      label: `${item.nickname || item.user_phone || item.user_id} (${item.user_phone || '无手机号'})`,
      value: String(item.user_id)
    }))
  } catch (error) {
    console.error('Failed to load promoters:', error)
  }
}

async function handleBindPromoter() {
  if (!selectedPromoterId.value) {
    MessagePlugin.warning('请选择推广人')
    return
  }
  bindingPromoter.value = true
  try {
    await request.post(`/api/admin/patients/${patientId.value}/bind-promoter`, {
      promoter_user_id: Number(selectedPromoterId.value)
    })
    MessagePlugin.success('推广关系已保存')
    await loadPatientDetails()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('保存推广关系失败')
  } finally {
    bindingPromoter.value = false
  }
}

const loadCrmRecords = async () => {
  loadingCrm.value = true
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId.value}/crm-records`)
    crmRecords.value = res.data || []
  } catch (error) {
    console.error('Failed to load CRM records:', error)
  } finally {
    loadingCrm.value = false
  }
}

/* ---- CRM Dialog State and Callbacks ---- */
const crmVisible = ref(false)
const crmForm = ref({
  followerId: '',
  stage: '意向中',
  content: ''
})

function openCrmDialog() {
  crmForm.value = {
    followerId: patient.value.followerId || '',
    stage: patient.value.crmStage === '未跟进' ? '意向中' : patient.value.crmStage,
    content: ''
  }
  crmVisible.value = true
}

async function handleSaveCrm() {
  if (!crmForm.value.content.trim()) {
    MessagePlugin.warning('请填写跟进内容描述')
    return
  }
  submittingCrm.value = true
  try {
    await request.put(`/api/admin/patients/${patientId.value}/follower`, {
      follower_id: crmForm.value.followerId ? Number(crmForm.value.followerId) : null
    })
    await request.post(`/api/admin/patients/${patientId.value}/crm-records`, {
      content: crmForm.value.content.trim(),
      stage: crmForm.value.stage
    })
    MessagePlugin.success('保存跟进成功')
    crmVisible.value = false
    await loadPatientDetails()
    await loadCrmRecords()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('保存跟进失败')
  } finally {
    submittingCrm.value = false
  }
}
</script>

<template>
  <div class="page-container">


    <!-- Header Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">
          {{ patient.name }}
          <span v-if="patient.level" class="tag tag-gold">{{ patient.level }}</span>
        </div>
        <div class="page-title-sub">病历号 {{ patient.no }} · 注册于 {{ patient.regDate }}</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" @click="handleEdit"><AppIcon name="edit" />  编辑</button>
        <button class="btn btn-primary" @click="handleNewAppointment"><AppIcon name="calendar" />  新建预约</button>
        <button class="btn btn-outline" @click="openCrmDialog"><AppIcon name="edit" />  跟进</button>
        <button class="btn btn-success" @click="handleFollowup"><AppIcon name="phone" />  随访</button>
      </div>
    </div>

    <!-- Tabs Header -->
    <div class="tabs">
      <div class="tab" :class="{ active: activeTab === 'info' }" @click="activeTab = 'info'">基本信息</div>
      <div class="tab" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">病史档案</div>
      <div class="tab" :class="{ active: activeTab === 'visits' }" @click="activeTab = 'visits'">就诊记录</div>
      <div class="tab" :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">订单记录</div>
      <div class="tab" :class="{ active: activeTab === 'followups' }" @click="activeTab = 'followups'">随访计划</div>
      <div class="tab" :class="{ active: activeTab === 'files' }" @click="activeTab = 'files'">病历附件</div>
      <div class="tab" :class="{ active: activeTab === 'crm' }" @click="activeTab = 'crm'">营销跟进</div>
    </div>

    <!-- Tab Contents -->
    <div style="margin-top: 20px;">
      <!-- Tab 1: Basic Info -->
      <div v-if="activeTab === 'info'">
        <!-- Stats cards -->
        <div class="card-grid-4">
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--primary-100); color: var(--primary-500);"><AppIcon name="calendar" /> </div>
            <div>
              <div class="mini-stat-value">{{ patient.totalVisits }}</div>
              <div class="mini-stat-label">累计就诊</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--success-100); color: var(--success-500);"><AppIcon name="money" /> </div>
            <div>
              <div class="mini-stat-value">¥{{ patient.totalSpent.toLocaleString() }}</div>
              <div class="mini-stat-label">消费总额</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: #FFF9E6; color: #D4930A;"><AppIcon name="tag" /> </div>
            <div>
              <div class="mini-stat-value">{{ patient.source || '未记录' }}</div>
              <div class="mini-stat-label">患者来源</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--error-100); color: var(--error-500);"><AppIcon name="clock" /></div>
            <div>
              <div class="mini-stat-value">{{ patient.nextFollowup }}</div>
              <div class="mini-stat-label">距下次随访</div>
            </div>
          </div>
        </div>

        <!-- Info Grid and Medical Summary -->
        <div class="card-grid-2">
          <!-- Personal Info -->
          <div class="panel" style="margin: 0;">
            <div class="panel-header"><div class="panel-title"><AppIcon name="clipboard" />  个人信息</div></div>
            <div class="info-grid">
              <div class="info-item"><div class="info-label">姓名</div><div class="info-value">{{ patient.name }}</div></div>
              <div class="info-item"><div class="info-label">性别</div><div class="info-value">{{ patient.gender }}</div></div>
              <div class="info-item"><div class="info-label">年龄</div><div class="info-value">{{ patient.age === null ? '未记录' : `${patient.age}岁` }}</div></div>
              <div class="info-item">
                <div class="info-label">手机号</div>
                <div class="info-value" style="display: flex; align-items: center; gap: 8px;">
                  <span>{{ patient.phone }}</span>
                  <button v-if="!fullPhoneLoaded" class="btn btn-xs btn-outline" @click="handleRevealPhone">查看完整</button>
                </div>
              </div>
              <div class="info-item"><div class="info-label">来源</div><div class="info-value"><span v-if="patient.source" class="tag tag-green">{{ patient.source }}</span><span v-else>未记录</span></div></div>
              <div class="info-item"><div class="info-label">会员等级</div><div class="info-value"><span v-if="patient.level" class="tag tag-gold">{{ patient.level }}</span><span v-else>未记录</span></div></div>
              <div class="info-item">
                <div class="info-label">推荐人</div>
                <div class="info-value">
                  <div style="margin-bottom: 8px;">{{ patient.referrer || '无推荐人' }}</div>
                  <div style="display: flex; gap: 8px;">
                    <t-select v-model="selectedPromoterId" :options="promoters" placeholder="选择推广人" clearable size="small" style="min-width: 180px;" />
                    <button class="btn btn-xs btn-outline" :disabled="bindingPromoter" @click="handleBindPromoter">保存</button>
                  </div>
                </div>
              </div>
              <div class="info-item"><div class="info-label">注册时间</div><div class="info-value">{{ patient.regDate }}</div></div>
            </div>
          </div>

          <!-- Medical Overview -->
          <div class="panel" style="margin: 0;">
            <div class="panel-header"><div class="panel-title"><AppIcon name="store" />  就诊概况</div></div>
            <div class="panel-body">
              <div style="display: flex; flex-direction: column; gap: 14px;">
                <div v-for="dept in depts" :key="dept.name">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 13px; color: #4B5563;">{{ dept.name }}</span>
                    <span style="font-size: 13px; font-weight: 600; color: var(--primary-500);">{{ dept.visits }}次</span>
                  </div>
                  <div class="progress-bar">
                    <div class="progress-fill" :style="{ width: dept.percentage + '%', background: dept.color }"></div>
                  </div>
                </div>
              </div>
              <div style="margin-top: 16px; padding-top: 14px; border-top: 1px solid #F3F4F6; font-size: 13px; color: #4B5563; line-height: 1.8;">
                <strong style="color: #1F2937;">主诊断：</strong>{{ patient.diagnosis || '未记录' }}<br>
                <strong style="color: #1F2937;">当前方案：</strong>{{ patient.plan || '未记录' }}<br>
                <strong style="color: #1F2937;">上次就诊：</strong>{{ patient.lastVisit || '未记录' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Sleep Trend Chart -->
        <div class="panel" style="margin-top: 16px;">
          <div class="panel-body">
            <div ref="chartRef" style="width: 100%; height: 280px;"></div>
          </div>
        </div>

        <div class="panel" style="margin-top: 16px;">
          <div class="panel-header"><div class="panel-title"><AppIcon name="clipboard" /> 睡眠诊断汇总</div></div>
          <div class="panel-body">
            <div class="card-grid-4" style="margin: 0;">
              <div class="mini-stat">
                <div>
                  <div class="mini-stat-value">
                    <span v-if="sleepDiagnostics?.ess">{{ sleepDiagnostics.ess.total_score }}分</span>
                    <span v-else>未评估</span>
                  </div>
                  <div class="mini-stat-label">ESS 嗜睡量表</div>
                </div>
              </div>
              <div class="mini-stat">
                <div>
                  <div class="mini-stat-value">
                    <span v-if="sleepDiagnostics?.snore" :style="getRiskLevelStyle(sleepDiagnostics.snore.risk_level)">
                      {{ getRiskLevelLabel(sleepDiagnostics.snore.risk_level) }}
                    </span>
                    <span v-else>未分析</span>
                  </div>
                  <div class="mini-stat-label">AI 鼾声分析</div>
                </div>
              </div>
              <div class="mini-stat">
                <div>
                  <div class="mini-stat-value">{{ Number(sleepDiagnostics?.wearing?.avg_duration || 0).toFixed(1) }}h</div>
                  <div class="mini-stat-label">平均佩戴时长</div>
                </div>
              </div>
              <div class="mini-stat">
                <div>
                  <div class="mini-stat-value">{{ sleepDiagnostics?.wearing?.total_days || 0 }}天</div>
                  <div class="mini-stat-label">真实佩戴记录</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Family Members Panel -->
        <div class="panel" style="margin-top: 16px;">
          <div class="panel-header">
            <div class="panel-title"><AppIcon name="users" /> 家庭成员状况</div>
          </div>
          <div class="panel-body" style="padding: 0;">
            <table class="data-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">成员姓名</th>
                  <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">关系</th>
                  <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">性别 / 年龄</th>
                  <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">电话号码</th>
                  <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">ESS 嗜睡评估</th>
                  <th style="text-align: left; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB;">AI 鼾声分析</th>
                  <th style="text-align: right; padding: 12px 16px; font-weight: 600; color: #374151; border-bottom: 1px solid #E5E7EB; width: 120px;">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="member in familyMembers" :key="member.id">
                  <td style="padding: 12px 16px; border-bottom: 1px solid #F3F4F6;">
                    <div style="font-weight: 600; color: #1F2937;">{{ member.name }}</div>
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #F3F4F6;">
                    <span class="tag" :class="getMemberRelationTagClass(member)">
                      {{ getMemberRelationLabel(member) }}
                    </span>
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #F3F4F6;">{{ member.gender === 1 ? '男' : '女' }} · {{ member.age ? member.age + '岁' : '未知' }}</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #F3F4F6;">{{ member.phone }}</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #F3F4F6;">
                    <span v-if="member.ess" :style="getRiskLevelStyle(member.ess.risk_level)">
                      {{ member.ess.total_score }}分 ({{ getRiskLevelLabel(member.ess.risk_level) }})
                    </span>
                    <span v-else style="color: #9CA3AF;">暂无评估</span>
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #F3F4F6;">
                    <span v-if="member.snore" :style="getRiskLevelStyle(member.snore.risk_level)">
                      {{ getRiskLevelLabel(member.snore.risk_level) }} (疑似暂停: {{ member.snore.apnea_events || 0 }}次)
                    </span>
                    <span v-else style="color: #9CA3AF;">暂无分析</span>
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #F3F4F6; text-align: right;">
                    <button class="btn btn-xs btn-outline" @click="router.push('/patient/detail/' + member.id)">
                      查看详情
                    </button>
                  </td>
                </tr>
                <tr v-if="familyMembers.length === 0">
                  <td colspan="7" style="text-align: center; color: #9CA3AF; padding: 20px 0;">暂无家庭成员数据</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Timeline of Visits -->
        <div class="panel" style="margin-top: 16px;">
          <div class="panel-header"><div class="panel-title"><AppIcon name="calendar" />  就诊时间线</div></div>
          <div class="panel-body">
            <div class="timeline">
              <div class="timeline-item" v-for="ev in timelineEvents" :key="ev.id">
                <div class="timeline-dot" :class="ev.color"></div>
                <div class="timeline-time">{{ ev.date }}</div>
                <div class="timeline-content">
                  <strong>{{ ev.title }}</strong><span v-if="ev.content"> — {{ ev.content }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab: History -->
      <div v-if="activeTab === 'history'">
        <div class="panel" style="margin: 0; padding: 20px;">
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div>
              <div style="font-weight: 700; font-size: 14px; color: #374151; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                <span><AppIcon name="clipboard" />  既往病史</span>
              </div>
              <div v-if="patient.medical_history" style="background: #FFFBEB; padding: 14px; border-radius: 8px; border-left: 4px solid #F59E0B; font-size: 13px; color: #D97706; font-weight: 500; text-align: left;">
                {{ patient.medical_history }}
              </div>
              <div v-else style="text-align:center;color:#9CA3AF;background:#F9FAFB;padding:24px;border-radius:8px;font-size:12px;">暂无既往病史记录</div>
            </div>
            
            <div>
              <div style="font-weight: 700; font-size: 14px; color: #374151; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                <span><AppIcon name="x-circle" />  药物与过敏史</span>
              </div>
              <div v-if="patient.allergy_history" style="background: #FEF2F2; padding: 14px; border-radius: 8px; border-left: 4px solid #EF4444; font-size: 13px; color: #DC2626; font-weight: 500; text-align: left;">
                {{ patient.allergy_history }}
              </div>
              <div v-else style="text-align:center;color:#9CA3AF;background:#F9FAFB;padding:24px;border-radius:8px;font-size:12px;">暂无药物或过敏史记录</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Visits -->
      <div v-if="activeTab === 'visits'">
        <div class="panel" style="margin: 0;">
          <table class="data-table">
            <thead>
              <tr>
                <th>就诊时间</th>
                <th>就诊科室</th>
                <th>接诊医生</th>
                <th>诊断结果</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="mr in medicalRecords" :key="mr.id">
                <td>{{ mr.visit_date }}</td>
                <td>{{ mr.doctor_specialty }}</td>
                <td>{{ mr.doctor_name }}<span v-if="mr.doctor_title"> ({{ mr.doctor_title }})</span></td>
                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ mr.diagnosis }}</td>
                <td><button class="btn btn-xs btn-outline" @click="showMedicalRecordDetail(mr)">看病历</button></td>
              </tr>
              <tr v-if="medicalRecords.length === 0">
                <td colspan="5" style="text-align: center; color: #9CA3AF; padding: 20px;">暂无门诊就诊病历记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 3: Orders -->
      <div v-if="activeTab === 'orders'">
        <div class="panel" style="margin: 0;">
          <table class="data-table">
            <thead>
              <tr>
                <th>订单单号</th>
                <th>购买日期</th>
                <th>商品详情</th>
                <th>配送/交付方式</th>
                <th>支付金额</th>
                <th>交易状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ord in orders" :key="ord.id">
                <td style="font-family: monospace;">{{ ord.no }}</td>
                <td>{{ ord.date }}</td>
                <td>{{ ord.productName }}</td>
                <td><span style="font-size: 12px; color: #4B5563;">{{ ord.delivery }}</span></td>
                <td style="font-weight: 700; color: var(--primary-500);">¥{{ ord.price.toLocaleString() }}</td>
                <td><span class="status-tag" :class="ord.status === '已完成' || ord.status === '已发货' ? 'green' : (ord.status === '自提待到货' ? 'blue' : (ord.status === '已退款' ? 'red' : 'gold'))">{{ ord.status }}</span></td>
                <td><button class="btn btn-xs btn-outline" @click="router.push('/order/detail/' + ord.id)">订单详情</button></td>
              </tr>
              <tr v-if="orders.length === 0">
                <td colspan="7" style="text-align: center; color: #9CA3AF; padding: 20px;">暂无订单记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 4: Followup Plans -->
      <div v-if="activeTab === 'followups'">
        <div class="panel" style="margin: 0;">
          <table class="data-table">
            <thead>
              <tr>
                <th>随访类型</th>
                <th>计划执行日期</th>
                <th>随访执行人</th>
                <th>随访任务备注</th>
                <th>任务状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, i) in followups" :key="i">
                <td><span class="tag tag-blue">{{ f.type }}</span></td>
                <td>{{ f.time }}</td>
                <td>{{ f.executor }}</td>
                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" :title="f.content">{{ f.content }}</td>
                <td><span class="status-tag" :class="f.statusRaw === 'completed' ? 'green' : (f.statusRaw === 'cancelled' ? 'red' : 'gold')">{{ f.status }}</span></td>
                <td>
                  <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button v-if="f.statusRaw !== 'completed' && f.statusRaw !== 'cancelled'" class="btn btn-xs btn-success" :disabled="completingFollowupId === f.id" @click="handleCompleteFollowup(f)">完成</button>
                    <button v-if="f.statusRaw !== 'completed' && f.statusRaw !== 'cancelled'" class="btn btn-xs btn-outline" :disabled="reschedulingFollowupId === f.id" @click="handleRescheduleFollowup(f)">改期</button>
                    <button v-if="f.statusRaw !== 'completed' && f.statusRaw !== 'cancelled'" class="btn btn-xs btn-danger" @click="handleCancelFollowup(f)">取消</button>
                  </div>
                </td>
              </tr>
              <tr v-if="followups.length === 0">
                <td colspan="6" style="text-align: center; color: #9CA3AF; padding: 20px;">暂无随访计划</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="panel" style="margin-top: 16px;">
          <div class="panel-header"><div class="panel-title">随访执行记录</div></div>
          <div class="panel-body">
            <div v-if="followupRecords.length === 0" style="text-align: center; color: #9CA3AF; padding: 20px;">暂无随访执行记录</div>
            <div v-else style="display: flex; flex-direction: column; gap: 12px;">
              <div v-for="record in followupRecords" :key="record.id" style="border-bottom: 1px solid #F3F4F6; padding-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6B7280; margin-bottom: 4px;">
                  <span>{{ record.contact_type }} · {{ record.doctor_name }}</span>
                  <span>{{ formatDate(record.created_at) }}</span>
                </div>
                <div style="font-size: 13px; color: #374151; white-space: pre-wrap;">{{ record.summary }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 5: Patient Files -->
      <div v-if="activeTab === 'files'">
        <div class="panel" style="margin: 0;">
          <div class="panel-header">
            <div class="panel-title"><AppIcon name="folder" /> 病历附件</div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <t-select
                v-model="selectedAttachmentRecordId"
                size="small"
                style="width: 260px;"
                placeholder="选择归属病历"
                :options="medicalRecords.map((mr: any) => ({ label: `${formatDate(mr.visit_date)} ${mr.diagnosis || ''}`, value: String(mr.id) }))"
              />
              <label class="btn btn-xs btn-outline" :class="{ disabled: uploadingAttachment || !selectedAttachmentRecordId }">
                上传附件
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple style="display:none" :disabled="uploadingAttachment || !selectedAttachmentRecordId" @change="handleAttachmentUpload">
              </label>
            </div>
          </div>
          <div class="panel-body">
            <div v-if="allAttachments.length === 0" style="padding: 40px; text-align: center; color: #9CA3AF;">
              <AppIcon name="folder" /> 暂无病历附件
            </div>
            <div v-else class="file-grid">
              <div v-for="file in allAttachments" :key="file.recordId + file.url" class="file-card">
                <div class="file-icon"><AppIcon name="file-text" /></div>
                <div style="flex: 1; min-width: 0;">
                  <div class="file-name">{{ file.name }}</div>
                  <div class="file-meta">{{ file.recordDate }} · {{ file.size ? Math.round(file.size / 1024) + 'KB' : '未知大小' }}</div>
                </div>
                <a class="btn btn-xs btn-outline" :href="file.url" target="_blank">预览</a>
                <button class="btn btn-xs btn-danger" @click="handleRemoveAttachment(file)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 6: CRM Marketing Follow-up -->
      <div v-if="activeTab === 'crm'">
        <div class="panel" style="margin: 0; padding: 20px; min-height: 400px;">
          <div style="font-size: 16px; font-weight: 600; color: #1F2937; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
            <span>跟进历史记录</span>
            <div style="display: flex; gap: 12px; align-items: center;">
              <span style="font-size: 13px; font-weight: normal; color: #6B7280;">当前跟进人：
                <strong style="color: #1F2937; margin-right: 8px;">{{ patient.followerName }}</strong>
              </span>
              <span style="font-size: 13px; font-weight: normal; color: #6B7280;">当前状态阶段：
                <t-tag :theme="crmStageTheme[patient.crmStage] || 'default'" size="small" variant="light">{{ patient.crmStage }}</t-tag>
              </span>
            </div>
          </div>

          <div v-if="loadingCrm" style="padding: 40px; text-align: center; color: #9CA3AF;">加载跟进历史中...</div>

          <div v-else-if="crmRecords.length === 0" style="padding: 60px; text-align: center; color: #9CA3AF;">
            <AppIcon name="folder" />  暂无跟进沟通记录，可在右上角点击“跟进”按钮进行记录。
          </div>

          <div v-else style="display: flex; flex-direction: column; gap: 16px;">
            <div v-for="record in crmRecords" :key="record.id" style="display: flex; gap: 16px; border-bottom: 1px solid #F3F4F6; padding-bottom: 12px;">
              <div style="display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 60px;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: #EFF6FF; color: #3B6BF5; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600;">
                  {{ record.creator_name ? record.creator_name.substring(0, 1) : '管' }}
                </div>
                <div style="font-size: 11px; color: #6B7280; margin-top: 4px; text-align: center; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  {{ record.creator_name }}
                </div>
              </div>
              <div style="flex-grow: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <t-tag :theme="crmStageTheme[record.stage] || 'default'" size="small" variant="light">{{ record.stage }}</t-tag>
                  <span style="font-size: 12px; color: #9CA3AF;">{{ formatDate(record.created_at) }}</span>
                </div>
                <div style="font-size: 13px; color: #374151; line-height: 1.5; white-space: pre-wrap; word-break: break-all;">
                  {{ record.content }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑患者信息弹窗 -->
    <t-dialog
      v-model:visible="editVisible"
      :header="`编辑患者信息 - ${patient.name}`"
      width="620px"
      :on-confirm="handleSavePatientEdit"
      :confirm-btn="{ content: '保存', loading: savingEdit }"
      cancel-btn="取消"
    >
      <div class="edit-form">
        <div class="form-item">
          <label>姓名</label>
          <input v-model="editForm.name" class="form-control" placeholder="请输入患者姓名">
        </div>
        <div class="form-item">
          <label>手机号</label>
          <input v-model="editForm.phone" class="form-control" placeholder="请输入手机号">
        </div>
        <div class="form-item">
          <label>性别</label>
          <select v-model="editForm.gender" class="form-control">
            <option value="男">男</option>
            <option value="女">女</option>
            <option value="">未知</option>
          </select>
        </div>
        <div class="form-item">
          <label>年龄</label>
          <input v-model.number="editForm.age" class="form-control" type="number" min="0" placeholder="请输入年龄">
        </div>
        <div class="form-item">
          <label>会员等级</label>
          <select v-model="editForm.level" class="form-control">
            <option v-for="item in levelOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
        <div class="form-item">
          <label>患者来源</label>
          <select v-model="editForm.source" class="form-control">
            <option v-for="item in sourceOptions" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
        <div class="form-item span-2">
          <label>既往病史</label>
          <textarea v-model="editForm.medical_history" class="form-control" rows="3" placeholder="请输入既往病史"></textarea>
        </div>
        <div class="form-item span-2">
          <label>药物与过敏史</label>
          <textarea v-model="editForm.allergy_history" class="form-control" rows="3" placeholder="请输入药物或过敏史"></textarea>
        </div>
      </div>
    </t-dialog>

    <!-- 电子病历详情查看弹窗 -->
    <t-dialog
      v-model:visible="recordDialogVisible"
      header="门诊电子病历详情"
      width="600px"
      :footer="null"
    >
      <div v-if="selectedRecord" class="record-detail-modal" style="padding: 10px 0; font-size: 14px; color: #374151; line-height: 1.6;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #E5E7EB;">
          <div><strong>就诊时间:</strong> {{ selectedRecord.visit_date }}</div>
          <div><strong>就诊门店:</strong> {{ selectedRecord.store_name }}</div>
          <div><strong>接诊医生:</strong> {{ selectedRecord.doctor_name }}<span v-if="selectedRecord.doctor_title"> ({{ selectedRecord.doctor_title }})</span></div>
          <div><strong>就诊科室:</strong> {{ selectedRecord.doctor_specialty }}</div>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;"><AppIcon name="stethoscope" />  临床诊断：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; border-left: 4px solid var(--primary-500); white-space: pre-wrap;">
            {{ selectedRecord.diagnosis }}
          </div>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;"><AppIcon name="pill" />  治疗方案 / 处方：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; border-left: 4px solid var(--success-500); white-space: pre-wrap;">
            {{ selectedRecord.prescription || '未记录' }}
          </div>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;"><AppIcon name="megaphone" />  医嘱建议：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; border-left: 4px solid #F59E0B; white-space: pre-wrap;">
            {{ selectedRecord.doctor_advice || '未记录' }}
          </div>
        </div>
        <div v-if="selectedRecord.note" style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;"><AppIcon name="file-text" />  备注：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; color: #6B7280; white-space: pre-wrap;">
            {{ selectedRecord.note }}
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
          <t-button theme="default" @click="recordDialogVisible = false">关闭</t-button>
        </div>
      </div>
    </t-dialog>

    <!-- CRM 跟进弹窗 -->
    <t-dialog
      v-model:visible="crmVisible"
      :header="`添加跟进记录 - ${patient.name}`"
      width="500px"
      :on-confirm="handleSaveCrm"
      :confirm-btn="{ content: '保存跟进', loading: submittingCrm }"
      cancel-btn="取消"
    >
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 10px 0;">
        <div>
          <div style="font-size: 13px; color: #6B7280; margin-bottom: 6px;">分配跟进人：</div>
          <t-select
            v-model="crmForm.followerId"
            placeholder="选择跟进人"
            clearable
            style="width: 100%;"
          >
            <t-option v-for="item in followers" :key="item.id" :label="item.name" :value="item.id.toString()" />
          </t-select>
        </div>

        <div>
          <div style="font-size: 13px; color: #6B7280; margin-bottom: 6px;">跟进阶段：</div>
          <t-radio-group v-model="crmForm.stage" variant="default-filled">
            <t-radio-button value="意向中">意向中</t-radio-button>
            <t-radio-button value="考虑中">考虑中</t-radio-button>
            <t-radio-button value="已成单">已成单</t-radio-button>
            <t-radio-button value="已放弃">已放弃</t-radio-button>
          </t-radio-group>
        </div>

        <div>
          <div style="font-size: 13px; color: #6B7280; margin-bottom: 6px;">跟进内容描述：</div>
          <t-textarea
            v-model="crmForm.content"
            placeholder="请输入与患者沟通的详细跟进记录..."
            :autosize="{ minRows: 4, maxRows: 8 }"
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

/* Tabs */
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #E5E7EB;
}
.tab {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 150ms;
}
.tab.active {
  color: var(--primary-500);
  border-bottom-color: var(--primary-500);
  font-weight: 600;
}
.tab:hover:not(.active) {
  color: #374151;
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
.btn-success {
  background: #ECFDF5;
  color: #16A34A;
  border: 1px solid #BBF7D0;
}
.btn-success:hover {
  background: #D3F5E3;
}
.btn-danger {
  background: #FEF2F2;
  color: #DC2626;
  border: 1px solid #FECACA;
}
.btn-danger:hover {
  background: #FEE2E2;
}
.btn:disabled,
.btn.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn-xs {
  padding: 3px 8px;
  font-size: 11px;
}

/* Grids */
.card-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
}
.card-grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.mini-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.mini-stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.mini-stat-value {
  font-size: 18px;
  font-weight: 800;
  color: #111827;
}
.mini-stat-label {
  font-size: 11px;
  color: #9CA3AF;
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

/* Progress Bar */
.progress-bar {
  height: 8px;
  background: #F3F4F6;
  border-radius: 4px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 300ms;
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
.timeline-dot.gold {
  background: #F59E0B;
  box-shadow: 0 0 0 2px #FFFBEB;
}
.timeline-dot.red {
  background: #EF4444;
  box-shadow: 0 0 0 2px #FEF2F2;
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

/* Tags */
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
.tag-gray {
  background: #F3F4F6;
  color: #6B7280;
}

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
.status-tag.gold {
  background: #FFF9E6;
  color: #D97706;
}
.status-tag.gold::before {
  background: #F59E0B;
}
.status-tag.red {
  background: #FEF2F2;
  color: #DC2626;
}
.status-tag.red::before {
  background: #EF4444;
}
.edit-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-item.span-2 {
  grid-column: span 2;
}
.form-item label {
  font-size: 13px;
  color: #6B7280;
  font-weight: 600;
}
.form-control {
  width: 100%;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 9px 11px;
  font-size: 13px;
  color: #1F2937;
  outline: none;
  background: #fff;
}
.form-control:focus {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px rgba(59, 107, 245, 0.12);
}
.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.file-card {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid #E5E7EB;
  border-radius: 10px;
  padding: 12px;
  background: #F9FAFB;
}
.file-icon {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #EEF4FF;
  color: var(--primary-500);
}
.file-name {
  font-weight: 700;
  color: #1F2937;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-meta {
  font-size: 12px;
  color: #9CA3AF;
  margin-top: 2px;
}
</style>
