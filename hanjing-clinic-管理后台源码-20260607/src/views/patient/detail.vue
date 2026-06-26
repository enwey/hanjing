<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import * as echarts from 'echarts'
import request from '@/utils/request'

const route = useRoute()
const router = useRouter()
const activeTab = ref('info')

const patientId = ref(route.params.id as string || '1')

/* ---- Patient Data ---- */
const patient = ref({
  id: patientId.value,
  no: 'HZ20240001',
  name: '张明华',
  phone: '138****6789',
  gender: '男',
  age: 52,
  level: 'VIP',
  source: '小程序',
  referrer: '无推荐人',
  regDate: '2024-01-15',
  totalVisits: 0,
  totalSpent: 0,
  commissionRate: '10%',
  nextFollowup: '待定',
  diagnosis: '暂无诊断记录',
  plan: '暂无治疗方案',
  lastVisit: '暂无就诊'
})

/* ---- Departments Progress ---- */
const depts = ref([
  { name: '睡眠呼吸科', visits: 0, percentage: 100, color: 'var(--primary-500)' },
  { name: '耳鼻喉科', visits: 0, percentage: 0, color: '#5A85F5' },
  { name: '心理科', visits: 0, percentage: 0, color: 'var(--success-500)' },
])

/* ---- Timeline Events ---- */
const timelineEvents = ref<any[]>([])

/* ---- Orders Records ---- */
const orders = ref<any[]>([])

/* ---- Followup Tasks ---- */
const followups = ref<any[]>([])

/* ---- ECharts for Sleep Trends ---- */
const chartRef = ref<HTMLDivElement | null>(null)
let myChart: echarts.ECharts | null = null

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

    patient.value = {
      id: p.id.toString(),
      no: `P2026${String(p.id).padStart(4, '0')}`,
      name: p.name,
      phone: p.phone || p.user_phone || '未绑定',
      gender: p.gender === 1 ? '男' : '女',
      age: p.age || 30,
      level: levelMap[p.member_level] || '普通',
      source: p.source === 'walk_in' ? '门店' : '小程序',
      referrer: p.referrer_name || '无推荐人',
      regDate: p.created_at ? p.created_at.substring(0, 10) : '2026-06-01',
      totalVisits: p.appointments ? p.appointments.length : 0,
      totalSpent: (p.total_spent || 0) / 100,
      commissionRate: p.member_level === 'diamond' ? '15%' : '10%',
      nextFollowup: '待随访',
      diagnosis: '暂无诊断记录',
      plan: '暂无治疗方案',
      medical_history: p.medical_history || '',
      allergy_history: p.allergy_history || '',
      lastVisit: p.appointments && p.appointments[0] ? `${(() => {
        const d = new Date(p.appointments[0].appointment_date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })()} ${p.appointments[0].store_name} ${p.appointments[0].doctor_name}` : '暂无记录'
    }

    // Map departments progress
    if (p.appointments) {
      const sleepCount = p.appointments.filter((a: any) => a.doctor_specialty === '睡眠呼吸科').length
      const entCount = p.appointments.filter((a: any) => a.doctor_specialty === '耳鼻喉科').length
      const psychCount = p.appointments.filter((a: any) => a.doctor_specialty === '心理科').length
      const total = sleepCount + entCount + psychCount || 1

      depts.value = [
        { name: '睡眠呼吸科', visits: sleepCount, percentage: Math.round((sleepCount / total) * 100), color: 'var(--primary-500)' },
        { name: '耳鼻喉科', visits: entCount, percentage: Math.round((entCount / total) * 100), color: '#5A85F5' },
        { name: '心理科', visits: psychCount, percentage: Math.round((psychCount / total) * 100), color: 'var(--success-500)' },
      ]

      // Map timeline events
      timelineEvents.value = p.appointments.map((a: any) => {
        let title = '预约记录'
        let color = 'gold'
        if (a.status === 'completed') {
          title = '完成就诊'
          color = 'green'
        } else if (a.status === 'confirmed') {
          title = '确认待就诊'
          color = 'blue'
        } else if (a.status === 'cancelled') {
          title = '已取消预约'
          color = 'red'
        }
        return {
          id: a.id.toString(),
          date: `${(() => {
            const d = new Date(a.appointment_date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          })()} · ${a.store_name} · ${a.doctor_name}`,
          title,
          content: a.symptom_desc || '无主诉描述',
          color
        }
      })
    }

    // Load orders
    if (p.user_id) {
      fetchOrders(p.user_id)
    }
  } catch (error) {
    console.error('Failed to load patient detail:', error)
  }
}

