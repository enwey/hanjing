<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'

const router = useRouter()
const filterTime = ref('month')

// Mock datasets for different time intervals
const dashboardData = {
  today: {
    kpi: [
      { label: '今日预约', value: '156', trend: '↑ 18%', trendType: 'up', icon: '📅', color: 'blue' },
      { label: '今日营收', value: '¥1.24w', trend: '↑ 12%', trendType: 'up', icon: '💰', color: 'green' },
      { label: '今日新增患者', value: '28', trend: '↑ 5%', trendType: 'up', icon: '👥', color: 'gold' },
      { label: '今日到诊率', value: '92.3%', trend: '↓ 3%', trendType: 'down', icon: '🔄', color: 'red' }
    ],
    chartX: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
    chartY: [12, 24, 32, 15, 8, 22, 28, 18, 15, 10],
    updateTime: '2026-06-09 18:00'
  },
  week: {
    kpi: [
      { label: '本周预约', value: '842', trend: '↑ 15%', trendType: 'up', icon: '📅', color: 'blue' },
      { label: '本周营收', value: '¥8.75w', trend: '↑ 19%', trendType: 'up', icon: '💰', color: 'green' },
      { label: '本周新增患者', value: '185', trend: '↑ 10%', trendType: 'up', icon: '👥', color: 'gold' },
      { label: '本周到诊率', value: '94.1%', trend: '↑ 2%', trendType: 'up', icon: '🔄', color: 'green' }
    ],
    chartX: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    chartY: [98, 115, 120, 138, 145, 110, 116],
    updateTime: '2026-06-09 18:00'
  },
  month: {
    kpi: [
      { label: '本月预约', value: '3,420', trend: '↑ 22%', trendType: 'up', icon: '📅', color: 'blue' },
      { label: '本月营收', value: '¥38.6w', trend: '↑ 23%', trendType: 'up', icon: '💰', color: 'green' },
      { label: '累计患者', value: '2,847', trend: '↑ 8%', trendType: 'up', icon: '👥', color: 'gold' },
      { label: '当月到诊率', value: '93.5%', trend: '↑ 1.5%', trendType: 'up', icon: '🔄', color: 'green' }
    ],
    chartX: ['5/18', '5/19', '5/20', '5/21', '5/22', '5/23', '5/24', '5/25', '5/26', '5/27', '5/28', '5/29'],
    chartY: [110, 138, 85, 156, 128, 165, 120, 147, 102, 175, 132, 162],
    updateTime: '2026-06-09 18:00'
  }
}

const kpiCards = ref([...dashboardData.month.kpi])
const updateTimeStr = ref(dashboardData.month.updateTime)

// Departments Distribution
const depts = ref([
  { name: '睡眠呼吸科', percent: 42, color: '#3B6BF5' },
  { name: '耳鼻喉科', percent: 28, color: '#5A85F5' },
  { name: '口腔科', percent: 18, color: '#1A9D5C' },
  { name: '心理科', percent: 12, color: '#F5A623' }
])

// Today Appointments
const todayAppointments = ref([
  { patient: '张明华', avatarColor: '#5A85F5', doctor: '古堪民', time: '09:30', status: '已到诊', statusTheme: 'green' },
  { patient: '李雪琴', avatarColor: '#9333EA', doctor: '王志远', time: '10:00', status: '候诊中', statusTheme: 'blue' },
  { patient: '陈建国', avatarColor: '#F5A623', doctor: '古堪民', time: '10:30', status: '待确认', statusTheme: 'gold' },
  { patient: '周小燕', avatarColor: '#1A9D5C', doctor: '刘婉清', time: '11:00', status: '已取消', statusTheme: 'gray' },
  { patient: '吴佳佳', avatarColor: '#EC4899', doctor: '王志远', time: '14:00', status: '候诊中', statusTheme: 'blue' }
])

