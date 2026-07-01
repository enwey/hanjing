<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import * as echarts from 'echarts'
import { navigateToParent } from '@/utils/routeNavigation'
import request from '@/utils/request'

const route = useRoute()
const router = useRouter()
const storeId = ref(route.params.id as string || '')
const doctorId = computed(() => typeof route.query.doctor_id === 'string' ? route.query.doctor_id : '')
const storeName = ref('门店')
const selectedYear = ref(new Date().getFullYear())
const yearOptions = computed(() => {
  const curr = new Date().getFullYear()
  return [curr - 2, curr - 1, curr, curr + 1]
})
const selectedMonth = ref(`${new Date().getMonth() + 1}月`)
const selectedMonthNumber = computed(() => Number(selectedMonth.value.replace('月', '')) || new Date().getMonth() + 1)
const reportTitle = computed(() => doctorId.value ? `${doctorName.value || '医生'} · 数据报表` : `${storeName.value} · 数据报表`)
const reportSubtitle = computed(() => `${selectedYear.value}年${selectedMonth.value}`)
const monthOptions = Array.from({ length: 12 }, (_, index) => `${index + 1}月`)
const doctorName = ref('')
const appointments = ref<any[]>([])
const doctors = ref<any[]>([])

/* ---- Stats KPIs ---- */
const scopedAppointments = computed(() => {
  const year = selectedYear.value
  return appointments.value.filter(item => {
    const date = String(item.appointment_date || '').slice(0, 10)
    const month = Number(date.slice(5, 7))
    const sameMonth = date.startsWith(String(year)) && month === selectedMonthNumber.value
    const sameDoctor = !doctorId.value || String(item.doctor_id) === String(doctorId.value)
    const sameStore = doctorId.value || !storeId.value ? true : String(item.store_id) === String(storeId.value)
    return sameMonth && sameDoctor && sameStore
  })
})

const completedAppointments = computed(() => scopedAppointments.value.filter(item => ['completed', 'arrived', 'settled'].includes(item.status)))
const reviewDoctors = computed(() => doctorId.value ? doctors.value.filter(d => String(d.id) === String(doctorId.value)) : doctors.value)

const kpis = computed(() => {
  const total = scopedAppointments.value.length
  const completed = completedAppointments.value.length
  const revenue = completedAppointments.value.reduce((sum, item) => sum + Number(item.consult_fee || 0), 0)
  const avgRatingList = reviewDoctors.value.map(d => Number(d.rating || 0)).filter(Boolean)
  const avgRating = avgRatingList.length
    ? (avgRatingList.reduce((sum, val) => sum + val, 0) / avgRatingList.length).toFixed(1)
    : '暂无'
  return [
    { label: '本月预约', value: String(total), icon: 'calendar', color: 'var(--primary-100)', iconColor: 'var(--primary-500)' },
    { label: '本月营收', value: `¥${(revenue / 100).toFixed(2)}`, icon: 'money', color: 'var(--success-100)', iconColor: 'var(--success-500)' },
    { label: '到诊率', value: total > 0 ? `${Math.round((completed / total) * 100)}%` : '暂无', icon: 'team', color: '#FFF9E6', iconColor: '#F5A623' },
    { label: '患者评分', value: avgRating, icon: 'smile', color: 'var(--error-100)', iconColor: 'var(--error-500)' }
  ]
})

/* ---- Doctor Rankings ---- */
const doctorRankings = computed(() => {
  const grouped = new Map<string, any>()
  completedAppointments.value.forEach(item => {
    const key = String(item.doctor_id)
    const current = grouped.get(key) || {
      doctorId: key,
      name: item.doctor_name || '未知医生',
      visits: 0,
      revenueValue: 0,
      rate: '暂无'
    }
    current.visits += 1
    current.revenueValue += Number(item.consult_fee || 0)
    grouped.set(key, current)
  })
  return Array.from(grouped.values())
    .map(row => {
      const doctor = doctors.value.find(d => String(d.id) === String(row.doctorId))
      return {
        ...row,
        revenue: `¥${(row.revenueValue / 100).toFixed(2)}`,
        rate: doctor?.positive_rate !== null && doctor?.positive_rate !== undefined ? `${doctor.positive_rate}%` : row.rate
      }
    })
    .sort((a, b) => b.visits - a.visits)
})

/* ---- Chart Reference ---- */
const revenueTrendChartRef = ref<HTMLDivElement | null>(null)
let trendChart: echarts.ECharts | null = null

function renderTrendChart() {
  if (!revenueTrendChartRef.value) return
  if (!trendChart) trendChart = echarts.init(revenueTrendChartRef.value)
  const year = selectedYear.value
  const monthlyRevenue = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const amount = appointments.value
      .filter(item => {
        const date = String(item.appointment_date || '').slice(0, 10)
        const sameMonth = date.startsWith(String(year)) && Number(date.slice(5, 7)) === month
        const sameDoctor = !doctorId.value || String(item.doctor_id) === String(doctorId.value)
        const sameStore = doctorId.value || !storeId.value ? true : String(item.store_id) === String(storeId.value)
        return sameMonth && sameDoctor && sameStore && ['completed', 'arrived', 'settled'].includes(item.status)
      })
      .reduce((sum, item) => sum + Number(item.consult_fee || 0), 0)
    return Number((amount / 100).toFixed(2))
  })
  trendChart.setOption({
      title: {
        text: '营收趋势',
        left: 'left',
        textStyle: { fontSize: 14, color: '#111827', fontWeight: 600 }
      },
      tooltip: {
        trigger: 'axis',
        formatter: '{b}: ¥{c}'
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
        data: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
        axisLine: { lineStyle: { color: '#E5E7EB' } },
        axisLabel: { color: '#6B7280' }
      },
      yAxis: {
        type: 'value',
        name: '营收 (元)',
        axisLabel: { formatter: '¥{value}' },
        splitLine: { lineStyle: { color: '#F3F4F6' } }
      },
      series: [
        {
          name: '月度营收',
          type: 'bar',
          data: monthlyRevenue,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#3B6BF5' },
              { offset: 1, color: '#8EAFFF' }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          barWidth: '45%'
        }
      ]
    })
}

