<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'

const status = ref('全部')
const rows = ref<any[]>([])
const applyVisible = ref(false)
const submitting = ref(false)
const form = ref({amount:0,bankName:'',accountName:'',account:''})
async function submitWithdrawal() {
  if (submitting.value) return
  submitting.value = true
  try {
    await request.post('/api/promoter/withdraws', {...form.value,amount:Math.round(Number(form.value.amount)*100)})
    MessagePlugin.success('提现申请已提交，等待运营审核')
    applyVisible.value = false
    form.value = {amount:0,bankName:'',accountName:'',account:''}
    await loadData()
  } catch { MessagePlugin.error('申请未完成，请检查金额和收款信息') }
  finally { submitting.value = false }
}
const statusOptions = [
  { label: '全部状态', value: '全部' },
  { label: '待审核', value: 'pending' },
  { label: '待打款', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
  { label: '已打款', value: 'paid' }
]

const filteredRows = computed(() => {
  return rows.value.filter((item) => status.value === '全部' || item.status === status.value)
})

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function statusLabel(value: string) {
  return statusOptions.find((item) => item.value === value)?.label || value || '待审核'
}

async function loadData() {
  try {
    const res: any = await request.get('/api/promoter/withdraws')
    rows.value = res.data || []
  } catch (_error) {
    MessagePlugin.error('加载提现记录失败')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="page-container">
    <t-dialog v-model:visible="applyVisible" header="申请提现" :confirm-btn="{content:'提交申请',loading:submitting}" @confirm="submitWithdrawal">
      <t-form label-width="90px">
        <t-form-item label="金额（元）"><t-input-number v-model="form.amount" :min="0.01" :decimal-places="2" /></t-form-item>
        <t-form-item label="开户银行"><t-input v-model="form.bankName" :maxlength="100" /></t-form-item>
        <t-form-item label="收款户名"><t-input v-model="form.accountName" :maxlength="100" /></t-form-item>
        <t-form-item label="银行账号"><t-input v-model="form.account" :maxlength="30" /></t-form-item>
      </t-form>
    </t-dialog>
    <div class="page-title-row">
      <div>
        <div class="page-title">我的提现</div>
        <div class="page-title-sub">展示当前推广员本人历史提现记录与处理状态</div>
      </div>
      <t-button @click="applyVisible=true">申请提现</t-button>
    </div>

    <section class="panel">
      <div class="filter-bar">
        <div class="filter-tabs">
          <button
            v-for="item in statusOptions"
            :key="item.value"
            :class="['filter-tab', status === item.value ? 'active' : '']"
            @click="status = item.value"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>申请时间</th>
              <th>提现金额</th>
              <th>手续费</th>
              <th>实付金额</th>
              <th>提现方式</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredRows" :key="item.id">
              <td>{{ formatShanghaiDateTime(item.createdAt, false) }}</td>
              <td>¥{{ yuan(item.amount) }}</td>
              <td>¥{{ yuan(item.fee) }}</td>
              <td style="font-weight:700;color:#1a9d5c;">{{ item.status === 'paid' ? `¥${yuan(item.actualAmount)}` : '未打款' }}</td>
              <td>{{ item.accountInfo?.method === 'bank' ? '银行卡' : item.accountInfo?.method === 'wechat' ? '微信零钱' : '未记录' }}</td>
              <td>{{ statusLabel(item.status) }}</td>
            </tr>
            <tr v-if="filteredRows.length === 0">
              <td colspan="6" class="empty-cell">暂无提现记录</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.page-count {
  font-size: 13px;
  color: #9ca3af;
}

.filter-bar {
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
}

.filter-tabs {
  display: flex;
  gap: 10px;
}

.filter-tab {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #dbe3ef;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-size: 13px;
}

.filter-tab.active {
  background: #eef4ff;
  color: #2a52d4;
  border-color: #3b6bf5;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 36px 0;
}
</style>
