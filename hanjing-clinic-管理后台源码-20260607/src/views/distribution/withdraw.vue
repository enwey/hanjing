<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

/* ---- 提现记录 数据结构 ---- */
interface WithdrawApply {
  id: string;
  no: string;
  name: string;
  level: string;
  phone: string;
  amount: number;
  method: 'wechat' | 'bank';
  account: string;
  bankName?: string;
  time: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
}

const currentPage = ref(1)
const pageSize = ref(30)
const selectedRowKeys = ref<string[]>([])
const activeTab = ref('pending') // 'pending', 'approved', 'rejected', 'all'
const searchKeyword = ref('')
const loading = ref(false)
const records = ref<WithdrawApply[]>([])

async function fetchWithdraws() {
  loading.value = true
  try {
    const res: any = await request.get('/api/admin/distribution/withdraws')
    if (res && res.code === 200) {
      records.value = res.data.map((item: any) => ({
        id: String(item.id),
        no: 'TX' + String(item.id).padStart(8, '0'),
        name: item.nickname || '推广员',
        level: item.level || '普通',
        phone: item.phone || '138****0000',
        amount: item.amount,
        method: (item.account_info && item.account_info.includes('银行')) ? 'bank' : 'wechat',
        account: item.account_info || '微信钱包',
        time: item.created_at,
        status: item.status,
        reason: item.remark
      }))
    }
  } catch (err) {
    console.error('Fetch withdraws error:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchWithdraws()
})

/* ---- Dynamic counts ---- */
const pendingCount = computed(() => {
  return records.value.filter(r => r.status === 'pending').length
})

/* ---- Filtering ---- */
const filteredRecords = computed(() => {
  let list = records.value

  // 1. Tab filter
  if (activeTab.value === 'pending') {
    list = list.filter(r => r.status === 'pending')
  } else if (activeTab.value === 'approved') {
    list = list.filter(r => r.status === 'approved')
  } else if (activeTab.value === 'rejected') {
    list = list.filter(r => r.status === 'rejected')
  }

  // 2. Keyword filter
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(r => 
      r.name.toLowerCase().includes(kw) || 
      r.no.toLowerCase().includes(kw) || 
      r.phone.toLowerCase().includes(kw)
    )
  }

  return list
})

watch([searchKeyword, activeTab], () => {
  currentPage.value = 1
  selectedRowKeys.value = []
})

const paginatedRecords = computed(() => {
  const filtered = filteredRecords.value
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
})

/* ---- Selection logic ---- */
const isAllSelected = computed(() => {
  const visiblePendingIds = paginatedRecords.value
    .filter(r => r.status === 'pending')
    .map(r => r.id)
  if (visiblePendingIds.length === 0) return false
  return visiblePendingIds.every(id => selectedRowKeys.value.includes(id))
})

function toggleSelectAll() {
  const visiblePendingIds = paginatedRecords.value
    .filter(r => r.status === 'pending')
    .map(r => r.id)
  
  if (isAllSelected.value) {
    // Unselect visible pending
    selectedRowKeys.value = selectedRowKeys.value.filter(id => !visiblePendingIds.includes(id))
  } else {
    // Select visible pending
    const newKeys = [...selectedRowKeys.value]
    visiblePendingIds.forEach(id => {
      if (!newKeys.includes(id)) {
        newKeys.push(id)
      }
    })
    selectedRowKeys.value = newKeys
  }
}

function toggleSelect(id: string) {
  const index = selectedRowKeys.value.indexOf(id)
  if (index > -1) {
    selectedRowKeys.value.splice(index, 1)
  } else {
    selectedRowKeys.value.push(id)
  }
}

/* ---- Approval Actions ---- */
const approveVisible = ref(false)
const rejectVisible = ref(false)
const selectedRecord = ref<WithdrawApply | null>(null)
const rejectReason = ref('')

function openApprove(record: WithdrawApply) {
  selectedRecord.value = record
  approveVisible.value = true
}

async function confirmApprove() {
  if (selectedRecord.value) {
    try {
      await request.put(`/api/admin/distribution/withdraws/${selectedRecord.value.id}/status`, {
        status: 'approved',
        remark: '审核通过，已代付打款'
      })
      selectedRecord.value.status = 'approved'
      MessagePlugin.success(`申请单 ${selectedRecord.value.no} 已审核通过，系统已发起转账`)
      approveVisible.value = false
      selectedRowKeys.value = selectedRowKeys.value.filter(k => k !== selectedRecord.value?.id)
      fetchWithdraws()
    } catch (err) {
      console.error(err)
    }
  }
}

