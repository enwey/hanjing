<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'

const router = useRouter()
type Range = 'today' | 'week' | 'month'
const savedRange = localStorage.getItem('distribution_filter_time')
const filterTime = ref<Range>(savedRange === 'today' || savedRange === 'week' ? savedRange : 'month')
const periodLabel = computed(() => ({ today: '今日', week: '本周', month: '本月' })[filterTime.value])
const loading = ref(true)
const statsError = ref('')
let statsRequest = 0

type Trend = { current: number; previous: number; percent: number }
type Metric = 'totalCommission' | 'activePromoters' | 'promotedOrders' | 'invitedUsers'
const overview = ref({
  totalCommission: 0,
  activePromoters: 0,
  promotedOrders: 0,
  invitedUsers: 0,
  trends: null as null | (Record<Metric, Trend> & { periodStart: string; periodEnd: string; previousStart: string })
})

function trendText(key: Metric) {
  const t = overview.value.trends?.[key]
  if (loading.value) return '加载中'
  if (!t) return '暂无有效数据'
  const percent = Math.round(t.percent)
  if (percent === 0) return '0%'
  return percent > 0 ? `↑ +${percent}%` : `↓ ${percent}%`
}
function trendClass(key: Metric) {
  const value = overview.value.trends?.[key]?.percent
  return value == null ? 'neutral' : value > 0 ? 'up' : value < 0 ? 'down' : 'neutral'
}
function trendTitle(key: Metric) {
  const t = overview.value.trends?.[key]
  if (!t) return '暂无期间对比数据'
  const labels = { totalCommission: '期间产生的佣金（排除已退款）', promotedOrders: '期间推广订单（按订单去重，排除已退款）', invitedUsers: '期间新增邀请关系', activePromoters: '当前启用且期间新增一级邀请的推广员' }
  const value = (n: number) => key === 'totalCommission' ? `¥${yuan(n)}` : String(n)
  return `${labels[key]}：本期 ${value(t.current)}，上期 ${value(t.previous)}。`
}

const leaderBoard = ref<any[]>([])
const recentCommissions = ref<any[]>([])

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function levelEmoji(level: string) {
  if (level === 'diamond') return 'gem'
  if (level === 'gold') return 'medal-gold'
  if (level === 'silver') return 'medal-silver'
  return 'sprout'
}

function levelLabel(level: string) {
  if (level === 'diamond') return '钻石'
  if (level === 'gold') return '金牌'
  if (level === 'silver') return '银牌'
  return '普通'
}

function formatTime(value: string) {
  if (!value) return '—'
  return formatShanghaiDateTime(value, false).slice(5, 16)
}

async function fetchOverview() {
  const requestId = ++statsRequest
  loading.value = true
  statsError.value = ''
  overview.value.trends = null
  try {
    const res: any = await request.get(`/api/admin/distribution/overview?range=${filterTime.value}`)
    if (requestId !== statsRequest) return
    overview.value = res.data
  } catch {
    if (requestId !== statsRequest) return
    statsError.value = '统计加载失败，请重新选择统计范围后重试'
  } finally {
    if (requestId === statsRequest) loading.value = false
  }
}
function metricValue(key: Metric) {
  if (loading.value || statsError.value) return '--'
  return key === 'totalCommission' ? `¥${yuan(overview.value[key])}` : overview.value[key]
}
async function fetchDistribution() {
  try {
    const [leaderboardRes, commissionRes]: any[] = await Promise.all([
      request.get('/api/admin/distribution/leaderboard'),
      request.get('/api/admin/distribution/commissions')
    ])
    leaderBoard.value = (leaderboardRes.data || []).slice(0, 5).map((row: any, index: number) => ({
      rank: index + 1,
      name: row.nickname || '推广员',
      level: levelLabel(row.level),
      orders: Number(row.total_orders || 0),
      commission: Number(row.total_commission || 0),
      avatarBg: index === 0 ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : 'linear-gradient(135deg, #F59E0B, #D97706)',
      emoji: levelEmoji(row.level)
    }))
    recentCommissions.value = (commissionRes.data || []).map((row: any) => ({
      date: formatTime(row.created_at),
      patient: row.patient_name || '—',
      product: row.product_names || row.order_no || '—',
      amount: Number(row.order_amount || 0),
      commission: Number(row.commission_amount || 0),
      promoter: row.promoter_name || '推广员'
    }))
  } catch (error) {
    MessagePlugin.error('加载分销总览失败')
  }
}

