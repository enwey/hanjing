<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import request from '@/utils/request'

const router = useRouter()
const filterTime = ref(localStorage.getItem('dashboard_filter_time') || 'month')
const chartFilterTime = ref(localStorage.getItem('dashboard_chart_filter_time') || 'month')
const activeTrendType = ref<'appointment' | 'revenue'>((localStorage.getItem('dashboard_active_trend_type') as any) || 'appointment')

// KPI cards ref
const kpiCards = ref([
  { label: '今日预约', value: '0', trend: '↑ 实时', trendType: 'up', icon: 'calendar', color: 'blue' },
  { label: '今日营收', value: '¥0', trend: '↑ 实时', trendType: 'up', icon: 'dollar-sign', color: 'green' },
  { label: '今日新增患者', value: '0', trend: '↑ 实时', trendType: 'up', icon: 'users', color: 'gold' },
  { label: '今日到诊率', value: '0%', trend: '↑ 实时', trendType: 'up', icon: 'activity', color: 'red' }
])

const updateTimeStr = ref('2026-06-09 18:00')

const depts = ref<any[]>([])

// Today Appointments
const todayAppointments = ref<any[]>([])

// Latest Orders
const latestOrders = ref<any[]>([])

const trendChartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

const updateChart = (xData: string[], yData: number[]) => {
  if (chart) {
    const isAppt = activeTrendType.value === 'appointment'
    chart.setOption({
      tooltip: {
        trigger: 'axis',
        formatter: isAppt ? '{b}: {c}个预约' : '{b}: ¥{c}'
      },
      yAxis: {
        name: isAppt ? '预约数 (个)' : '营收 (元)'
      },
      xAxis: {
        data: xData
      },
      series: [
        {
          name: isAppt ? '预约数' : '营业额 (元)',
          data: yData,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: isAppt ? '#3B6BF5' : '#10B981' },
              { offset: 1, color: isAppt ? '#8EAFFF' : '#D1FAE5' }
            ])
          }
        }
      ]
    })
  }
}

const normalizeDate = (rawDate: any) => {
  if (!rawDate) return '';
  if (typeof rawDate === 'string') {
    if (rawDate.includes('T')) {
      return rawDate.split('T')[0];
    }
    return rawDate.substring(0, 10);
  }
  try {
    const d = new Date(rawDate);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  } catch (e) {
    return '';
  }
};

// Fetch Stats from Real API (KPIs, departments, etc.)
const fetchDashboardStats = async () => {
  try {
    const res: any = await request.get(`/api/admin/dashboard/stats?range=${filterTime.value}`)
    const { totalRevenue, totalAppointments, totalPatients, visitRate, trends, departments, periodLabel } = res.data

    kpiCards.value = [
      { 
        label: periodLabel + '预约', 
        value: totalAppointments.toString(), 
        trend: (trends?.appointments?.trendType === 'up' ? '↑ ' : '↓ ') + (trends?.appointments?.trend || '0%'), 
        trendType: trends?.appointments?.trendType || 'up', 
        icon: 'calendar', 
        color: 'blue' 
      },
      { 
        label: periodLabel + '营收', 
        value: '¥' + (totalRevenue / 100).toFixed(2), 
        trend: (trends?.revenue?.trendType === 'up' ? '↑ ' : '↓ ') + (trends?.revenue?.trend || '0%'), 
        trendType: trends?.revenue?.trendType || 'up', 
        icon: 'dollar-sign', 
        color: 'green' 
      },
      { 
        label: periodLabel + '新增患者', 
        value: totalPatients.toString(), 
        trend: (trends?.patients?.trendType === 'up' ? '↑ ' : '↓ ') + (trends?.patients?.trend || '0%'), 
        trendType: trends?.patients?.trendType || 'up', 
        icon: 'users', 
        color: 'gold' 
      },
      { 
        label: periodLabel + '到诊率', 
        value: visitRate, 
        trend: (trends?.visitRate?.trendType === 'up' ? '↑ ' : '↓ ') + (trends?.visitRate?.trend || '0%'), 
        trendType: trends?.visitRate?.trendType || 'up', 
        icon: 'activity', 
        color: 'red' 
      }
    ]

    if (departments && departments.length > 0) {
      depts.value = departments
    }

    const now = new Date()
    updateTimeStr.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error)
  }
}

