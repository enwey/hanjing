<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'

const status = ref('全部')
const rows = ref<any[]>([])
const statusOptions = ['全部', 'pending', 'approved', 'rejected']

const filteredRows = computed(() => {
  return rows.value.filter((item) => status.value === '全部' || item.status === status.value)
})

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
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
  <section class="panel">
    <div class="panel-title-row">
      <div class="panel-title">我的提现</div>
      <div class="panel-sub">展示当前推广员本人历史提现记录与处理状态</div>
    </div>
    <div class="filter-bar">
      <div class="filter-tabs">
        <button
          v-for="item in statusOptions"
          :key="item"
          :class="['filter-tab', status === item ? 'active' : '']"
          @click="status = item"
        >
          {{ item === '全部' ? '全部状态' : item }}
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
            <th>到账金额</th>
            <th>提现方式</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredRows" :key="item.id">
            <td>{{ formatShanghaiDateTime(item.createdAt, false) }}</td>
            <td>¥{{ yuan(item.amount) }}</td>
            <td>¥{{ yuan(item.fee) }}</td>
            <td style="font-weight:700;color:#1a9d5c;">¥{{ yuan(item.actualAmount) }}</td>
            <td>{{ item.accountInfo?.method === 'bank' ? '银行卡' : '微信零钱' }}</td>
            <td>{{ item.status }}</td>
          </tr>
          <tr v-if="filteredRows.length === 0">
            <td colspan="6" class="empty-cell">暂无提现记录</td>
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
  padding: 18px 20px;
  border-bottom: 1px solid #f1f5f9;
}

.filter-tabs {
  display: flex;
  gap: 10px;
}

.filter-tab {
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  cursor: pointer;
}

.filter-tab.active {
  background: #eef4ff;
  color: #2a52d4;
  border-color: #dbeafe;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 36px 0;
}
</style>
