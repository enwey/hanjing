<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'

const keyword = ref('')
const status = ref('全部')
const rows = ref<any[]>([])
const statusOptions = [
  { label: '全部状态', value: '全部' },
  { label: '待结算', value: 'pending' },
  { label: '已结算', value: 'settled' },
  { label: '已退款', value: 'refunded' }
]

const filteredRows = computed(() => {
  return rows.value.filter((item) => {
    const statusMatch = status.value === '全部' || item.status === status.value
    const keywordMatch = !keyword.value || [
      item.promoter_name,
      item.patient_name,
      item.order_no,
      item.product_names
    ].some((field) => String(field || '').includes(keyword.value))
    return statusMatch && keywordMatch
  })
})

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function statusLabel(value: string) {
  return statusOptions.find((item) => item.value === value)?.label || value || '待结算'
}

async function loadData() {
  try {
    const res: any = await request.get('/api/promoter/commissions')
    rows.value = res.data || []
  } catch (_error) {
    MessagePlugin.error('加载佣金明细失败')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">我的佣金</div>
        <div class="page-title-sub">展示当前推广员本人产生的全部佣金流水</div>
      </div>
      <div class="page-count">共 {{ filteredRows.length }} 条</div>
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
        <input v-model="keyword" class="filter-input" placeholder="搜索患者 / 订单号 / 商品" />
      </div>
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>时间</th>
              <th>患者</th>
              <th>订单号</th>
              <th>商品</th>
              <th>订单金额</th>
              <th>佣金金额</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredRows" :key="item.id">
              <td>{{ formatShanghaiDateTime(item.created_at, false) }}</td>
              <td>{{ item.patient_name || '—' }}</td>
              <td>{{ item.order_no || '—' }}</td>
              <td>{{ item.product_names || '—' }}</td>
              <td>¥{{ yuan(item.order_amount) }}</td>
              <td style="font-weight:700;color:#1a9d5c;">+¥{{ yuan(item.commission_amount) }}</td>
              <td>{{ statusLabel(item.status || 'pending') }}</td>
            </tr>
            <tr v-if="filteredRows.length === 0">
              <td colspan="7" class="empty-cell">暂无佣金明细</td>
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
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

.filter-input {
  width: 320px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #dbe3ef;
  padding: 0 12px;
  outline: none;
  font-size: 13px;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 36px 0;
}
</style>
