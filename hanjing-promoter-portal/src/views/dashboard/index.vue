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
  frozenCommission: 0,
  pendingWithdrawAmount: 0,
  reconciliationRequired: false
})

const commissions = ref<any[]>([])
const loading = ref(true)
const loadError = ref(false)
const qrImage = ref('')
const qrLoading = ref(false)
const qrError = ref('')

async function loadQr() {
  if (qrLoading.value) return
  qrLoading.value = true
  qrError.value = ''
  try {
    const res:any = await request.get('/api/promoter/qr')
    if (!res.data?.image) throw new Error('Missing QR image')
    qrImage.value = res.data.image
  } catch {
    qrImage.value = ''
    qrError.value = '小程序码暂时无法获取'
  }
  finally { qrLoading.value = false }
}

function downloadQr() {
  if (!qrImage.value) return
  const link = document.createElement('a')
  link.href = qrImage.value
  link.download = `${promoter.value.nickname || '推广员'}-预约推广小程序码.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  MessagePlugin.success('小程序码已下载')
}

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

async function loadData() {
  loading.value = true
  loadError.value = false
  try {
    const res: any = await request.get('/api/promoter/dashboard')
    if (!res.data?.promoter || !res.data?.summary) throw new Error('Incomplete dashboard response')
    promoter.value = res.data.promoter
    overview.value = res.data.summary
    commissions.value = res.data.recentCommissions || []
  } catch (_error) {
    loadError.value = true
    MessagePlugin.error('加载推广概览失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
  loadQr()
})
</script>

<template>
  <div class="page-container">
    <t-loading v-if="loading" text="加载中" />
    <t-alert v-else-if="loadError" theme="error" message="推广数据加载失败，当前无法确认余额，请稍后重试。" />
    <template v-else>
    <t-alert v-if="overview.reconciliationRequired" theme="warning" message="佣金账务待核对，提现暂不可用，请联系运营人员。" />
    <div class="hero-card">
      <div class="hero-profile">
        <div class="hero-title">{{ promoter.nickname || '推广员' }}</div>
        <div class="hero-sub">
          {{ promoter.levelLabel || '推广员' }} · 邀请码 {{ promoter.inviteCode || '—' }} · {{ promoter.phone || '未绑定手机号' }}
        </div>
      </div>
      <div class="hero-qr" aria-label="预约推广小程序码">
        <div class="qr-preview">
          <img v-if="qrImage" :src="qrImage" alt="预约推广小程序码" />
          <t-loading v-else-if="qrLoading" size="small" text="获取中" />
          <div v-else class="qr-error">
            <span>{{ qrError || '暂无小程序码' }}</span>
            <button type="button" @click="loadQr">重新获取</button>
          </div>
        </div>
        <div class="qr-actions">
          <strong>预约推广小程序码</strong>
          <span>患者扫码后进入预约流程</span>
          <t-button size="small" variant="outline" :disabled="!qrImage" @click="downloadQr">下载小程序码</t-button>
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
          <div class="summary-item">
            <span>提现处理中</span>
            <strong>¥{{ yuan(overview.pendingWithdrawAmount) }}</strong>
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
    </template>
  </div>
</template>

<style scoped>
.hero-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: linear-gradient(135deg, #0f172a, #1d4ed8);
  border-radius: 12px;
  padding: 20px;
  color: #fff;
}

.hero-title {
  font-size: 20px;
  font-weight: 700;
}

.hero-profile {
  min-width: 0;
  flex: 1;
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

.hero-qr {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px 10px 10px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
}

.qr-preview {
  width: 104px;
  height: 104px;
  flex: 0 0 104px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
}

.qr-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  color: #64748b;
  text-align: center;
  font-size: 12px;
}

.qr-error button {
  border: 0;
  padding: 0;
  color: #2563eb;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
}

.qr-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.qr-actions strong {
  font-size: 14px;
}

.qr-actions span {
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
  white-space: nowrap;
}

.qr-actions :deep(.t-button--variant-outline) {
  border-color: rgba(255, 255, 255, 0.72);
  color: #fff;
}

.hero-income span {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.74);
}

.hero-income strong {
  font-size: 26px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.stat-card-label {
  font-size: 13px;
  color: #94a3b8;
}

.stat-card-value {
  font-size: 28px;
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
  border-radius: 8px;
  padding: 16px;
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
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.panel-header {
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 34px 0;
}

@media (max-width: 960px) {
  .hero-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .hero-profile {
    flex-basis: calc(100% - 150px);
  }

  .hero-qr {
    order: 3;
    width: 100%;
    box-sizing: border-box;
  }
}

@media (max-width: 560px) {
  .hero-profile {
    flex-basis: 100%;
  }

  .hero-income {
    align-items: flex-start;
  }

  .hero-qr {
    align-items: flex-start;
  }

  .qr-preview {
    width: 88px;
    height: 88px;
    flex-basis: 88px;
  }

  .qr-actions span {
    white-space: normal;
  }
}
</style>
