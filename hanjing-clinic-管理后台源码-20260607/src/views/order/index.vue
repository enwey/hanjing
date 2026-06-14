<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'

const router = useRouter()
const searchKeyword = ref('')
const filterType = ref('全部类型')
const filterStore = ref('全部门店')
const currentPage = ref(1)
const pageSize = ref(30)
const activeTab = ref('全部')

interface Order {
  id: string
  no: string
  patient: string
  avatarBg: string
  product: string
  store: string
  amount: number
  commission: string
  createTime: string
  status: string
}

const initialOrders: Order[] = [
  { id: '1', no: '#2026052901', patient: '张明华', avatarBg: '#5A85F5', product: '睡眠监测套餐', store: '龙岗总店', amount: 3680, commission: '¥552 (15%)', createTime: '5/29 08:30', status: 'completed' },
  { id: '2', no: '#2026052902', patient: '李雪琴', avatarBg: '#9333EA', product: '止鼾器定制', store: '南山分院', amount: 1280, commission: '¥192 (15%)', createTime: '5/29 09:15', status: 'processing' },
  { id: '3', no: '#2026052903', patient: '陈建国', avatarBg: '#F59E0B', product: 'CPAP呼吸机', store: '福田门诊部', amount: 8900, commission: '¥1,335 (15%)', createTime: '5/29 10:22', status: 'shipping' },
  { id: '4', no: '#2026052905', patient: '周小燕', avatarBg: '#22C55E', product: '复查+监测', store: '南山分院', amount: 580, commission: '—', createTime: '5/29 13:05', status: 'refunded' }
]

const orders = ref<Order[]>(
  Array.from({ length: 35 }, (_, index) => {
    const base = initialOrders[index % initialOrders.length]
    const orderNum = 2026052901 + index
    return {
      ...base,
      id: String(index + 1),
      no: `#${orderNum}`,
      patient: index < 4 ? base.patient : base.patient.substring(0, 1) + '同学' + index
    }
  })
)

const tabs = ['全部', '待处理', '处理中', '已完成', '退款']

const statusThemeMap: Record<string, string> = {
  completed: 'green',
  processing: 'blue',
  shipping: 'gold',
  refunded: 'red'
}

const statusLabelMap: Record<string, string> = {
  completed: '已完成',
  processing: '处理中',
  shipping: '待发货',
  refunded: '已退款'
}

const filteredOrders = computed(() => {
  let list = orders.value

  // Horizontal Tabs Filter
  if (activeTab.value === '待处理') {
    list = list.filter(o => o.status === 'shipping')
  } else if (activeTab.value === '处理中') {
    list = list.filter(o => o.status === 'processing')
  } else if (activeTab.value === '已完成') {
    list = list.filter(o => o.status === 'completed')
  } else if (activeTab.value === '退款') {
    list = list.filter(o => o.status === 'refunded')
  }

  // Type Filter
  if (filterType.value && filterType.value !== '全部类型') {
    if (filterType.value === '挂号') {
      list = list.filter(o => o.product.includes('诊') || o.product.includes('挂号'))
    } else if (filterType.value === '套餐') {
      list = list.filter(o => o.product.includes('套餐') || o.product.includes('监测'))
    } else if (filterType.value === '器械') {
      list = list.filter(o => o.product.includes('呼吸机') || o.product.includes('止鼾') || o.product.includes('器'))
    }
  }

  // Store Filter
  if (filterStore.value && filterStore.value !== '全部门店') {
    list = list.filter(o => o.store.includes(filterStore.value))
  }

  // Search input filter
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(o => o.no.toLowerCase().includes(kw) || o.patient.includes(kw))
  }

  return list
})

const paginatedOrders = computed(() => {
  const filtered = filteredOrders.value
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
})

function openOrderDetail(orderId: string) {
  router.push(`/order/detail/${orderId}`)
}

function handleExport() {
  MessagePlugin.success('导出数据成功！')
}

function handleComplete(row: Order) {
  row.status = 'completed'
  MessagePlugin.success(`订单 ${row.no} 已标记为完成`)
}