async function fetchReportData() {
  try {
    const requests: any[] = [
      request.get(`/api/admin/appointments?year=${selectedYear.value}`),
      request.get('/api/admin/doctors')
    ]
    if (storeId.value && !doctorId.value) {
      requests.push(request.get(`/api/admin/stores/${storeId.value}`))
    }
    const [apptRes, doctorRes, storeRes]: any[] = await Promise.all(requests)
    appointments.value = apptRes.data || []
    doctors.value = doctorRes.data || []
    if (storeRes?.data?.name) {
      storeName.value = storeRes.data.name
    }
    if (doctorId.value) {
      const doctor = doctors.value.find(d => String(d.id) === String(doctorId.value))
      doctorName.value = doctor?.name || ''
    }
    renderTrendChart()
  } catch (error) {
    MessagePlugin.error('加载报表数据失败')
  }
}

onMounted(() => {
  fetchReportData()
  window.addEventListener('resize', () => {
    trendChart?.resize()
  })
})

watch([selectedMonth, appointments], () => renderTrendChart())
watch(selectedYear, () => {
  fetchReportData()
})

function handleBack() {
  navigateToParent(router, route, doctorId.value ? '/doctor' : '/store')
}

function handleExport() {
  const rows = [
    ['统计维度', reportTitle.value],
    ['统计月份', reportSubtitle.value],
    ['本月预约', kpis.value[0].value],
    ['本月营收', kpis.value[1].value],
    ['到诊率', kpis.value[2].value],
    ['患者评分', kpis.value[3].value],
    [],
    ['医生', '接诊数', '总营收', '好评率'],
    ...doctorRankings.value.map(row => [row.name, row.visits, row.revenue, row.rate])
  ]
  const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${reportTitle.value}-${selectedMonth.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
  MessagePlugin.success('报表已导出')
}
</script>

<template>
  <div class="page-container">


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">{{ reportTitle }}</div>
        <div class="page-title-sub">{{ reportSubtitle }}</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" style="margin-right: 8px;" @click="handleExport"><AppIcon name="download" />  导出报表</button>
        <select class="form-control" style="width: 100px; margin-right: 8px;" v-model="selectedYear">
          <option v-for="yr in yearOptions" :key="yr" :value="yr">{{ yr }}年</option>
        </select>
        <select class="form-control" style="width: 80px;" v-model="selectedMonth">
          <option v-for="month in monthOptions" :key="month">{{ month }}</option>
        </select>
      </div>
    </div>

    <!-- KPI mini-stats cards -->
    <div class="card-grid-4">
      <div class="mini-stat" v-for="(kpi, index) in kpis" :key="index">
        <div class="mini-stat-icon" :style="{ background: kpi.color, color: kpi.iconColor }">
          <AppIcon :name="kpi.icon" size="22" />
        </div>
        <div>
          <div class="mini-stat-value">{{ kpi.value }}</div>
          <div class="mini-stat-label">{{ kpi.label }}</div>
        </div>
      </div>
    </div>

    <!-- Double panels layout -->
    <div class="card-grid-2" style="margin-top: 16px;">
      <!-- Revenue Trend Chart -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header"><div class="panel-title">营收趋势</div></div>
        <div class="panel-body">
          <div ref="revenueTrendChartRef" style="width: 100%; height: 260px;"></div>
        </div>
      </div>

      <!-- Doctor Rankings Table -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header"><div class="panel-title">医生接诊排名</div></div>
        <table class="data-table">
          <thead>
            <tr>
              <th>医生</th>
              <th>接诊数 (人次)</th>
              <th>总营收</th>
              <th>好评率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(dr, idx) in doctorRankings" :key="idx">
              <td style="font-weight: 600; color: #1F2937;">{{ dr.name }}</td>
              <td>{{ dr.visits }}</td>
              <td style="font-weight: 600; color: var(--primary-500);">{{ dr.revenue }}</td>
              <td>{{ dr.rate }}</td>
            </tr>
            <tr v-if="doctorRankings.length === 0">
              <td colspan="4" style="text-align: center; color: #9CA3AF;">暂无已完成接诊数据</td>
            </tr>
          </tbody>
        </table>
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
.btn-outline {
  background: #fff;
  color: #374151;
  border: 1px solid #E5E7EB;
}
.btn-outline:hover {
  border-color: #BCCFFF;
  color: var(--primary-500);
}

/* Grids */
.card-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
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

/* Form Styles */
.form-control {
  padding: 6px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 13px;
  color: #1F2937;
  outline: none;
}
select.form-control {
  appearance: auto;
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
</style>
