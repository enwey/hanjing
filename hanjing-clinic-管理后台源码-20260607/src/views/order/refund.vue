<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

interface RefundRequest {
  id: string;
  refundNo: string;
  orderNo: string;
  patient: string;
  avatarChar: string;
  avatarColor: string;
  product: string;
  amount: number;
  reason: string;
  applyTime: string;
  status: string; // pending, approved, rejected
}

const refunds = ref<RefundRequest[]>([])

const selectedRefund = ref<RefundRequest | null>(null)

const currentPage = ref(1)
const pageSize = ref(30)

const activeTab = ref('pending') // Default to 'pending' to match UI mockup
const searchKeyword = ref('')

const filteredRefunds = computed(() => {
  return refunds.value.filter(r => {
    const matchStatus = activeTab.value === 'all' || r.status === activeTab.value
    const kw = searchKeyword.value.trim().toLowerCase()
    const matchKeyword = !kw || 
      r.refundNo.toLowerCase().includes(kw) || 
      r.orderNo.toLowerCase().includes(kw) || 
      r.patient.toLowerCase().includes(kw)
    return matchStatus && matchKeyword
  })
})

const paginatedRefunds = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredRefunds.value.slice(start, end)
})

watch([activeTab, searchKeyword], () => {
  currentPage.value = 1
})

function showDetail(row: RefundRequest) {
  selectedRefund.value = row
}

function formatTime(value: string) {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}

function mapRefund(row: any): RefundRequest {
  return {
    id: String(row.id),
    refundNo: row.refundNo,
    orderNo: row.orderNo,
    patient: row.patient,
    avatarChar: (row.patient || '患').charAt(0),
    avatarColor: '#10B981',
    product: row.product,
    amount: Number(row.amount || 0) / 100,
    reason: row.reason || '用户申请退款',
    applyTime: formatTime(row.applyTime),
    status: row.status
  }
}

async function fetchRefunds() {
  try {
    const res: any = await request.get('/api/admin/orders/refunds')
    refunds.value = (res.data || []).map(mapRefund)
    selectedRefund.value = refunds.value[0] || null
  } catch (error) {
    MessagePlugin.error('加载退款列表失败')
  }
}

async function handleApprove(row: RefundRequest) {
  try {
    await request.put(`/api/admin/orders/${row.id}/refund`, { approve: true })
    row.status = 'approved'
    MessagePlugin.success(`已同意退款单 ${row.refundNo}`)
    if (selectedRefund.value?.id === row.id) selectedRefund.value = null
  } catch (error) {
    MessagePlugin.error('退款审批通过失败')
  }
}

async function handleReject(row: RefundRequest) {
  try {
    await request.put(`/api/admin/orders/${row.id}/refund`, { approve: false })
    row.status = 'rejected'
    MessagePlugin.error(`已拒绝退款单 ${row.refundNo}`)
    if (selectedRefund.value?.id === row.id) selectedRefund.value = null
  } catch (error) {
    MessagePlugin.error('退款驳回失败')
  }
}

onMounted(fetchRefunds)
</script>

