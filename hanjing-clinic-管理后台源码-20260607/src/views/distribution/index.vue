<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()

function handleExport() {
  MessagePlugin.success('导出报表成功！')
}

const overview = ref({
  totalCommission: 0,
  activePromoters: 0,
  promotedOrders: 0,
  invitedUsers: 0
})

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
  return value.replace('T', ' ').slice(5, 16)
}

async function fetchDistribution() {
  try {
    const [overviewRes, leaderboardRes, commissionRes]: any[] = await Promise.all([
      request.get('/api/admin/distribution/overview'),
      request.get('/api/admin/distribution/leaderboard'),
      request.get('/api/admin/distribution/commissions')
    ])
    overview.value = overviewRes.data || overview.value
    leaderBoard.value = (leaderboardRes.data || []).map((row: any, index: number) => ({
      rank: index + 1,
      name: row.nickname || '推广员',
      level: levelLabel(row.level),
      orders: Number(row.invites || 0),
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

onMounted(fetchDistribution)
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">分销总览</div>
        <div class="page-title-sub">管理分销员、佣金及推广数据</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-outline" @click="handleExport"><AppIcon name="download" />  导出报表</button>
        <button class="btn btn-primary" @click="router.push('/settings')"><AppIcon name="settings" />  分销设置</button>
      </div>
    </div>

    <!-- 分销KPI -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon gold"><AppIcon name="money" /> </div>
          <div class="stat-card-trend up">↑ 32%</div>
        </div>
        <div class="stat-card-value" style="color:#F5A623;">¥{{ yuan(overview.totalCommission) }}</div>
        <div class="stat-card-label">累计佣金支出</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon blue"><AppIcon name="team" /> </div>
          <div class="stat-card-trend up">↑ 15%</div>
        </div>
        <div class="stat-card-value">{{ overview.activePromoters }}</div>
        <div class="stat-card-label">活跃推广员</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon green"><AppIcon name="box" /> </div>
          <div class="stat-card-trend up">↑ 28%</div>
        </div>
        <div class="stat-card-value">{{ overview.promotedOrders }}</div>
        <div class="stat-card-label">推广订单</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon red"><AppIcon name="refresh" /> </div>
          <div class="stat-card-trend up">↑ 5%</div>
        </div>
        <div class="stat-card-value">{{ overview.invitedUsers }}</div>
        <div class="stat-card-label">累计邀请用户</div>
      </div>
    </div>

    <!-- Leaderboard and Recent commissions side-by-side -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <!-- Leaderboard -->
      <div class="panel" style="margin-bottom:0;">
        <div class="panel-header">
          <div class="panel-title"><AppIcon name="trophy" />  推广员业绩排行榜 (Top 5)</div>
          <button class="btn btn-sm btn-outline" @click="router.push('/promoter')">管理推广员</button>
        </div>
        <div class="panel-body" style="padding: 0;">
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
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Commissions -->
      <div class="panel" style="margin-bottom:0;">
        <div class="panel-header">
          <div class="panel-title"><AppIcon name="bolt" />  近期分销业绩动态</div>
          <button class="btn btn-sm btn-outline" @click="router.push('/withdraw')">去审批提现</button>
        </div>
        <div class="panel-body" style="padding: 0;">
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  padding: 16px 20px;
  border-bottom: 1px solid #F3F4F6;
  background: #fff;
}
.panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #1F2937;
}

/* Button styles matching mockup global CSS rules */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 150ms ease;
  font-family: inherit;
}
.btn-primary {
  background: #3B6BF5;
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
  color: #3B6BF5;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
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
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.stat-card-icon.gold { background: #FFFBEB; }
.stat-card-icon.blue { background: #EEF4FF; }
.stat-card-icon.green { background: #ECFDF5; }
.stat-card-icon.red { background: #FEF2F2; }
.stat-card-trend {
  font-size: 12px;
  font-weight: 600;
}
.stat-card-trend.up { color: #16A34A; }

.stat-card-value {
  font-size: 26px;
  font-weight: 800;
  color: #1F2937;
}
.stat-card-label {
  font-size: 12px;
  color: #9CA3AF;
  margin-top: 4px;
}

/* Table styles matching mockup */
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
  color: #374151;
  border-bottom: 1px solid #F9FAFB;
  vertical-align: middle;
}
.data-table tr:hover td {
  background-color: #F9FAFB;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.avatar-sm {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  color: #fff;
  flex-shrink: 0;
}
</style>