// Fetch Trend Chart Data specifically based on chartFilterTime
const fetchTrendChartData = async () => {
  try {
    const res: any = await request.get(`/api/admin/dashboard/stats?range=${chartFilterTime.value}`)
    const { appointmentTrends, revenueTrends } = res.data

    const isAppt = activeTrendType.value === 'appointment'
    const sourceData = isAppt ? (appointmentTrends || []) : (revenueTrends || [])

    // Format Trend Chart Axis and pad missing data
    let xData: string[] = []
    let yData: number[] = []

    if (chartFilterTime.value === 'today') {
      // Standard business hours: 08:00 to 20:00
      const standardHours = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']
      const hourMap = new Map<string, number>()
      standardHours.forEach(h => hourMap.set(h, 0))

      if (sourceData.length > 0) {
        sourceData.forEach((t: any) => {
          if (t.date) {
            const match = String(t.date).match(/^(\d+)/)
            if (match) {
              const hStr = match[1].padStart(2, '0')
              if (hourMap.has(hStr)) {
                const val = isAppt ? (t.count || 0) : Number(((t.total || 0) / 100).toFixed(2))
                hourMap.set(hStr, hourMap.get(hStr)! + val)
              }
            }
          }
        })
      }
      xData = standardHours.map(h => `${h}点`)
      yData = standardHours.map(h => Number(hourMap.get(h)!.toFixed(2)))

    } else if (chartFilterTime.value === 'week') {
      // Monday to Sunday of the current week
      const getWeekDates = () => {
        const current = new Date()
        const day = current.getDay()
        const distanceToMonday = day === 0 ? -6 : 1 - day
        const monday = new Date()
        monday.setDate(current.getDate() + distanceToMonday)
        
        const dates = []
        for (let i = 0; i < 7; i++) {
          const date = new Date(monday)
          date.setDate(monday.getDate() + i)
          const yyyy = date.getFullYear()
          const mm = String(date.getMonth() + 1).padStart(2, '0')
          const dd = String(date.getDate()).padStart(2, '0')
          dates.push(`${yyyy}-${mm}-${dd}`)
        }
        return dates
      }

      const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      const weekDates = getWeekDates()
      const weekMap = new Map<string, number>()
      weekDates.forEach(d => weekMap.set(d, 0))

      if (sourceData.length > 0) {
        sourceData.forEach((t: any) => {
          const norm = normalizeDate(t.date)
          if (norm && weekMap.has(norm)) {
            const val = isAppt ? (t.count || 0) : Number(((t.total || 0) / 100).toFixed(2))
            weekMap.set(norm, val)
          }
        })
      }
      xData = weekDates.map((d, idx) => weekDays[idx])
      yData = weekDates.map(d => Number(weekMap.get(d)!.toFixed(2)))

    } else { // month
      // All days of the current month
      const getMonthDates = () => {
        const current = new Date()
        const year = current.getFullYear()
        const month = current.getMonth()
        const lastDayObj = new Date(year, month + 1, 0)
        const lastDay = lastDayObj.getDate()
        
        const dates = []
        for (let i = 1; i <= lastDay; i++) {
          const mm = String(month + 1).padStart(2, '0')
          const dd = String(i).padStart(2, '0')
          dates.push({
            fullDate: `${year}-${mm}-${dd}`,
            label: `${i}号`
          })
        }
        return dates
      }

      const monthDates = getMonthDates()
      const monthMap = new Map<string, number>()
      monthDates.forEach(item => monthMap.set(item.fullDate, 0))

      if (sourceData.length > 0) {
        sourceData.forEach((t: any) => {
          const norm = normalizeDate(t.date)
          if (norm && monthMap.has(norm)) {
            const val = isAppt ? (t.count || 0) : Number(((t.total || 0) / 100).toFixed(2))
            monthMap.set(norm, val)
          }
        })
      }
      xData = monthDates.map(item => item.label)
      yData = monthDates.map(item => Number(monthMap.get(item.fullDate)!.toFixed(2)))
    }

    updateChart(xData, yData)
  } catch (error) {
    console.error('Failed to fetch trend chart data:', error)
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
      status: a.status === 'arrived' ? '已完成' : a.status === 'completed' ? '待结算' : a.status === 'checked_in' ? '就诊中' : a.status === 'confirmed' ? '候诊中' : a.status === 'pending' ? '已预约' : '已取消',
      statusTheme: a.status === 'arrived' ? 'green' : a.status === 'completed' ? 'danger' : a.status === 'checked_in' ? 'orange' : a.status === 'confirmed' ? 'blue' : a.status === 'pending' ? 'green' : 'gray'
    }))

    // 2. Fetch orders
    const ordersRes: any = await request.get('/api/admin/orders')
    latestOrders.value = ordersRes.data.slice(0, 5).map((o: any) => {
      const prodName = o.items && o.items[0] ? o.items[0].product_name : '订单商品'
      const productDesc = o.items && o.items.length > 1 ? `${prodName} 等${o.items.length}件` : prodName
      return {
        orderNo: '#' + o.order_no.substring(o.order_no.length - 8),
        product: productDesc,
        amount: '¥' + (o.pay_amount / 100).toFixed(2),
        status: o.status === 'completed' ? '已完成' : o.status === 'paid' ? '已支付' : o.status === 'pending' ? '待付款' : '退款中',
        statusTheme: o.status === 'completed' ? 'green' : o.status === 'paid' ? 'blue' : o.status === 'pending' ? 'gold' : 'red'
      }
    })
  } catch (error) {
    console.error('Failed to fetch dashboard lists:', error)
  }
}