function openReject(record: WithdrawApply) {
  selectedRecord.value = record
  rejectReason.value = ''
  rejectVisible.value = true
}

async function confirmReject() {
  if (!rejectReason.value.trim()) {
    MessagePlugin.warning('请填写驳回原因')
    return
  }
  if (selectedRecord.value) {
    try {
      await request.put(`/api/admin/distribution/withdraws/${selectedRecord.value.id}/status`, {
        status: 'rejected',
        remark: rejectReason.value
      })
      selectedRecord.value.status = 'rejected'
      selectedRecord.value.reason = rejectReason.value
      MessagePlugin.success(`已驳回单 ${selectedRecord.value.no} 的提现申请`)
      rejectVisible.value = false
      selectedRowKeys.value = selectedRowKeys.value.filter(k => k !== selectedRecord.value?.id)
      fetchWithdraws()
    } catch (err) {
      console.error(err)
    }
  }
}

async function handleBatchApprove() {
  if (selectedRowKeys.value.length === 0) return
  let approvedCount = 0
  for (const key of selectedRowKeys.value) {
    const record = records.value.find(r => r.id === key)
    if (record && record.status === 'pending') {
      try {
        await request.put(`/api/admin/distribution/withdraws/${record.id}/status`, {
          status: 'approved',
          remark: '批量审核通过，已代付打款'
        })
        record.status = 'approved'
        approvedCount++
      } catch (err) {
        console.error(err)
      }
    }
  }
  if (approvedCount > 0) {
    MessagePlugin.success(`成功批量审核通过 ${approvedCount} 笔提现申请！`)
    fetchWithdraws()
  } else {
    MessagePlugin.info('选中的申请没有处于待审核状态的记录')
  }
  selectedRowKeys.value = []
}

