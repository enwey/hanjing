<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'

const keyword = ref('')
const rows = ref<any[]>([])

const filteredRows = computed(() => {
  return rows.value.filter((item) => {
    if (!keyword.value) return true
    return [
      item.promoter_name,
      item.patient_name,
      item.order_no,
      item.product_names
    ].some((field) => String(field || '').includes(keyword.value))
  })
})

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
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
  <section class="panel">
    <div class="panel-title-row">
      <div class="panel-title">我的佣金</div>
      <div class="panel-sub">展示当前推广员本人产生的全部佣金流水</div>
    </div>
    <div class="filter-bar">
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
            <td>{{ item.status || 'pending' }}</td>
          </tr>
          <tr v-if="filteredRows.length === 0">
            <td colspan="7" class="empty-cell">暂无佣金明细</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.panel {
  background: #fff;
  border-radius: 18px;
  border: 1px solid #eef2f7;
  overflow: hidden;
}

.panel-title-row {
  padding: 20px 20px 0;
}

.panel-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.panel-sub {
  margin-top: 6px;
  font-size: 13px;
  color: #94a3b8;
}

.filter-bar {
  display: flex;
  justify-content: flex-end;
  padding: 18px 20px;
  border-bottom: 1px solid #f1f5f9;
}

.filter-input {
  width: 320px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  padding: 0 12px;
  outline: none;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 36px 0;
}
</style>
