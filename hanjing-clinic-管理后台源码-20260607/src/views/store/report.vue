<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import * as echarts from 'echarts'

const route = useRoute()
const router = useRouter()
const storeId = ref(route.params.id as string || '1')
const storeName = ref('龙岗总店')
const selectedMonth = ref('5月')

/* ---- Stats KPIs ---- */
const kpis = ref([
  { label: '本月预约', value: '156', icon: '📅', color: 'var(--primary-100)', iconColor: 'var(--primary-500)' },
  { label: '本月营收', value: '¥22.8w', icon: '💰', color: 'var(--success-100)', iconColor: 'var(--success-500)' },
  { label: '到诊率', value: '92.3%', icon: '👥', color: '#FFF9E6', iconColor: '#F5A623' },
  { label: '患者评分', value: '4.9', icon: '⭐', color: 'var(--error-100)', iconColor: 'var(--error-500)' }
])

/* ---- Doctor Rankings ---- */
const doctorRankings = ref([
  { name: '古堪民', visits: 68, revenue: '¥12.4w', rate: '98%' },
  { name: '王志远', visits: 52, revenue: '¥7.2w', rate: '96%' },
  { name: '刘婉清', visits: 36, revenue: '¥3.2w', rate: '99%' }
])

/* ---- Chart Reference ---- */
const revenueTrendChartRef = ref<HTMLDivElement | null>(null)

onMounted(() => {
  if (revenueTrendChartRef.value) {
    const trendChart = echarts.init(revenueTrendChartRef.value)
    trendChart.setOption({
      title: {
        text: '营收趋势 (1月 - 12月)',
        left: 'left',
        textStyle: { fontSize: 14, color: '#111827', fontWeight: 600 }
      },
      tooltip: {
        trigger: 'axis',
        formatter: '{b}: {c} 万元'
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
        name: '营收 (万元)',
        axisLabel: { formatter: '{value}w' },
        splitLine: { lineStyle: { color: '#F3F4F6' } }
      },
      series: [
        {
          name: '月度营收',
          type: 'bar',
          data: [10.2, 12.5, 14.8, 16.2, 22.8, 19.5, 20.4, 25.1, 21.0, 23.5, 18.9, 21.6],
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
    
    window.addEventListener('resize', () => {
      trendChart.resize()
    })
  }
})

function handleBack() {
  router.push('/store')
}

function handleExport() {
  MessagePlugin.success('报表数据已成功生成并开始下载。')
}
</script>

<template>
  <div class="page-container">


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">{{ storeName }} · 数据报表</div>
        <div class="page-title-sub">2026年{{ selectedMonth }}</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" @click="handleExport">📥 导出报表</button>
        <select class="form-control" style="width: 120px;" v-model="selectedMonth">
          <option>5月</option>
          <option>4月</option>
          <option>3月</option>
        </select>
      </div>
    </div>

    <!-- KPI mini-stats cards -->
    <div class="card-grid-4">
      <div class="mini-stat" v-for="(kpi, index) in kpis" :key="index">
        <div class="mini-stat-icon" :style="{ background: kpi.color, color: kpi.iconColor }">
          {{ kpi.icon }}
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