function handleExport() {
  if (filteredRecords.value.length === 0) {
    MessagePlugin.warning('当前无提现记录数据可供导出')
    return
  }
  const headers = [
    '提现单号',
    '推广员姓名',
    '手机号',
    '提现金额',
    '提现方式',
    '收款账号',
    '申请时间',
    '状态',
    '备注/驳回原因'
  ]

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return ''
    const str = String(val).replace(/"/g, '""')
    return `"${str}"`
  }

  const rows = filteredRecords.value.map(row => [
    escapeCsv(row.no),
    escapeCsv(row.name),
    escapeCsv(row.phone),
    escapeCsv(`¥${(row.amount / 100).toFixed(2)}`),
    escapeCsv(row.method === 'wechat' ? '微信支付' : '银行卡'),
    escapeCsv(row.account),
    escapeCsv(row.time),
    escapeCsv(row.status === 'approved' ? '已通过' : row.status === 'rejected' ? '已驳回' : '待审核'),
    escapeCsv(row.reason || '—')
  ])

  const csvContent = '\uFEFF' + [headers.join(',')].concat(rows.map(r => r.join(','))).join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `提现记录报表-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  MessagePlugin.success('提现记录已成功导出')
}

function getAvatarBg(level: string) {
  if (level === '钻石') return 'linear-gradient(135deg, #8B5CF6, #6D28D9)'
  if (level === '金牌' || level === '黄金') return 'linear-gradient(135deg, #F59E0B, #D97706)'
  if (level === '银牌' || level === '白银') return 'linear-gradient(135deg, #9CA3AF, #6B7280)'
  return 'linear-gradient(135deg, #3B82F6, #1D4ED8)'
}

function formatTime(timeStr: string) {
  try {
    const parts = timeStr.split(' ')
    const dateParts = parts[0].split('-')
    const month = parseInt(dateParts[1])
    const day = parseInt(dateParts[2])
    const time = parts[1].substring(0, 5)
    return `${month}/${day} ${time}`
  } catch (e) {
    return timeStr
  }
}

function formatAccount(row: WithdrawApply) {
  if (row.method === 'wechat') {
    return row.name
  }
  const bank = row.bankName || '银行卡'
  const acc = row.account
  const last4 = acc.substring(acc.length - 4)
  return `${bank} ****${last4}`
}

const operationColumnWidth = computed(() => {
  if (paginatedRecords.value.length === 0) return '80px'
  const hasPending = paginatedRecords.value.some(r => r.status === 'pending')
  return hasPending ? '140px' : '80px'
})

watch(operationColumnWidth, () => {
  nextTick(() => {
    window.dispatchEvent(new Event('resize'))
  })
})
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">提现审核</div>
        <div class="page-title-sub">审核推广员提现申请</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button 
          class="btn btn-success" 
          @click="handleBatchApprove"
          :disabled="selectedRowKeys.length === 0"
        >
          <AppIcon name="check-circle" />  批量通过
        </button>
        <button class="btn btn-outline" @click="handleExport"><AppIcon name="download" />  导出</button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid-3">
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon blue">⏳</div>
        </div>
        <div class="stat-card-value" style="color: #3B6BF5;">
          {{ pendingCount }}
          <span style="font-size: 14px; font-weight: 500; color: #9CA3AF; margin-left: 2px;">笔</span>
        </div>
        <div class="stat-card-label">待审核申请</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon green"><AppIcon name="check-circle" /> </div>
        </div>
        <div class="stat-card-value" style="color: #16A34A;">
          12
          <span style="font-size: 14px; font-weight: 500; color: #9CA3AF; margin-left: 2px;">笔</span>
        </div>
        <div class="stat-card-label">今日已通过</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon gold"><AppIcon name="money" /> </div>
        </div>
        <div class="stat-card-value" style="color: #F5A623;">
          8,450.00
          <span style="font-size: 14px; font-weight: 500; color: #9CA3AF; margin-left: 2px;">元</span>
        </div>
        <div class="stat-card-label">今日发放金额</div>
      </div>
    </div>

    <!-- Data Panel -->
    <div class="panel">
      <!-- Filter Bar -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <div 
            class="filter-tab" 
            :class="{ active: activeTab === 'pending' }" 
            @click="activeTab = 'pending'"
          >
            待审核 <span style="opacity: 0.6; margin-left: 4px;">{{ pendingCount }}</span>
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
          placeholder="搜索姓名/手机号/单号" 
          style="width: 210px;"
        >
      </div>

      <!-- Data Table -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="width: 50px; text-align: center;">
                <input 
                  type="checkbox" 
                  :checked="selectedRowKeys.length === paginatedRecords.filter(r => r.status === 'pending').length && selectedRowKeys.length > 0" 
                  @change="toggleSelectAll"
                >
              </th>
              <th>申请单号</th>
              <th>推广员</th>
              <th>提现金额</th>
              <th>手续费</th>
              <th>到账金额</th>
              <th>账户</th>
              <th>申请时间</th>
              <th :style="{ width: operationColumnWidth, minWidth: operationColumnWidth, textAlign: 'right' }">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedRecords" :key="row.id">
              <td style="text-align: center;">
                <input 
                  type="checkbox" 
                  :checked="selectedRowKeys.includes(row.id)" 
                  @change="toggleSelect(row.id)"
                  :disabled="row.status !== 'pending'"
                >
              </td>
              <td class="id">{{ row.no }}</td>
              <td>
                <div class="name-cell" style="min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 8px;">
                  <div class="avatar-sm" :style="{ background: getAvatarBg(row.level), flexShrink: 0 }">
                    {{ row.name.substring(0, 1) }}
                  </div>
                  <div style="min-width: 0; overflow: hidden; display: flex; flex-direction: column;">
                    <div style="font-weight: 600; color: #1F2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ row.name }}</div>
                    <div style="font-size: 11px; color: #9CA3AF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ row.phone }}</div>
                  </div>
                </div>
              </td>
              <td style="font-weight: 700;">¥{{ row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td>
              <td style="color: #9CA3AF;">¥{{ (row.amount * 0.002).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td>
              <td style="font-weight: 700; color: #16A34A;">¥{{ (row.amount * 0.998).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td>
              <td>
                <div style="font-size: 12px;">
                  <div style="font-weight: 500; color: #374151;">{{ row.method === 'wechat' ? '微信零钱' : '银行卡' }}</div>
                  <div style="color: #9CA3AF;">{{ formatAccount(row) }}</div>
                </div>
              </td>
              <td style="font-size: 12px; color: #9CA3AF;">{{ formatTime(row.time) }}</td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;">
                  <template v-if="row.status === 'pending'">
                    <button class="btn btn-xs btn-success" @click="openApprove(row)">通过</button>
                    <button class="btn btn-xs btn-danger" @click="openReject(row)">拒绝</button>
                  </template>
                  <template v-else-if="row.status === 'approved'">
                    <span class="status-tag green">已通过</span>
                  </template>
                  <template v-else-if="row.status === 'rejected'">
                    <t-tooltip :content="'驳回原因：' + (row.reason || '无')">
                      <span class="status-tag gray" style="cursor: help;">已拒绝</span>
                    </t-tooltip>
                  </template>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedRecords.length === 0">
              <td colspan="9" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无匹配的提现记录数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredRecords.length"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>

    <!-- Approve Dialog -->
    <t-dialog
      v-model:visible="approveVisible"
      header="同意提现申请"
      @confirm="confirmApprove"
    >
      <div v-if="selectedRecord" style="padding: 8px 0;">
        <p style="margin-bottom: 12px; font-size: 14px; color: #4B5563;">您正在同意该笔提现申请，系统将执行自动打款：</p>
        <t-descriptions bordered size="small" :column="1">
          <t-descriptions-item label="单号">{{ selectedRecord.no }}</t-descriptions-item>
          <t-descriptions-item label="推广员">{{ selectedRecord.name }} ({{ selectedRecord.level }})</t-descriptions-item>
          <t-descriptions-item label="提现金额"><strong>¥{{ selectedRecord.amount.toFixed(2) }}</strong></t-descriptions-item>
          <t-descriptions-item label="手续费 (0.2%)"><span style="color: #9CA3AF;">¥{{ (selectedRecord.amount * 0.002).toFixed(2) }}</span></t-descriptions-item>
          <t-descriptions-item label="实际到账"><strong style="color: #16A34A;">¥{{ (selectedRecord.amount * 0.998).toFixed(2) }}</strong></t-descriptions-item>
          <t-descriptions-item label="收款账号">{{ formatAccount(selectedRecord) }} ({{ selectedRecord.method === 'wechat' ? '微信' : '银行卡' }})</t-descriptions-item>
        </t-descriptions>
      </div>
    </t-dialog>

    <!-- Reject Dialog -->
    <t-dialog
      v-model:visible="rejectVisible"
      header="驳回提现申请"
      @confirm="confirmReject"
    >
      <div v-if="selectedRecord" style="padding: 8px 0;">
        <p style="margin-bottom: 12px; font-size: 14px; color: #4B5563;">
          您确定要驳回 <strong>{{ selectedRecord.name }}</strong> 的 <strong>¥{{ selectedRecord.amount.toFixed(2) }}</strong> 提现申请吗？
        </p>
        <t-textarea
          v-model="rejectReason"
          placeholder="请输入驳回原因（必填，用户将在小程序端可见）"
          :autosize="{ minRows: 3, maxRows: 6 }"
        />
      </div>
    </t-dialog>
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
  margin-bottom: 0;
}
.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #F3F4F6;
  background: #fff;
}

/* Button styles matching mockup global CSS */
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
.btn-outline {
  background: #fff;
  color: #374151;
  border: 1px solid #E5E7EB;
}
.btn-outline:hover {
  border-color: #BCCFFF;
  color: #3B6BF5;
}
.btn-success {
  background: #16A34A;
  color: #fff;
}
.btn-success:hover {
  background: #15803D;
}
.btn-success:disabled {
  background: #A7F3D0;
  color: #fff;
  cursor: not-allowed;
}
.btn-danger {
  background: #EF4444;
  color: #fff;
}
.btn-danger:hover {
  background: #DC2626;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

/* Filter components */
.filter-tabs {
  display: flex;
  gap: 0;
}
.filter-tab {
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  border: 1px solid #E5E7EB;
  background: #fff;
  transition: all 150ms;
}
.filter-tab:first-child {
  border-radius: 6px 0 0 6px;
}
.filter-tab:last-child {
  border-radius: 0 6px 6px 0;
}
.filter-tab + .filter-tab {
  border-left: none;
}
.filter-tab.active {
  background: #3B6BF5;
  color: #fff;
  border-color: #3B6BF5;
}

.filter-input {
  padding: 6px 12px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  outline: none;
  transition: border-color 150ms;
}
.filter-input:focus {
  border-color: #3B6BF5;
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
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  color: #fff;
  flex-shrink: 0;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.pagination-footer {
  padding: 16px 20px;
  border-top: 1px solid #F3F4F6;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* Rounded Status tags with indicator dots */
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}
.status-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.status-tag.green {
  background: #ecfdf5;
  color: #16a34a;
}
.status-tag.green::before {
  background: #10b981;
}
.status-tag.gray {
  background: #f3f4f6;
  color: #6b7280;
}
.status-tag.gray::before {
  background: #9ca3af;
}
.status-tag.red {
  background: #fef2f2;
  color: #ef4444;
}
.status-tag.red::before {
  background: #f87171;
}

/* KPI Cards Layout */
.stat-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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
</style>