<template>
  <div class="page-container">


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">退款审核</div>
        <div class="page-title-sub">
          {{ refunds.filter(r => r.status === 'pending').length }}笔待审核退款
        </div>
      </div>
    </div>

    <!-- Table List -->
    <div class="panel">
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <div 
            class="filter-tab" 
            :class="{ active: activeTab === 'pending' }" 
            @click="activeTab = 'pending'"
          >
            待审核 <span style="opacity: 0.6; margin-left: 4px;">{{ refunds.filter(r => r.status === 'pending').length }}</span>
          </div>
          <div 
            class="filter-tab" 
            :class="{ active: activeTab === 'approved' }" 
            @click="activeTab = 'approved'"
          >
            已通过
          </div>
          <div 
            class="filter-tab" 
            :class="{ active: activeTab === 'rejected' }" 
            @click="activeTab = 'rejected'"
          >
            已拒绝
          </div>
          <div 
            class="filter-tab" 
            :class="{ active: activeTab === 'all' }" 
            @click="activeTab = 'all'"
          >
            全部
          </div>
        </div>

        <input 
          type="text" 
          v-model="searchKeyword" 
          class="filter-input" 
          placeholder="🔍 搜索单号/原订单/患者" 
          style="width: 210px;"
        >
      </div>

      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="width: 150px;">退款单号</th>
              <th style="width: 140px;">原订单</th>
              <th style="width: 140px;">患者</th>
              <th style="min-width: 180px;">商品</th>
              <th style="width: 100px;">退款金额</th>
              <th style="width: 180px;">原因</th>
              <th style="width: 150px;">申请时间</th>
              <th style="width: 170px; min-width: 170px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedRefunds" :key="row.id">
              <td style="font-family: monospace; font-size: 12px; color: #9CA3AF;">{{ row.refundNo }}</td>
              <td style="font-family: monospace; font-size: 12px;">{{ row.orderNo }}</td>
              <td>
                <div class="name-cell">
                  <div class="avatar avatar-sm" :style="{ background: row.avatarColor }">{{ row.avatarChar }}</div>
                  <span>{{ row.patient }}</span>
                </div>
              </td>
              <td>{{ row.product }}</td>
              <td style="font-weight: 700; color: var(--error-500);">¥{{ row.amount }}</td>
              <td style="font-size: 12px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {{ row.reason }}
              </td>
              <td style="font-size: 12px; color: #6B7280;">{{ row.applyTime }}</td>
              <td style="text-align: right;">
                <div style="display: flex; gap: 6px; justify-content: flex-end;" v-if="row.status === 'pending'">
                  <button class="btn btn-xs btn-success" @click="handleApprove(row)">通过</button>
                  <button class="btn btn-xs btn-danger" @click="handleReject(row)">拒绝</button>
                  <button class="btn btn-xs btn-outline" @click="showDetail(row)">详情</button>
                </div>
                <div style="display: flex; justify-content: flex-end;" v-else>
                  <span class="status-tag green" v-if="row.status === 'approved'">退款通过</span>
                  <span class="status-tag red" v-else-if="row.status === 'rejected'">已拒绝</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- 分页 -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredRefunds.length"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>

    <!-- Refund Detail In-page (shows under table) -->
    <div class="detail-panel" v-if="selectedRefund">
      <div class="detail-panel-title">💡 退款详情 — {{ selectedRefund.refundNo }}</div>
      <div class="card-grid-2">
        <div>
          <div style="font-size: 13px; color: #6B7280; line-height: 2;">
            <strong style="color: #374151;">退款原因：</strong>{{ selectedRefund.reason }}<br>
            <strong style="color: #374151;">退款类型：</strong>全额退款<br>
            <strong style="color: #374151;">原支付方式：</strong>微信支付<br>
            <strong style="color: #374151;">退款路径：</strong>原路退回
          </div>
        </div>
        <div>
          <div style="font-size: 13px; color: #6B7280; line-height: 2;">
            <strong style="color: #374151;">佣金影响：</strong><br>
            <span style="color: var(--error-500);">→ 一级佣金扣回：¥{{ (selectedRefund.amount * 0.15).toFixed(0) }} (15%)</span><br>
            <span style="color: var(--error-500);">→ 二级佣金扣回：¥{{ (selectedRefund.amount * 0.05).toFixed(0) }} (5%)</span><br>
            <strong style="color: #374151;">预计到账：</strong>1-3个工作日
          </div>
        </div>
      </div>
      <div class="detail-actions" v-if="selectedRefund.status === 'pending'">
        <button class="btn btn-danger" @click="handleReject(selectedRefund)">❌ 拒绝退款</button>
        <button class="btn btn-success" @click="handleApprove(selectedRefund)">✅ 同意退款</button>
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

/* Panels */
.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

/* Detail panel */
.detail-panel {
  margin-top: 16px;
  padding: 24px;
  background: #F9FAFB;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
}
.detail-panel-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 16px;
}
.detail-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
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
.btn-danger {
  background: #FEF2F2;
  color: #DC2626;
  border: 1px solid #FECACA;
}
.btn-danger:hover {
  background: #FEE2E2;
}
.btn-success {
  background: #ECFDF5;
  color: #16A34A;
  border: 1px solid #BBF7D0;
}
.btn-success:hover {
  background: #D3F5E3;
}
.btn-xs {
  padding: 3px 8px;
  font-size: 11px;
}

/* Grids */
.card-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
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

/* Avatar */
.avatar {
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
.avatar-sm {
  width: 24px;
  height: 24px;
  font-size: 11px;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

/* Status Tags */
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.status-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status-tag.green {
  background: #ECFDF5;
  color: #16A34A;
}
.status-tag.green::before {
  background: #22C55E;
}
.status-tag.red {
  background: #FEF2F2;
  color: #DC2626;
}
.status-tag.red::before {
  background: #EF4444;
}
</style>
