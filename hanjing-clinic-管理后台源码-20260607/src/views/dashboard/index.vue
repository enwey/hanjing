<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import request from '@/utils/request'

const router = useRouter()
const filterTime = ref('month')

// KPI cards ref
const kpiCards = ref([
  { label: '今日预约', value: '0', trend: '↑ 实时', trendType: 'up', icon: '📅', color: 'blue' },
  { label: '今日营收', value: '¥0', trend: '↑ 实时', trendType: 'up', icon: '💰', color: 'green' },
  { label: '今日新增患者', value: '0', trend: '↑ 实时', trendType: 'up', icon: '👥', color: 'gold' },
  { label: '今日到诊率', value: '0%', trend: '↑ 实时', trendType: 'up', icon: '🔄', color: 'red' }
])

const updateTimeStr = ref('2026-06-09 18:00')

// Departments Distribution (keep mock static as it is simple and doesn't affect main operations)
const depts = ref([
  { name: '睡眠呼吸科', percent: 42, color: '#3B6BF5' },
  { name: '耳鼻喉科', percent: 28, color: '#5A85F5' },
  { name: '口腔科', percent: 18, color: '#1A9D5C' },
  { name: '心理科', percent: 12, color: '#F5A623' }
])

// Today Appointments
const todayAppointments = ref<any[]>([])

// Latest Orders
const latestOrders = ref<any[]>([])

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

// Fetch Stats from Real API
const fetchStats = async () => {
  try {
    const res: any = await request.get(`/api/admin/dashboard/stats?range=${filterTime.value}`)
    const { totalRevenue, totalAppointments, totalPatients, visitRate, departments, onlineDoctors, periodLabel, appointmentTrends } = res.data

    kpiCards.value = [
      { label: periodLabel + '预约', value: totalAppointments.toString(), trend: '↑ 实时', trendType: 'up', icon: '📅', color: 'blue' },
      { label: periodLabel + '营收', value: '¥' + (totalRevenue / 100).toFixed(2), trend: '↑ 实时', trendType: 'up', icon: '💰', color: 'green' },
      { label: periodLabel + '新增患者', value: totalPatients.toString(), trend: '↑ 实时', trendType: 'up', icon: '👥', color: 'gold' },
      { label: periodLabel + '到诊率', value: visitRate, trend: '↑ 实时', trendType: 'up', icon: '🔄', color: 'red' }
    ]

    if (departments && departments.length > 0) {
      depts.value = departments
    }

    const now = new Date()
    updateTimeStr.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    if (appointmentTrends && appointmentTrends.length > 0) {
      const xData = appointmentTrends.map((t: any) => t.date.substring(5)) // e.g. "05-29"
      const yData = appointmentTrends.map((t: any) => t.count)
      updateChart(xData, yData)
    }
  } catch (error) {
    console.error('Failed to fetch stats:', error)
  }
}

// Fetch Lists
const fetchDataLists = async () => {
  try {
    // 1. Fetch appointments
    const apptsRes: any = await request.get('/api/admin/appointments?tab=today')
    todayAppointments.value = apptsRes.data.slice(0, 5).map((a: any) => ({
      patient: a.patient_name,
      avatarColor: a.patient_gender === 1 ? '#5A85F5' : '#EC4899',
      doctor: a.doctor_name,
      time: a.appointment_time,
      status: a.status === 'completed' ? '已到诊' : a.status === 'confirmed' ? '候诊中' : a.status === 'pending' ? '待确认' : '已取消',
      statusTheme: a.status === 'completed' ? 'green' : a.status === 'confirmed' ? 'blue' : a.status === 'pending' ? 'gold' : 'gray'
    }))

    // 2. Fetch orders
    const ordersRes: any = await request.get('/api/admin/orders')
    latestOrders.value = ordersRes.data.slice(0, 5).map((o: any) => {
      const prodName = o.items && o.items[0] ? o.items[0].product_name : '健康包/产品'
      return {
        orderNo: '#' + o.order_no.substring(o.order_no.length - 8),
        product: prodName.length > 12 ? prodName.substring(0, 12) + '...' : prodName,
        amount: '¥' + (o.pay_amount / 100).toFixed(2),
        status: o.status === 'completed' ? '已完成' : o.status === 'paid' ? '已支付' : o.status === 'pending' ? '待付款' : '退款中',
        statusTheme: o.status === 'completed' ? 'green' : o.status === 'paid' ? 'blue' : o.status === 'pending' ? 'gold' : 'red'
      }
    })
  } catch (error) {
    console.error('Failed to fetch dashboard lists:', error)
  }
}

watch(filterTime, () => {
  fetchStats()
})

onMounted(() => {
  if (trendChartRef.value) {
    chart = echarts.init(trendChartRef.value)
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
        data: [],
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
          data: [],
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

  // Load real data
  fetchStats()
  fetchDataLists()
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
