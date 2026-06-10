<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'

const router = useRouter()
const searchKeyword = ref('')
const activeLevelTab = ref('全部')
const detailVisible = ref(false)
const selectedDistributor = ref<any>(null)

interface Commission {
  date: string; orderNo: string; patient: string; product: string; amount: number; rate: string; commission: number
}
interface Distributor {
  id: string; name: string; phone: string; level: string;
  firstLevelDownline: number; secondLevelDownline: number;
  totalOrders: number; totalAmount: number; totalCommission: number; withdrawableCommission: number
  joinDate: string; source: string; status: string
  commissions: Commission[]
}

const currentPage = ref(1)
const pageSize = ref(30)

const initialDistributors: Distributor[] = [
  { id: '1', name: '赵芳芳', phone: '138****1111', level: '钻石', firstLevelDownline: 56, secondLevelDownline: 128,
    totalOrders: 342, totalAmount: 186400, totalCommission: 18640, withdrawableCommission: 3280,
    joinDate: '2025-09-15', source: '患者转化', status: 'active',
    commissions: [
      { date: '2026-06-04', orderNo: 'OD202606040002', patient: '李美玲', product: '睡眠监测服务', amount: 980, rate: '10%', commission: 98 },
      { date: '2026-05-28', orderNo: 'OD202605280007', patient: '周文博', product: '定制阻鼾器·标准型', amount: 3980, rate: '10%', commission: 398 },
      { date: '2026-05-15', orderNo: 'OD202605150009', patient: '郑先生', product: '定制阻鼾器·舒适型', amount: 5680, rate: '12%', commission: 682 },
    ]
  },
  { id: '2', name: '李雪琴', phone: '139****2345', level: '金牌', firstLevelDownline: 23, secondLevelDownline: 45,
    totalOrders: 98, totalAmount: 54200, totalCommission: 5420, withdrawableCommission: 860,
    joinDate: '2025-10-08', source: '患者转化', status: 'active',
    commissions: [
      { date: '2026-06-02', orderNo: 'OD202606020005', patient: '陈大明', product: '年度随访套餐', amount: 2980, rate: '10%', commission: 298 },
      { date: '2026-05-20', orderNo: 'OD202605200010', patient: '黄女士', product: '定制阻鼾器·标准型', amount: 3980, rate: '10%', commission: 398 },
    ]
  },
  { id: '3', name: '孙大鹏', phone: '136****7890', level: '银牌', firstLevelDownline: 5, secondLevelDownline: 3,
    totalOrders: 12, totalAmount: 6800, totalCommission: 680, withdrawableCommission: 120,
    joinDate: '2025-11-20', source: '医生推荐', status: 'active',
    commissions: [
      { date: '2026-05-28', orderNo: 'OD202605280011', patient: '孙先生', product: '定制阻鼾器·舒适型', amount: 5680, rate: '8%', commission: 454 },
    ]
  },
  { id: '4', name: '周小林', phone: '137****6666', level: '银牌', firstLevelDownline: 12, secondLevelDownline: 19,
    totalOrders: 18, totalAmount: 14200, totalCommission: 1420, withdrawableCommission: 0,
    joinDate: '2025-12-05', source: '门店推广', status: 'active',
    commissions: []
  },
  { id: '5', name: '王梦莹', phone: '135****5555', level: '银牌', firstLevelDownline: 8, secondLevelDownline: 14,
    totalOrders: 9, totalAmount: 9800, totalCommission: 980, withdrawableCommission: 180,
    joinDate: '2026-01-15', source: '直播引流', status: 'active',
    commissions: []
  },
  { id: '6', name: '刘志明', phone: '133****4444', level: '青铜', firstLevelDownline: 4, secondLevelDownline: 6,
    totalOrders: 4, totalAmount: 3560, totalCommission: 356, withdrawableCommission: 89,
    joinDate: '2026-03-10', source: '患者转化', status: 'active',
    commissions: []
  },
]

const distributors = ref<Distributor[]>(
  Array.from({ length: 35 }, (_, index) => {
    const base = initialDistributors[index % initialDistributors.length]
    return {
      ...base,
      id: String(index + 1),
      name: index < 6 ? base.name : base.name.substring(0, 1) + '推广员' + (index + 1),
      phone: base.phone,
      status: (index % 5 === 0) ? 'inactive' : 'active'
    }
  })
)

const levelTabs = ['全部', '银牌', '金牌', '钻石']

const filteredDistributors = computed(() => {
  let list = distributors.value
  
  // Tab level filter
  if (activeLevelTab.value !== '全部') {
    list = list.filter(d => d.level === activeLevelTab.value)
  }

  // Keyword search
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(d => d.name.includes(kw) || d.phone.includes(kw))
  }

  return list
})

watch([searchKeyword, activeLevelTab], () => {
  currentPage.value = 1
})

const paginatedDistributors = computed(() => {
  const filtered = filteredDistributors.value
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
})

function openDetail(d: Distributor) {
  selectedDistributor.value = d
  detailVisible.value = true
}

function handleExport() {
  MessagePlugin.success('导出报表成功！')
}

function getAvatarBg(level: string) {
  if (level === '钻石') return 'linear-gradient(135deg, #8B5CF6, #6D28D9)'
  if (level === '金牌') return 'linear-gradient(135deg, #F59E0B, #D97706)'
  if (level === '银牌') return 'linear-gradient(135deg, #9CA3AF, #6B7280)'
  return 'linear-gradient(135deg, #3B82F6, #1D4ED8)'
}