function handleShip(row: Order) {
  router.push(`/order/detail/${row.id}`)
}
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">订单管理</div>
        <div class="page-title-sub">管理所有商品及服务订单</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline" @click="handleExport">📥 导出</button>
      </div>
    </div>

    <!-- 订单列表面板 -->
    <div class="panel">
      <!-- 过滤栏 -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <div
            v-for="tab in tabs"
            :key="tab"
            :class="['filter-tab', activeTab === tab ? 'active' : '']"
            @click="activeTab = tab"
          >
            {{ tab }}
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:10px;align-items:center;">
          <input type="text" v-model="searchKeyword" class="filter-input" placeholder="🔍 搜索订单号/患者名" style="width:200px;">
          <select v-model="filterType" class="filter-select">
            <option value="全部类型">全部类型</option>
            <option value="挂号">挂号</option>
            <option value="套餐">套餐</option>
            <option value="器械">器械</option>
          </select>
          <select v-model="filterStore" class="filter-select">
            <option value="全部门店">全部门店</option>
            <option value="龙岗总店">龙岗总店</option>
            <option value="南山分院">南山分院</option>
            <option value="福田门诊部">福田门诊部</option>
          </select>
        </div>
      </div>

      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="width: 130px;">订单号</th>
              <th style="width: 140px;">患者</th>
              <th style="min-width: 180px;">商品/服务</th>
              <th style="width: 120px;">门店</th>
              <th style="width: 100px;">金额</th>
              <th style="width: 110px;">分销佣金</th>
              <th style="width: 150px;">下单时间</th>
              <th style="width: 100px;">状态</th>
              <th style="width: 140px; min-width: 140px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedOrders" :key="row.id">
              <td class="id">{{ row.no }}</td>
              <td>
                <div class="name-cell">
                  <div class="avatar-sm" :style="{ background: row.avatarBg }">
                    {{ row.patient[0] }}
                  </div>
                  {{ row.patient }}
                </div>
              </td>
              <td>{{ row.product }}</td>
              <td>{{ row.store }}</td>
              <td style="font-weight:700;">¥{{ row.amount.toLocaleString() }}</td>
              <td :style="{
                color: row.commission !== '—' ? '#F59E0B' : 'inherit',
                fontWeight: row.commission !== '—' ? '600' : 'normal'
              }">
                {{ row.commission }}
              </td>
              <td style="font-size:12px;color:#9CA3AF;">{{ row.createTime }}</td>
              <td>
                <span :class="['status-tag', statusThemeMap[row.status]]">
                  {{ statusLabelMap[row.status] }}
                </span>
              </td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;">
                  <button class="btn btn-xs btn-outline" @click="openOrderDetail(row.id)">详情</button>
                  <button v-if="row.status === 'processing'" class="btn btn-xs btn-success" @click="handleComplete(row)">完成</button>
                  <button v-if="row.status === 'shipping'" class="btn btn-xs btn-primary" @click="handleShip(row)">发货</button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedOrders.length === 0">
              <td colspan="9" style="text-align:center;color:#9CA3AF;padding:40px 0;">暂无匹配的订单数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 footer -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredOrders.length"
          :pageSizeOptions="[30, 60, 100]"
          style="width: 100%; border: none; padding: 0; display: flex; justify-content: flex-end;"
        />
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
  margin-bottom: 0;
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
.btn-danger {
  background: #FEF2F2;
  color: #EF4444;
  border: 1px solid #FECACA;
}
.btn-success {
  background: #ECFDF5;
  color: #16A34A;
  border: 1px solid #BBF7D0;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

/* Filter styles matching mockup */
.filter-bar {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #F3F4F6;
  background: #fff;
  flex-wrap: wrap;
  gap: 12px;
}
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

.filter-input, .filter-select {
  padding: 6px 12px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  outline: none;
  transition: border-color 150ms;
}
.filter-input:focus, .filter-select:focus {
  border-color: #3B6BF5;
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-label {
  font-size: 13px;
  color: #6B7280;
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

.id {
  font-family: monospace;
  font-weight: 600;
  color: #3B6BF5;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1F2937;
}
.avatar-sm {
  width: 28px;
  height: 28px;
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
.status-tag.blue {
  background: #eef2ff;
  color: #4f46e5;
}
.status-tag.blue::before {
  background: #6366f1;
}
.status-tag.gold {
  background: #fff9e6;
  color: #d4930a;
}
.status-tag.gold::before {
  background: #f59e0b;
}
.status-tag.red {
  background: #fef2f2;
  color: #dc2626;
}
.status-tag.red::before {
  background: #ef4444;
}
</style>