// Latest Orders
const latestOrders = ref([
  { orderNo: '#2026052901', product: '睡眠监测套餐', amount: '¥3,680', status: '已完成', statusTheme: 'green' },
  { orderNo: '#2026052902', product: '止鼾器定制', amount: '¥1,280', status: '处理中', statusTheme: 'blue' },
  { orderNo: '#2026052903', product: 'CPAP呼吸机', amount: '¥8,900', status: '待发货', statusTheme: 'gold' },
  { orderNo: '#2026052904', product: '初诊挂号', amount: '¥200', status: '已完成', statusTheme: 'green' },
  { orderNo: '#2026052905', product: '初诊挂号', amount: '¥200', status: '已完成', statusTheme: 'green' }
])

const trendChartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

const updateChart = (xData: string[], yData: number[]) => {
  if (chart) {
    chart.setOption({
      xAxis: {
        data: xData
      },
      series: [
        {
          data: yData
        }
      ]
    })
  }
}

watch(filterTime, (newVal) => {
  const data = dashboardData[newVal as 'today' | 'week' | 'month']
  kpiCards.value = [...data.kpi]
  updateTimeStr.value = data.updateTime
  updateChart(data.chartX, data.chartY)
})

onMounted(() => {
  if (trendChartRef.value) {
    chart = echarts.init(trendChartRef.value)
    const activeData = dashboardData[filterTime.value as 'today' | 'week' | 'month']
    chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' }
      },
      grid: {
        left: '0%',
        right: '0%',
        top: '6%',
        bottom: '0%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: activeData.chartX,
        axisLine: { lineStyle: { color: '#E5E7EB' } },
        axisLabel: { color: '#9CA3AF', fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#F3F4F6' } },
        axisLabel: { color: '#9CA3AF', fontSize: 11 }
      },
      series: [
        {
          name: '预约数',
          type: 'bar',
          barWidth: '40%',
          data: activeData.chartY,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#3B6BF5' },
              { offset: 1, color: '#8EAFFF' }
            ]),
            borderRadius: [4, 4, 0, 0]
          }
        }
      ]
    })

    window.addEventListener('resize', () => {
      chart?.resize()
    })
  }
})
</script>