const fetchOrders = async (userId: number) => {
  try {
    const res: any = await request.get('/api/admin/orders')
    orders.value = res.data.filter((o: any) => o.user_id === userId).map((o: any) => {
      const prodName = o.items && o.items[0] ? o.items[0].product_name : '健康包/配件'
      const productDesc = o.items && o.items.length > 1 ? `${prodName} 等${o.items.length}件` : prodName
      
      let addr: any = {}
      try {
        addr = JSON.parse(o.shipping_address || '{}')
      } catch(e) {}
      
      let deliveryLabel = ''
      if (o.type === 'online') {
        deliveryLabel = `快递邮寄 (${o.status === 'shipped' ? '已发货' : '待发货'})`
      } else {
        deliveryLabel = `到店自提 (${addr.status || '现场直接提走'})`
      }

      const statusMap: Record<string, string> = {
        completed: '已完成',
        processing: '自提待到货',
        shipping: '快递待发货',
        shipped: '已发货',
        refunded: '已退款'
      }

      return {
        id: o.id.toString(),
        no: o.order_no,
        productName: productDesc,
        price: o.pay_amount / 100,
        date: o.created_at ? o.created_at.substring(0, 10) : '2026-06-01',
        delivery: deliveryLabel,
        status: statusMap[o.status] || '已支付'
      }
    })
  } catch (error) {
    console.error(error)
  }
}

