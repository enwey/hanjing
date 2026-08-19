<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'

const promoter = ref({
  nickname: '',
  phone: '',
  levelLabel: '',
  inviteCode: ''
})

const overview = ref({
  teamCount: 0,
  teamLevel2Count: 0,
  totalInvites: 0,
  totalOrders: 0,
  totalSales: 0,
  availableCommission: 0,
  totalCommission: 0,
  withdrawnAmount: 0,
  frozenCommission: 0
})

const commissions = ref<any[]>([])

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

async function loadData() {
  try {
    const res: any = await request.get('/api/promoter/dashboard')
    promoter.value = res.data.promoter || promoter.value
    overview.value = res.data.summary || overview.value
    commissions.value = res.data.recentCommissions || []
  } catch (_error) {
    MessagePlugin.error('加载推广概览失败')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="page-container">
    <div class="hero-card">
      <div>
        <div class="hero-title">{{ promoter.nickname || '推广员' }}</div>
        <div class="hero-sub">
          {{ promoter.levelLabel || '推广员' }} · 邀请码 {{ promoter.inviteCode || '—' }} · {{ promoter.phone || '未绑定手机号' }}
        </div>
      </div>
      <div class="hero-income">
        <span>可提现佣金</span>
        <strong>¥{{ yuan(overview.availableCommission) }}</strong>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">一级团队</div>
        <div class="stat-card-value">{{ overview.teamCount }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">二级团队</div>
        <div class="stat-card-value">{{ overview.teamLevel2Count }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">累计订单</div>
        <div class="stat-card-value">{{ overview.totalOrders }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">累计佣金</div>
        <div class="stat-card-value">¥{{ yuan(overview.totalCommission) }}</div>
      </div>
    </div>

    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title">我的推广数据</div>
        </div>
        <div class="summary-grid">
          <div class="summary-item">
            <span>累计邀请人数</span>
            <strong>{{ overview.totalInvites }}</strong>
          </div>
          <div class="summary-item">
            <span>累计销售额</span>
            <strong>¥{{ yuan(overview.totalSales) }}</strong>
          </div>
          <div class="summary-item">
            <span>冻结佣金</span>
            <strong>¥{{ yuan(overview.frozenCommission) }}</strong>
          </div>
          <div class="summary-item">
            <span>累计提现</span>
            <strong>¥{{ yuan(overview.withdrawnAmount) }}</strong>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div class="panel-title">近期佣金动态</div>
        </div>
        <div class="panel-body" style="padding: 0;">
          <table class="data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>患者</th>
                <th>订单号</th>
                <th>订单金额</th>
                <th>佣金</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in commissions.slice(0, 8)" :key="item.id">
                <td>{{ formatShanghaiDateTime(item.created_at, false) }}</td>
                <td>{{ item.patient_name || '—' }}</td>
                <td>{{ item.order_no || '—' }}</td>
                <td>¥{{ yuan(item.order_amount) }}</td>
                <td style="color: #1a9d5c; font-weight: 700;">+¥{{ yuan(item.commission_amount) }}</td>
              </tr>
              <tr v-if="commissions.length === 0">
                <td colspan="5" class="empty-cell">暂无佣金流水</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.hero-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: linear-gradient(135deg, #0f172a, #1d4ed8);
  border-radius: 20px;
  padding: 24px 26px;
  color: #fff;
}

.hero-title {
  font-size: 24px;
  font-weight: 700;
}

.hero-sub {
  margin-top: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);
}

.hero-income {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.hero-income span {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.74);
}

.hero-income strong {
  font-size: 30px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card {
  background: #fff;
  border-radius: 18px;
  padding: 22px;
  border: 1px solid #eef2f7;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
}

.stat-card-label {
  font-size: 13px;
  color: #94a3b8;
}

.stat-card-value {
  font-size: 30px;
  font-weight: 700;
  color: #111827;
  margin-top: 12px;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 20px;
}

.summary-item {
  background: #f8fafc;
  border-radius: 16px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-item span {
  font-size: 13px;
  color: #94a3b8;
}

.summary-item strong {
  font-size: 22px;
  color: #111827;
}

.panel {
  background: #fff;
  border-radius: 18px;
  border: 1px solid #eef2f7;
  overflow: hidden;
}

.panel-header {
  padding: 18px 20px;
  border-bottom: 1px solid #f1f5f9;
}

.panel-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 34px 0;
}
</style>