<template>
  <div>
    <!-- Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">数据看板</div>
        <div class="page-title-sub">数据更新时间：{{ updateTimeStr }} · 实时数据</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button :class="['btn', filterTime === 'today' ? 'btn-primary' : 'btn-outline']" @click="filterTime = 'today'">📅 今日</button>
        <button :class="['btn', filterTime === 'week' ? 'btn-primary' : 'btn-outline']" @click="filterTime = 'week'">本周</button>
        <button :class="['btn', filterTime === 'month' ? 'btn-primary' : 'btn-outline']" @click="filterTime = 'month'">本月</button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="stat-grid">
      <div v-for="kpi in kpiCards" :key="kpi.label" class="stat-card">
        <div class="stat-card-header">
          <div :class="['stat-card-icon', kpi.color]">{{ kpi.icon }}</div>
          <div :class="['stat-card-trend', kpi.trendType]">{{ kpi.trend }}</div>
        </div>
        <div class="stat-card-value">{{ kpi.value }}</div>
        <div class="stat-card-label">{{ kpi.label }}</div>
      </div>
    </div>

    <!-- Charts Area Grid -->
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-bottom: 24px;">
      <!-- Reservation Trend -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">预约趋势</div>
          <div class="panel-actions">
            <button class="btn btn-sm btn-outline">日</button>
            <button class="btn btn-sm btn-primary">周</button>
            <button class="btn btn-sm btn-outline">月</button>
          </div>
        </div>
        <div class="panel-body" style="padding: 16px 20px;">
          <div ref="trendChartRef" style="width: 100%; height: 240px;"></div>
        </div>
      </div>

      <!-- Department Distribution -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">科室分布</div>
        </div>
        <div class="panel-body" style="padding: 20px;">
          <div style="display: flex; flex-direction: column; gap: 14px; height: 100%; justify-content: center;">
            <div v-for="dept in depts" :key="dept.name">
              <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 13px; color: #374151;">{{ dept.name }}</span>
                <span style="font-size: 13px; font-weight: 600; color: #3B6BF5;">{{ dept.percent }}%</span>
              </div>
              <div style="height: 8px; background: #F3F4F6; border-radius: 4px; overflow: hidden;">
                <div :style="{ width: dept.percent + '%', background: dept.color }" style="height: 100%; border-radius: 4px;"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Tables Grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <!-- Today's Appointments -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">今日预约</div>
          <button class="btn btn-sm btn-outline" @click="router.push('/appointment')">查看全部</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>患者</th>
              <th>医生</th>
              <th>时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in todayAppointments" :key="app.patient">
              <td>
                <div class="name-cell">
                  <div class="avatar-sm" :style="{ background: app.avatarColor }">{{ app.patient.slice(0, 1) }}</div>
                  {{ app.patient }}
                </div>
              </td>
              <td>{{ app.doctor }}</td>
              <td>{{ app.time }}</td>
              <td>
                <span :class="['status-tag', app.statusTheme]">{{ app.status }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Latest Orders -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">最新订单</div>
          <button class="btn btn-sm btn-outline" @click="router.push('/order')">查看全部</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>商品</th>
              <th>金额</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in latestOrders" :key="order.orderNo">
              <td class="id">{{ order.orderNo }}</td>
              <td>{{ order.product }}</td>
              <td style="font-weight: 600;">{{ order.amount }}</td>
              <td>
                <span :class="['status-tag', order.statusTheme]">{{ order.status }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Mockup Scoped Styles */


/* Button styles matching mockup */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 17px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 150ms ease;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.btn-primary {
  background: #3B6BF5;
  color: #fff;
  border-color: #3B6BF5;
}
.btn-primary:hover {
  background: #2A52D4;
  border-color: #2A52D4;
}
.btn-outline {
  background: #fff;
  color: #4B5563;
  border-color: #E5E7EB;
}
.btn-outline:hover {
  border-color: #BCCFFF;
  color: #3B6BF5;
}
.btn-sm {
  padding: 4px 11px;
  font-size: 12px;
  border-radius: 6px;
}

/* KPI Cards Layout */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.stat-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.stat-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.stat-card-icon.blue { background: #EEF4FF; color: #3B6BF5; }
.stat-card-icon.green { background: #ECFDF5; color: #22C55E; }
.stat-card-icon.gold { background: #FFF9E6; color: #F5A623; }
.stat-card-icon.red { background: #FEF2F2; color: #EF4444; }

.stat-card-trend {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 9999px;
}
.stat-card-trend.up { background: #ECFDF5; color: #16A34A; }
.stat-card-trend.down { background: #FEF2F2; color: #DC2626; }
.stat-card-value {
  font-size: 28px;
  font-weight: 800;
  color: #111827;
  line-height: 1;
}
.stat-card-label {
  font-size: 12px;
  color: #9CA3AF;
  margin-top: 6px;
}

/* Panel cards matching mockup */
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
  padding: 16px 20px;
  border-bottom: 1px solid #F3F4F6;
}
.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.panel-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Table styling matching mockup */
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #F9FAFB;
  border-bottom: 1px solid #F3F4F6;
}
.data-table td {
  padding: 14px 16px;
  font-size: 13px;
  color: #4B5563;
  border-bottom: 1px solid #F9FAFB;
  vertical-align: middle;
}
.data-table tr:hover td {
  background: #F9FAFB;
}
.data-table .id {
  color: #9CA3AF;
  font-size: 12px;
  font-family: monospace;
}
.data-table .name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.data-table .avatar-sm {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}

/* Status tags matching mockup */
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.status-tag.green { background: #ECFDF5; color: #16A34A; }
.status-tag.blue { background: #EEF4FF; color: #3B6BF5; }
.status-tag.gold { background: #FFF9E6; color: #D4930A; }
.status-tag.gray { background: #F3F4F6; color: #6B7280; }
.status-tag.red { background: #FEF2F2; color: #DC2626; }
</style>