const fetchFollowups = async () => {
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId.value}/follow-ups`)
    const { tasks } = res.data
    followups.value = tasks.map((t: any) => ({
      type: t.title,
      time: t.due_date,
      executor: t.doctor_name,
      content: t.description || '物理阻鼾随访',
      status: t.status === 'completed' ? '已完成' : '待执行'
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
      if (logs && logs.length > 0 && myChart) {
        const sortedLogs = [...logs].reverse()
        const dates = sortedLogs.map((l: any) => l.date.substring(5))
        const durations = sortedLogs.map((l: any) => l.wear_duration)

        myChart.setOption({
          xAxis: { data: dates },
          series: [
            { data: durations },
            { data: [] }
          ]
        })
      }
    }
  } catch (error) {
    console.error(error)
  }
}

const medicalRecords = ref<any[]>([])
const selectedRecord = ref<any>(null)
const recordDialogVisible = ref(false)

const fetchMedicalRecords = async () => {
  try {
    const res: any = await request.get(`/api/admin/patients/${patientId.value}/medical-records`)
    if (res.code === 200) {
      medicalRecords.value = res.data
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
        data: ['5/23', '5/24', '5/25', '5/26', '5/27', '5/28', '5/29'],
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
          data: [6.5, 7.0, 5.8, 8.0, 7.5, 7.2, 7.8],
          itemStyle: { color: 'var(--primary-500)', borderRadius: [4, 4, 0, 0] },
          barWidth: '25%'
        },
        {
          name: 'AHI 指数（真实记录）',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          data: [32, 28, 24, 15, 12, 10, 8],
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
  fetchMedicalRecords()
})

function handleBack() {
  router.push('/patient')
}

function handleEdit() {
  MessagePlugin.info('跳转至编辑患者信息...')
}

function handleNewAppointment() {
  router.push('/appointment/create')
}

function handleFollowup() {
  router.push('/patient/followup/' + patientId.value)
}
</script>

<template>
  <div class="page-container">


    <!-- Header Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">
          {{ patient.name }}
          <span class="tag tag-gold">{{ patient.level }}</span>
          <span class="tag tag-blue">复诊</span>
        </div>
        <div class="page-title-sub">病历号 {{ patient.no }} · 注册于 {{ patient.regDate }}</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" @click="handleEdit">✏️ 编辑</button>
        <button class="btn btn-primary" @click="handleNewAppointment">📅 新建预约</button>
        <button class="btn btn-success" @click="handleFollowup">📞 随访</button>
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
    </div>

    <!-- Tab Contents -->
    <div style="margin-top: 20px;">
      <!-- Tab 1: Basic Info -->
      <div v-if="activeTab === 'info'">
        <!-- Stats cards -->
        <div class="card-grid-4">
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--primary-100); color: var(--primary-500);">📅</div>
            <div>
              <div class="mini-stat-value">{{ patient.totalVisits }}</div>
              <div class="mini-stat-label">累计就诊</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--success-100); color: var(--success-500);">💰</div>
            <div>
              <div class="mini-stat-value">¥{{ patient.totalSpent.toLocaleString() }}</div>
              <div class="mini-stat-label">消费总额</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: #FFF9E6; color: #D4930A;">🏷️</div>
            <div>
              <div class="mini-stat-value">{{ patient.commissionRate }}</div>
              <div class="mini-stat-label">分销佣金率</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--error-100); color: var(--error-500);">⏰</div>
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
            <div class="panel-header"><div class="panel-title">📋 个人信息</div></div>
            <div class="info-grid">
              <div class="info-item"><div class="info-label">姓名</div><div class="info-value">{{ patient.name }}</div></div>
              <div class="info-item"><div class="info-label">性别</div><div class="info-value">{{ patient.gender }}</div></div>
              <div class="info-item"><div class="info-label">年龄</div><div class="info-value">{{ patient.age }}岁</div></div>
              <div class="info-item"><div class="info-label">手机号</div><div class="info-value">{{ patient.phone }}</div></div>
              <div class="info-item"><div class="info-label">来源</div><div class="info-value"><span class="tag tag-green">{{ patient.source }}</span></div></div>
              <div class="info-item"><div class="info-label">标签</div><div class="info-value"><span class="tag tag-gold">{{ patient.level }}</span> <span class="tag tag-blue">复诊</span></div></div>
              <div class="info-item"><div class="info-label">推荐人</div><div class="info-value">{{ patient.referrer }}</div></div>
              <div class="info-item"><div class="info-label">注册时间</div><div class="info-value">{{ patient.regDate }}</div></div>
            </div>
          </div>

          <!-- Medical Overview -->
          <div class="panel" style="margin: 0;">
            <div class="panel-header"><div class="panel-title">🏥 就诊概况</div></div>
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
                <strong style="color: #1F2937;">主诊断：</strong>{{ patient.diagnosis }}<br>
                <strong style="color: #1F2937;">当前方案：</strong>{{ patient.plan }}<br>
                <strong style="color: #1F2937;">上次就诊：</strong>{{ patient.lastVisit }}
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

        <!-- Timeline of Visits -->
        <div class="panel" style="margin-top: 16px;">
          <div class="panel-header"><div class="panel-title">📅 就诊时间线</div></div>
          <div class="panel-body">
            <div class="timeline">
              <div class="timeline-item" v-for="ev in timelineEvents" :key="ev.id">
                <div class="timeline-dot" :class="ev.color"></div>
                <div class="timeline-time">{{ ev.date }}</div>
                <div class="timeline-content"><strong>{{ ev.title }}</strong> — {{ ev.content }}</div>
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
                <span>📋 既往病史</span>
              </div>
              <div v-if="patient.medical_history" style="background: #FFFBEB; padding: 14px; border-radius: 8px; border-left: 4px solid #F59E0B; font-size: 13px; color: #D97706; font-weight: 500; text-align: left;">
                {{ patient.medical_history }}
              </div>
              <div v-else style="text-align:center;color:#9CA3AF;background:#F9FAFB;padding:24px;border-radius:8px;font-size:12px;">暂无既往病史记录</div>
            </div>
            
            <div>
              <div style="font-weight: 700; font-size: 14px; color: #374151; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                <span>🚫 药物与过敏史</span>
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
                <td>睡眠呼吸科</td>
                <td>{{ mr.doctor_name }} ({{ mr.doctor_title || '主任医师' }})</td>
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
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, i) in followups" :key="i">
                <td><span class="tag tag-blue">{{ f.type }}</span></td>
                <td>{{ f.time }}</td>
                <td>{{ f.executor }}</td>
                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" :title="f.content">{{ f.content }}</td>
                <td><span class="status-tag gold">{{ f.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 5: Patient Files -->
      <div v-if="activeTab === 'files'">
        <div class="panel" style="margin: 0; padding: 40px; text-align: center; color: #9CA3AF;">
          📁 暂无病历电子附件/睡眠监测报告PDF，点击可上传
          <div style="margin-top: 12px;"><button class="btn btn-sm btn-outline">上传病历附件</button></div>
        </div>
      </div>
    </div>

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
          <div><strong>接诊医生:</strong> {{ selectedRecord.doctor_name }} ({{ selectedRecord.doctor_title || '主任医师' }})</div>
          <div><strong>就诊科室:</strong> 睡眠呼吸科</div>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;">🩺 临床诊断：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; border-left: 4px solid var(--primary-500); white-space: pre-wrap;">
            {{ selectedRecord.diagnosis }}
          </div>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;">💊 治疗方案 / 处方：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; border-left: 4px solid var(--success-500); white-space: pre-wrap;">
            {{ selectedRecord.prescription || '未开具处方' }}
          </div>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;">📣 医嘱建议：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; border-left: 4px solid #F59E0B; white-space: pre-wrap;">
            {{ selectedRecord.doctor_advice || '无' }}
          </div>
        </div>
        <div v-if="selectedRecord.note" style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;">📝 备注：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; color: #6B7280; white-space: pre-wrap;">
            {{ selectedRecord.note }}
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
          <t-button theme="default" @click="recordDialogVisible = false">关闭</t-button>
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
.status-tag.gold {
  background: #FFF9E6;
  color: #D97706;
}
.status-tag.gold::before {
  background: #F59E0B;
}
</style>
