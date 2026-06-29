<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

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

const distributors = ref<Distributor[]>([])

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

function levelLabel(level: string) {
  if (level === 'diamond') return '钻石'
  if (level === 'gold') return '金牌'
  if (level === 'silver') return '银牌'
  return '青铜'
}

function formatDate(value: string) {
  if (!value) return '—'
  return value.slice(0, 10)
}

function yuan(value: number) {
  return Number(value || 0) / 100
}

async function fetchDistributors() {
  try {
    const res: any = await request.get('/api/admin/distribution/promoters')
    distributors.value = (res.data || []).map((row: any) => ({
      id: String(row.id),
      name: row.nickname || '推广员',
      phone: row.user_phone || '',
      level: levelLabel(row.level),
      firstLevelDownline: Number(row.invitees_count || 0),
      secondLevelDownline: 0,
      totalOrders: 0,
      totalAmount: 0,
      totalCommission: yuan(row.total_commission),
      withdrawableCommission: yuan(row.available_commission),
      joinDate: formatDate(row.created_at),
      source: '用户申请',
      status: row.status || 'active',
      commissions: []
    }))
  } catch (error) {
    MessagePlugin.error('加载推广员列表失败')
  }
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
  if (level === '钻石') return 'gem'
  if (level === '金牌') return 'medal-gold'
  if (level === '银牌') return 'medal-silver'
  return 'medal-bronze'
}

onMounted(fetchDistributors)

const operationColumnWidth = computed(() => {
  if (paginatedDistributors.value.length === 0) return '80px'
  return '140px'
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
        <div class="page-title">推广员管理</div>
        <div class="page-title-sub">管理分销推广渠道与推广人员</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-outline" @click="handleExport"><AppIcon name="download" />  导出报表</button>
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
          placeholder="搜索姓名/手机号" 
          style="width: 180px;"
        >
      </div>

      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>推广员</th>
              <th>等级</th>
              <th>一级下线</th>
              <th>二级下线</th>
              <th>推广订单</th>
              <th>累计佣金</th>
              <th>可提现</th>
              <th>状态</th>
              <th :style="{ width: operationColumnWidth, minWidth: operationColumnWidth, textAlign: 'right' }">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedDistributors" :key="row.id">
              <td>
                <div class="name-cell" style="min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 8px;">
                  <div class="avatar-sm" :style="{ background: getAvatarBg(row.level), flexShrink: 0 }">
                    {{ row.name.substring(0, 1) }}
                  </div>
                  <div style="min-width: 0; overflow: hidden; display: flex; flex-direction: column;">
                    <div style="font-weight:600;color:#1F2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ row.name }}</div>
                    <div style="font-size:11px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ row.phone }}</div>
                  </div>
                </div>
              </td>
              <td>
                <span :style="getLevelStyle(row.level)">
                  <AppIcon :name="getLevelEmoji(row.level)" /> {{ row.level }}
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