watch(filterTime, value => { localStorage.setItem('distribution_filter_time', value); fetchOverview() })
onMounted(() => { fetchOverview(); fetchDistribution() })
</script>

<template>
  <div>
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">分销总览</div>
        <div class="page-title-sub">管理分销员、佣金及推广数据</div>
      </div>
      <div class="page-actions">
        <div class="page-filter-actions">
          <button v-for="(label, range) in { today: '今日', week: '本周', month: '本月' }" :key="range"
            :class="['btn', filterTime === range ? 'btn-primary' : 'btn-outline']" :aria-pressed="filterTime === range"
            @click="filterTime = range">
            <AppIcon v-if="range === 'today'" name="calendar" />{{ label }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="statsError" role="alert">{{ statsError }}</div>
    <!-- 分销KPI -->
    <div class="stat-grid">
      <div class="stat-card stat-card-gold">
        <div class="stat-card-header">
          <div class="stat-card-icon gold"><AppIcon name="money" /> </div>
          <span class="stat-card-trend" :class="trendClass('totalCommission')" :title="trendTitle('totalCommission')">{{ trendText('totalCommission') }}</span>
        </div>
        <div class="stat-card-value">{{ metricValue('totalCommission') }}</div>
        <div class="stat-card-label">{{ periodLabel }}产生佣金</div>
      </div>
      <div class="stat-card stat-card-blue">
        <div class="stat-card-header">
          <div class="stat-card-icon blue"><AppIcon name="team" /> </div>
          <span class="stat-card-trend" :class="trendClass('activePromoters')" :title="trendTitle('activePromoters')">{{ trendText('activePromoters') }}</span>
        </div>
        <div class="stat-card-value">{{ metricValue('activePromoters') }}</div>
        <div class="stat-card-label">{{ periodLabel }}活跃推广员</div>
      </div>
      <div class="stat-card stat-card-green">
        <div class="stat-card-header">
          <div class="stat-card-icon green"><AppIcon name="box" /> </div>
          <span class="stat-card-trend" :class="trendClass('promotedOrders')" :title="trendTitle('promotedOrders')">{{ trendText('promotedOrders') }}</span>
        </div>
        <div class="stat-card-value">{{ metricValue('promotedOrders') }}</div>
        <div class="stat-card-label">{{ periodLabel }}推广订单</div>
      </div>
      <div class="stat-card stat-card-red">
        <div class="stat-card-header">
          <div class="stat-card-icon red"><AppIcon name="refresh" /> </div>
          <span class="stat-card-trend" :class="trendClass('invitedUsers')" :title="trendTitle('invitedUsers')">{{ trendText('invitedUsers') }}</span>
        </div>
        <div class="stat-card-value">{{ metricValue('invitedUsers') }}</div>
        <div class="stat-card-label">{{ periodLabel }}新增邀请</div>
      </div>
    </div>

    <!-- Leaderboard and Recent commissions side-by-side -->
    <div class="dashboard-grid dashboard-grid-tables">
      <!-- Leaderboard -->
      <div class="panel" style="margin-bottom:0;">
        <div class="panel-header">
          <div class="panel-title">推广员业绩排行榜 (Top 5)</div>
          <button class="btn btn-sm btn-outline" @click="router.push('/promoter')">管理推广员</button>
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 60px;">排名</th>
                <th>推广员</th>
                <th>等级</th>
                <th>推广订单</th>
                <th>累计佣金</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in leaderBoard" :key="row.rank">
                <td style="font-weight: 700; text-align: center; color: #9CA3AF;">
                  <span v-if="row.rank === 1" style="color: #FFD700;"><AppIcon name="medal-gold" /> </span>
                  <span v-else-if="row.rank === 2" style="color: #C0C0C0;"><AppIcon name="medal-silver" /> </span>
                  <span v-else-if="row.rank === 3" style="color: #CD7F32;"><AppIcon name="medal-bronze" /> </span>
                  <span v-else>{{ row.rank }}</span>
                </td>
                <td>
                  <div class="name-cell">
                    <div class="avatar-sm" :style="{ background: row.avatarBg }">
                      {{ row.name.substring(0, 1) }}
                    </div>
                    <span style="font-weight: 600; color: #1F2937;">{{ row.name }}</span>
                  </div>
                </td>
                <td>
                  <span style="font-size:11px;padding:2px 8px;border-radius:12px;background:#F3F4F6;color:#4B5563;font-weight:600;">
                    <AppIcon :name="row.emoji" /> {{ row.level }}
                  </span>
                </td>
                <td style="font-weight:600;">{{ row.orders }}</td>
                <td style="font-weight:700;color:#F5A623;">¥{{ yuan(row.commission) }}</td>
              </tr>
              <tr v-if="!leaderBoard.length"><td colspan="5" class="table-empty">暂无推广员业绩</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Commissions -->
      <div class="panel" style="margin-bottom:0;">
        <div class="panel-header">
          <div class="panel-title">近期分销业绩动态</div>
          <button class="btn btn-sm btn-outline" @click="router.push('/withdraw')">去审批提现</button>
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>推广员</th>
                <th>患者</th>
                <th>商品</th>
                <th>交易额</th>
                <th>产生佣金</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in recentCommissions" :key="idx">
                <td style="font-size:12px;color:#9CA3AF;">{{ row.date }}</td>
                <td style="font-weight:600;color:#1F2937;">{{ row.promoter }}</td>
                <td>{{ row.patient }}</td>
                <td style="font-size:12px;color:#6B7280;">{{ row.product }}</td>
                <td style="font-weight:600;">¥{{ yuan(row.amount) }}</td>
                <td style="font-weight:700;color:#22C55E;">+¥{{ yuan(row.commission) }}</td>
              </tr>
              <tr v-if="!recentCommissions.length"><td colspan="6" class="table-empty">暂无分销业绩动态</td></tr>
            </tbody>
          </table>
        </div>
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
.page-filter-actions {
  display: flex;
  gap: 8px;
}
.dashboard-grid {
  display: grid;
  gap: 20px;
}
.dashboard-grid-charts {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  margin-bottom: 24px;
}
.dashboard-grid-tables {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
.table-scroll {
  width: 100%;
  overflow-x: auto;
}
.table-scroll .data-table {
  min-width: 520px;
}
.data-table td.table-empty {
  height: 96px;
  text-align: center;
  color: #9CA3AF;
  background: #fff;
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

@media (max-width: 1100px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dashboard-grid-charts,
  .dashboard-grid-tables {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .page-title-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
  .page-filter-actions {
    width: 100%;
  }
  .page-filter-actions .btn {
    flex: 1;
    justify-content: center;
    padding-left: 10px;
    padding-right: 10px;
  }
  .stat-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .stat-card {
    padding: 20px;
  }
  .panel-header {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 12px;
  }
}

.page-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.stat-card-header { gap: 8px; flex-wrap: wrap; }
.stat-card-trend { white-space: nowrap; }
.stat-card-icon { flex-shrink: 0; }
@media (max-width: 1100px) {
  .page-title-row { flex-wrap: wrap; gap: 12px; }
}
</style>
