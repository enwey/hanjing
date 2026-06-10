<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import * as echarts from 'echarts'

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
  referrer: '赵芳芳（钻石推广员）',
  regDate: '2024-01-15',
  totalVisits: 8,
  totalSpent: 18640,
  commissionRate: '15%',
  nextFollowup: '3天',
  diagnosis: '阻塞性睡眠呼吸暂停综合征（OSAHS）',
  plan: 'CPAP治疗 + 定期PSG监测',
  lastVisit: '5/29 龙岗总店 古堪民'
})

/* ---- Departments Progress ---- */
const depts = [
  { name: '睡眠呼吸科', visits: 5, percentage: 62, color: 'var(--primary-500)' },
  { name: '耳鼻喉科', visits: 2, percentage: 25, color: '#5A85F5' },
  { name: '心理科', visits: 1, percentage: 12, color: 'var(--success-500)' },
]

/* ---- Timeline Events ---- */
const timelineEvents = [
  { id: '1', date: '5/29 · 龙岗总店 · 古堪民', title: '第8次就诊', content: '睡眠呼吸科复诊，PSG监测数据复查，AHI指数从32降至8，效果良好。建议继续CPAP治疗3个月后再复查。', color: 'green' },
  { id: '2', date: '4/15 · 龙岗总店 · 古堪民', title: '第7次就诊', content: 'CPAP使用1个月随访，依从性良好，白天嗜睡改善明显。调整压力至10cmH2O。', color: 'green' },
  { id: '3', date: '3/20 · 龙岗总店 · 王志远', title: '第6次就诊', content: '耳鼻喉科，鼻中隔偏曲评估，建议保守治疗暂不手术。', color: 'green' },
  { id: '4', date: '2/25 · 南山分院', title: '取消预约', content: '患者因出差取消', color: 'red' },
  { id: '5', date: '1/10 · 龙岗总店 · 古堪民', title: '第5次就诊', content: '首次佩戴CPAP呼吸机，压力滴定测试完成，处方压力12cmH2O。开具CPAP设备（¥8,900）', color: 'gold' },
]

/* ---- Orders Records ---- */
const orders = [
  { id: '1', no: 'OD20260529003', productName: '瑞思迈 AirSense 10 自动呼吸机', price: 8900, date: '2026-05-29', status: '已发货' },
  { id: '2', no: 'OD20260110001', productName: '多导睡眠监测 (PSG) 诊断服务', price: 3680, date: '2026-01-10', status: '已就诊' },
]

/* ---- Followup Tasks ---- */
const followups = [
  { type: '电话随访', time: '6/1 (3天后)', executor: '古堪民', content: 'CPAP使用1周回访，询问依从性、面罩舒适度、副作用', status: '待执行' },
  { type: '到店复查', time: '8/29 (3个月后)', executor: '古堪民', content: 'CPAP治疗3个月复查PSG，评估长期疗效', status: '待执行' }
]

/* ---- ECharts for Sleep Trends ---- */
const chartRef = ref<HTMLDivElement | null>(null)

onMounted(() => {
  if (chartRef.value) {
    const myChart = echarts.init(chartRef.value)
    const option = {
      title: {
        text: '设备佩戴时长与 AHI 监测趋势 (近7次佩戴)',
        left: 'left',
        textStyle: { fontSize: 14, color: '#111827', fontWeight: 600 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' }
      },
      legend: {
        data: ['佩戴时长 (小时)', 'AHI 指数 (次/小时)'],
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
          name: 'AHI 指数 (次/小时)',
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
      myChart.resize()
    })
  }
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
              <tr v-for="ev in timelineEvents.filter(x => x.color !== 'red')" :key="ev.id">
                <td>{{ ev.date.split(' · ')[0] }}</td>
                <td>睡眠呼吸科</td>
                <td>{{ ev.date.split(' · ')[2] || '古堪民' }}</td>
                <td style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ ev.content }}</td>
                <td><button class="btn btn-xs btn-outline">看病历</button></td>
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
                <th>支付金额</th>
                <th>交易状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ord in orders" :key="ord.id">
                <td style="font-family: monospace;">{{ ord.no }}</td>
                <td>{{ ord.date }}</td>
                <td>{{ ord.productName }}</td>
                <td style="font-weight: 700; color: var(--primary-500);">¥{{ ord.price.toLocaleString() }}</td>
                <td><span class="status-tag green">{{ ord.status }}</span></td>
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
                <td>{{ f.content }}</td>
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