watch(filterTime, (newVal) => {
  localStorage.setItem('dashboard_filter_time', newVal)
  chartFilterTime.value = newVal
  fetchDashboardStats()
})

watch([chartFilterTime, activeTrendType], ([newChartTime, newTrendType]) => {
  localStorage.setItem('dashboard_chart_filter_time', newChartTime)
  localStorage.setItem('dashboard_active_trend_type', newTrendType)
  fetchTrendChartData()
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
  fetchDashboardStats()
  fetchTrendChartData()
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
        <button :class="['btn', filterTime === 'today' ? 'btn-primary' : 'btn-outline']" @click="filterTime = 'today'">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px; margin-right: 4px;">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          今日
        </button>
        <button :class="['btn', filterTime === 'week' ? 'btn-primary' : 'btn-outline']" @click="filterTime = 'week'">本周</button>
        <button :class="['btn', filterTime === 'month' ? 'btn-primary' : 'btn-outline']" @click="filterTime = 'month'">本月</button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="stat-grid">
      <div v-for="kpi in kpiCards" :key="kpi.label" :class="['stat-card', 'stat-card-' + kpi.color]">
        <div class="stat-card-header">
          <div :class="['stat-card-icon', kpi.color]">
            <svg v-if="kpi.icon === 'calendar'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <svg v-else-if="kpi.icon === 'dollar-sign'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
            <svg v-else-if="kpi.icon === 'users'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <svg v-else-if="kpi.icon === 'activity'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            <span v-else>{{ kpi.icon }}</span>
          </div>
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
          <div class="panel-title" style="display: flex; gap: 16px; align-items: center; user-select: none;">
            <span 
              :style="{ cursor: 'pointer', fontWeight: activeTrendType === 'appointment' ? '700' : '500', color: activeTrendType === 'appointment' ? '#3B6BF5' : '#4B5563', borderBottom: activeTrendType === 'appointment' ? '2px solid #3B6BF5' : '2px solid transparent', paddingBottom: '4px', transition: 'all 150ms' }"
              @click="activeTrendType = 'appointment'"
            >
              预约趋势
            </span>
            <span 
              :style="{ cursor: 'pointer', fontWeight: activeTrendType === 'revenue' ? '700' : '500', color: activeTrendType === 'revenue' ? '#3B6BF5' : '#4B5563', borderBottom: activeTrendType === 'revenue' ? '2px solid #3B6BF5' : '2px solid transparent', paddingBottom: '4px', transition: 'all 150ms' }"
              @click="activeTrendType = 'revenue'"
            >
              营收趋势
            </span>
          </div>
          <div class="panel-actions">
            <button :class="['btn', 'btn-sm', chartFilterTime === 'today' ? 'btn-primary' : 'btn-outline']" @click="chartFilterTime = 'today'">日</button>
            <button :class="['btn', 'btn-sm', chartFilterTime === 'week' ? 'btn-primary' : 'btn-outline']" @click="chartFilterTime = 'week'">周</button>
            <button :class="['btn', 'btn-sm', chartFilterTime === 'month' ? 'btn-primary' : 'btn-outline']" @click="chartFilterTime = 'month'">月</button>
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
          <div v-if="depts.length > 0" style="display: flex; flex-direction: column; gap: 14px; height: 100%; justify-content: center;">
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
          <div v-else style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 160px; color: #9CA3AF; font-size: 13px;">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px; opacity: 0.6;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>暂无科室预约数据</span>
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
  border-radius: 16px;
  padding: 24px;
  border: 1px solid transparent;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  position: relative;
  overflow: hidden;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  display: flex;
  flex-direction: column;
}
/* Concentric Orbit 1 (Outer Dashed Circle) */
.stat-card::before {
  content: '';
  position: absolute;
  width: 200px;
  height: 200px;
  border: 1px dashed rgba(255, 255, 255, 0.07);
  border-radius: 50%;
  top: -50px;
  right: -50px;
  pointer-events: none;
  z-index: 1;
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
/* Concentric Orbit 2 (Inner Solid Circle) */
.stat-card::after {
  content: '';
  position: absolute;
  width: 120px;
  height: 120px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 50%;
  top: -10px;
  right: -10px;
  pointer-events: none;
  z-index: 1;
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}
.stat-card:hover {
  transform: translateY(-6px);
}
.stat-card:hover::before {
  transform: scale(1.15) rotate(45deg);
  border-color: rgba(255, 255, 255, 0.15);
}
.stat-card:hover::after {
  transform: scale(1.25);
  border-color: rgba(255, 255, 255, 0.1);
}
.stat-card-blue {
  background: 
    radial-gradient(circle at 100% 100%, rgba(255, 255, 255, 0.22) 0%, transparent 60%),
    radial-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px),
    linear-gradient(135deg, #3B6BF5 0%, #1D4ED8 100%);
  background-size: 100% 100%, 14px 14px, 100% 100%;
  color: #ffffff;
}
.stat-card-blue:hover {
  box-shadow: 0 20px 25px -5px rgba(29, 78, 216, 0.3), 0 10px 10px -6px rgba(29, 78, 216, 0.2);
}
.stat-card-green {
  background: 
    radial-gradient(circle at 100% 100%, rgba(255, 255, 255, 0.22) 0%, transparent 60%),
    radial-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px),
    linear-gradient(135deg, #10B981 0%, #059669 100%);
  background-size: 100% 100%, 14px 14px, 100% 100%;
  color: #ffffff;
}
.stat-card-green:hover {
  box-shadow: 0 20px 25px -5px rgba(5, 150, 105, 0.3), 0 10px 10px -6px rgba(5, 150, 105, 0.2);
}
.stat-card-gold {
  background: 
    radial-gradient(circle at 100% 100%, rgba(255, 255, 255, 0.22) 0%, transparent 60%),
    radial-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px),
    linear-gradient(135deg, #F5A623 0%, #D97706 100%);
  background-size: 100% 100%, 14px 14px, 100% 100%;
  color: #ffffff;
}
.stat-card-gold:hover {
  box-shadow: 0 20px 25px -5px rgba(217, 119, 6, 0.3), 0 10px 10px -6px rgba(217, 119, 6, 0.2);
}
.stat-card-red {
  background: 
    radial-gradient(circle at 100% 100%, rgba(255, 255, 255, 0.22) 0%, transparent 60%),
    radial-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px),
    linear-gradient(135deg, #EF4444 0%, #B91C1C 100%);
  background-size: 100% 100%, 14px 14px, 100% 100%;
  color: #ffffff;
}
.stat-card-red:hover {
  box-shadow: 0 20px 25px -5px rgba(185, 28, 28, 0.3), 0 10px 10px -6px rgba(185, 28, 28, 0.2);
}

.stat-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  position: relative;
  z-index: 2;
}
.stat-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  background: rgba(255, 255, 255, 0.15) !important;
  color: #ffffff !important;
  border: 1px solid rgba(255, 255, 255, 0.25) !important;
  box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.1);
}
.stat-card:hover .stat-card-icon {
  transform: scale(1.1) rotate(4deg);
  background: rgba(255, 255, 255, 0.25) !important;
  border-color: rgba(255, 255, 255, 0.4) !important;
}

.stat-card-trend {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 20px;
  letter-spacing: 0.02em;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  background: rgba(255, 255, 255, 0.18) !important;
  color: #ffffff !important;
  border: 1px solid rgba(255, 255, 255, 0.25) !important;
}
.stat-card-value {
  font-size: 32px;
  font-weight: 800;
  color: #ffffff !important;
  line-height: 1;
  letter-spacing: -0.04em;
  margin-bottom: 4px;
  position: relative;
  z-index: 2;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
.stat-card-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8) !important;
  font-weight: 500;
  letter-spacing: 0.01em;
  position: relative;
  z-index: 2;
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