function getLevelStyle(level: string) {
  if (level === '钻石') return { fontSize: '12px', padding: '3px 10px', borderRadius: '9999px', background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', color: '#fff', fontWeight: '600' }
  if (level === '金牌') return { fontSize: '12px', padding: '3px 10px', borderRadius: '9999px', background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#fff', fontWeight: '600' }
  if (level === '银牌') return { fontSize: '12px', padding: '3px 10px', borderRadius: '9999px', background: '#E5E7EB', color: '#4B5563', fontWeight: '600' }
  return { fontSize: '12px', padding: '3px 10px', borderRadius: '9999px', background: '#FFF7ED', color: '#C2410C', fontWeight: '600' }
}

function getLevelEmoji(level: string) {
  if (level === '钻石') return '💎'
  if (level === '金牌') return '🥇'
  if (level === '银牌') return '🥈'
  return '🥉'
}
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">推广员管理</div>
        <div class="page-title-sub">管理分销推广渠道与推广人员</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-outline" @click="handleExport">📥 导出报表</button>
      </div>
    </div>

    <!-- 推广员列表 -->
    <div class="panel">
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <div
            v-for="tab in levelTabs"
            :key="tab"
            :class="['filter-tab', activeLevelTab === tab ? 'active' : '']"
            @click="activeLevelTab = tab"
          >
            {{ tab }}
          </div>
        </div>

        <input 
          type="text" 
          v-model="searchKeyword" 
          class="filter-input" 
          placeholder="🔍 搜索姓名/手机号" 
          style="width: 180px;"
        >
      </div>

      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="width: 160px;">推广员</th>
              <th style="width: 110px;">等级</th>
              <th style="width: 100px;">一级下线</th>
              <th style="width: 100px;">二级下线</th>
              <th style="width: 100px;">推广订单</th>
              <th style="width: 120px;">累计佣金</th>
              <th style="width: 120px;">可提现</th>
              <th style="width: 100px;">状态</th>
              <th style="width: 150px; min-width: 150px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedDistributors" :key="row.id">
              <td>
                <div class="name-cell">
                  <div class="avatar-sm" :style="{ background: getAvatarBg(row.level) }">
                    {{ row.name.substring(0, 1) }}
                  </div>
                  <div>
                    <div style="font-weight:600;color:#1F2937;">{{ row.name }}</div>
                    <div style="font-size:11px;color:#9CA3AF;">{{ row.phone }}</div>
                  </div>
                </div>
              </td>
              <td>
                <span :style="getLevelStyle(row.level)">
                  {{ getLevelEmoji(row.level) }} {{ row.level }}
                </span>
              </td>
              <td style="font-weight:600;">{{ row.firstLevelDownline }}</td>
              <td style="font-weight:600;">{{ row.secondLevelDownline }}</td>
              <td style="font-weight:600;">{{ row.totalOrders }}</td>
              <td style="font-weight:700;color:#F5A623;">¥{{ row.totalCommission.toLocaleString() }}</td>
              <td style="font-weight:600;color:#22C55E;">¥{{ row.withdrawableCommission.toLocaleString() }}</td>
              <td>
                <span :class="['status-tag', row.status === 'active' ? 'green' : 'gray']">
                  {{ row.status === 'active' ? '活跃' : '低活跃' }}
                </span>
              </td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;">
                  <button class="btn btn-xs btn-outline" @click="router.push('/promoter/detail/' + row.id)">详情</button>
                  <button class="btn btn-xs btn-outline" @click="openDetail(row)">明细</button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedDistributors.length === 0">
              <td colspan="9" style="text-align:center;color:#9CA3AF;padding:40px 0;">暂无匹配的推广员数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 footer -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredDistributors.length"
          :pageSizeOptions="[30, 60, 100]"
          style="width: 100%; border: none; padding: 0; display: flex; justify-content: flex-end;"
        />
      </div>
    </div>

    <!-- 佣金明细抽屉 -->
    <t-drawer
      v-model:visible="detailVisible"
      :header="selectedDistributor?.name + ' - 佣金明细'"
      size="560px"
      :footer="false"
    >
      <div v-if="selectedDistributor">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
          <div class="drawer-kpi" style="background:#F3F0FF">
            <div style="font-size:22px;font-weight:700;color:#8B5CF6">¥{{ selectedDistributor.totalCommission.toLocaleString() }}</div>
            <div style="font-size:12px;color:#6B7280">累计佣金</div>
          </div>
          <div class="drawer-kpi" style="background:#ECFDF5">
            <div style="font-size:22px;font-weight:700;color:#22C55E">¥{{ selectedDistributor.withdrawableCommission.toLocaleString() }}</div>
            <div style="font-size:12px;color:#6B7280">可提现</div>
          </div>
        </div>

        <div style="font-size: 14px; font-weight: 600; color: #1F2937; margin-bottom: 12px;">近期佣金记录</div>
        <t-table
          v-if="selectedDistributor.commissions.length"
          :data="selectedDistributor.commissions"
          :columns="[
            { colKey: 'date', title: '日期', width: 90 },
            { colKey: 'orderNo', title: '订单号', width: 140 },
            { colKey: 'patient', title: '患者', width: 70 },
            { colKey: 'product', title: '商品' },
            { colKey: 'amount', title: '交易额', width: 80 },
            { colKey: 'rate', title: '比例', width: 60 },
            { colKey: 'commission', title: '佣金', width: 80 },
          ]"
          size="small" hover
        />
        <div v-else style="text-align:center;color:#9CA3AF;padding:40px">暂无佣金记录</div>
      </div>
    </t-drawer>
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
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #F3F4F6;
  background: #fff;
}
.panel-title {
  font-size: 16px;
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

.drawer-kpi {
  padding: 16px;
  border-radius: 8px;
}
</style>
