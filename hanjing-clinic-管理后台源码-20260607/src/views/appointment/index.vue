<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()

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
      status: item.status === 'arrived' || item.status === 'settled' ? 'arrived' : item.status === 'completed' ? 'completed' : item.status === 'confirmed' || item.status === 'waiting' ? 'waiting' : item.status === 'pending' ? 'pending' : 'cancelled'
    }))
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
  { label: '待确认', value: 'pending' },
  { label: '候诊中', value: 'waiting' },
  { label: '待结算', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
]

const statusMap: Record<string, { label: string; theme: string }> = {
  arrived: { label: '已结账', theme: 'success' },
  completed: { label: '待结算', theme: 'danger' },
  waiting: { label: '候诊中', theme: 'primary' },
  pending: { label: '待确认', theme: 'warning' },
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
    list = list.filter(a => a.store === filterStore.value)
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
    today: list.filter(a => a.date === '2026-05-29').length,
    pending: statusList.filter(a => a.status === 'pending').length,
    waiting: statusList.filter(a => a.status === 'waiting').length,
    completed: statusList.filter(a => a.status === 'completed').length,
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
    list = list.filter(a => a.date === '2026-05-29')
  } else if (activeTab.value === 'pending') {
    list = list.filter(a => a.status === 'pending')
  } else if (activeTab.value === 'waiting') {
    list = list.filter(a => a.status === 'waiting')
  } else if (activeTab.value === 'completed') {
    list = list.filter(a => a.status === 'completed')
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
    list = list.filter(a => a.store === filterStore.value)
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

const paginatedAppointments = computed(() => {
  const filtered = getFilteredAppointments()
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
})

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


// 呼叫广播叫号
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

function openCheckoutDialog(row: Appointment) {
  selectedCheckoutRow.value = row
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
    const payload = {
      patient_id: parseInt(selectedCheckoutRow.value.patientId, 10),
      items: billingItems.value,
      pay_amount: payableAmount.value,
      discount_amount: discountAmount.value,
      pay_method: payMethod.value
    }
    const res: any = await request.post('/api/admin/orders', payload)
    if (res.code === 200) {
      try {
        await request.put(`/api/admin/appointments/${selectedCheckoutRow.value.id}`, { status: 'arrived' })
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
        <t-button theme="default" variant="outline">📥 导出</t-button>
        <t-button theme="primary" @click="router.push('/appointment/create')">➕ 新建预约</t-button>
      </div>
    </div>

    <!-- Panel Wrapper -->
    <div class="panel">
      <!-- Filter panel with Status Tabs (Left) and Dropdowns (Right) -->
      <div class="filter-bar">
        <!-- Left: Filter Tabs -->
        <div style="display: flex; gap: 8px;">
          <div
            v-for="tab in tabOptions"
            :key="tab.value"
            @click="activeTab = tab.value"
            :style="{
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === tab.value ? '600' : '400',
              background: activeTab === tab.value ? '#3B6BF5' : '#F3F4F6',
              color: activeTab === tab.value ? '#FFFFFF' : '#4B5563',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === tab.value ? '0 2px 6px rgba(59, 107, 245, 0.2)' : 'none'
            }"
          >
            {{ tab.label }}
            <span :style="{ opacity: activeTab === tab.value ? '0.9' : '0.6', fontSize: '11px', fontWeight: '500' }">
              {{ counts[tab.value] }}
            </span>
          </div>
        </div>

        <!-- Right: Dropdowns and Search -->
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <t-input
            v-model="searchKeyword"
            placeholder="搜索患者/预约单号"
            clearable
            style="width: 180px;"
          />
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; color: #4B5563;">门店</span>
            <t-select v-model="filterStore" :options="storeOptions" style="width: 125px;" />
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; color: #4B5563;">医生</span>
            <t-select v-model="filterDoctor" :options="doctorOptions" style="width: 110px;" />
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; color: #4B5563;">日期</span>
            <t-date-picker v-model="filterDate" style="width: 135px;" clearable placeholder="选择日期" />
          </div>
        </div>
      </div>

      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="width: 140px;">预约单号</th>
              <th style="width: 180px;">患者</th>
              <th style="width: 120px;">门店</th>
              <th style="width: 100px;">医生</th>
              <th style="width: 140px;">预约时间</th>
              <th style="width: 90px;">来源</th>
              <th style="width: 100px;">状态</th>
              <th style="width: 210px; min-width: 210px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedAppointments" :key="row.id" @click="router.push('/appointment/detail/' + row.id)" style="cursor: pointer;">
              <td style="font-family: monospace; font-weight: 600; color: var(--primary-500);">{{ row.no }}</td>
              <td>
                <div style="display: flex; align-items: center; gap: 10px;" @click.stop>
                  <t-avatar size="32px" :style="{ background: row.avatarColor }">
                    {{ row.avatarChar }}
                  </t-avatar>
                  <div>
                    <div style="font-weight: 600; color: #1F2937; line-height: 1.4;">{{ row.patient }}</div>
                    <div style="font-size: 11px; color: #9CA3AF; line-height: 1.2;">{{ row.phone }}</div>
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
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;" @click.stop>
                  <!-- status is pending (待确认) -->
                  <button
                    v-if="row.status === 'pending'"
                    class="btn btn-xs btn-primary"
                    @click="handleCheckIn(row)"
                  >签到</button>
                  <button
                    v-if="row.status === 'pending'"
                    class="btn btn-xs btn-danger"
                    @click="cancelStatus(row.id)"
                  >取消</button>
                  
                  <!-- status is waiting (候诊中) -->
                  <button
                    v-if="row.status === 'waiting'"
                    class="btn btn-xs btn-warning"
                    @click="callPatient(row.patient, row.doctor)"
                  >📢 叫号</button>
                  <button
                    v-if="row.status === 'waiting'"
                    class="btn btn-xs btn-success"
                    @click="completeTreatment(row)"
                  >✅ 完成诊疗</button>

                  <!-- status is completed (待结算) -->
                  <button
                    v-if="row.status === 'completed'"
                    class="btn btn-xs btn-warning"
                    @click="openCheckoutDialog(row)"
                  >🪙 收银结算</button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedAppointments.length === 0">
              <td colspan="8" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无匹配的预约记录数据</td>
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
      header="诊所收银结算"
      width="680px"
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

      <div v-else style="display: flex; gap: 20px; padding: 10px 0;">
        <!-- Left: billing form -->
        <div style="flex: 1; display: flex; flex-direction: column; gap: 14px;">
          <div class="form-group">
            <label class="form-label">就诊患者</label>
            <input type="text" class="form-control" :value="selectedCheckoutRow?.patient" disabled style="background-color: #F3F4F6; outline: none;">
          </div>
          
          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label class="form-label" style="margin-bottom: 0;">收费项目明细</label>
              <t-button size="small" theme="primary" variant="outline" @click="addBillingItem">
                添加项目
              </t-button>
            </div>
            <div v-for="(item, idx) in billingItems" :key="idx" style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
              <t-select
                v-model="item.product_id"
                :options="productOptions.map(p => ({ label: p.name, value: p.id }))"
                style="flex: 1;"
                @change="(val: any) => onProductChange(idx, val)"
              />
              <t-input-number v-model="item.quantity" :min="1" style="width: 80px;" />
              <div style="width: 80px; text-align: right; font-weight: 700; font-size: 13px; color: #1F2937;">
                ¥{{ ((item.price * item.quantity) / 100).toFixed(2) }}
              </div>
              <t-button theme="danger" variant="text" size="small" @click="removeBillingItem(idx)">删除</t-button>
            </div>
          </div>

          <div style="display: flex; gap: 16px;">
            <div class="form-group" style="flex: 1;">
              <label class="form-label">卡券折扣金额 (元)</label>
              <t-input-number v-model="discountAmount" :min="0" :step="1000" :format="val => `¥${(val / 100).toFixed(2)}`" style="width: 100%;" />
            </div>
            <div class="form-group" style="flex: 1;">
              <label class="form-label">支付方式</label>
              <t-select v-model="payMethod" :options="[
                { label: '微信支付', value: 'wechat' },
                { label: '支付宝', value: 'alipay' },
                { label: 'POS线下刷卡', value: 'pos' }
              ]" />
            </div>
          </div>
        </div>

        <!-- Right: Summary -->
        <div style="width: 200px; background: #F9FAFB; padding: 16px; border-radius: 8px; border: 1px solid #E5E7EB; display: flex; flex-direction: column;">
          <div style="font-size: 14px; font-weight: bold; color: #1F2937; margin-bottom: 12px; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">结算金额</div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #4B5563; margin-bottom: 8px;">
            <span>项目总额</span>
            <span>¥{{ (totalAmount / 100).toFixed(2) }}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #4B5563; margin-bottom: 12px;">
            <span>折扣金额</span>
            <span style="color: #EF4444;">-¥{{ (discountAmount / 100).toFixed(2) }}</span>
          </div>
          <div style="height: 1px; background: #E5E7EB; margin-bottom: 12px;"></div>
          <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px;">
            <span style="font-size: 11px; color: #9CA3AF;">应收总额</span>
            <span style="font-size: 22px; font-weight: 800; color: #1A9D5C;">¥{{ (payableAmount / 100).toFixed(2) }}</span>
          </div>
          <t-button size="large" theme="success" block :loading="checkoutLoading" @click="submitCheckout" style="margin-top: auto;">
            确认收款
          </t-button>
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
</style>

