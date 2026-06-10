<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'

const router = useRouter()

// Filter states matching UI mockup
const activeTab = ref('today') // Default to 'today' (今日) as per UI mockup
const filterStore = ref('全部门店')
const filterDoctor = ref('全部医生')
const filterDate = ref('2026-05-29') // Default to '2026-05-29' as per UI mockup
const searchKeyword = ref('')

const currentPage = ref(1)
const pageSize = ref(30)

interface Appointment {
  id: string;
  no: string;
  patient: string;
  phone: string;
  avatarChar: string;
  avatarColor: string;
  store: string;
  doctor: string;
  date: string;
  time: string;
  type: string;
  source: string;
  status: string;
}

const baseAppointments = [
  { id: '1', no: 'BK20260529001', patient: '张明华', phone: '13886666789', avatarChar: '张', avatarColor: '#3B6BF5', store: '龙岗总店', doctor: '古堪民', date: '2026-05-29', time: '09:30', type: '复诊', source: '小程序', status: 'arrived' },
  { id: '2', no: 'BK20260529002', patient: '李雪琴', phone: '13998882345', avatarChar: '李', avatarColor: '#9333EA', store: '龙岗总店', doctor: '王志远', date: '2026-05-29', time: '10:00', type: '初诊', source: '电话', status: 'waiting' },
  { id: '3', no: 'BK20260529003', patient: '陈建国', phone: '13556788901', avatarChar: '陈', avatarColor: '#F59E0B', store: '福田门诊部', doctor: '古堪民', date: '2026-05-29', time: '10:30', type: '复诊', source: '小程序', status: 'pending' },
  { id: '4', no: 'BK20260529004', patient: '周小燕', phone: '13667895678', avatarChar: '周', avatarColor: '#10B981', store: '南山分院', doctor: '刘婉清', date: '2026-05-29', time: '11:00', type: '初诊', source: '到店', status: 'cancelled' },
  { id: '5', no: 'BK20260529005', patient: '吴佳佳', phone: '13778903456', avatarChar: '吴', avatarColor: '#EC4899', store: '龙岗总店', doctor: '王志远', date: '2026-05-29', time: '14:00', type: '复诊', source: '分销推广', status: 'waiting' }
]

const appointments = ref<Appointment[]>(
  Array.from({ length: 42 }, (_, index) => {
    const base = baseAppointments[index % baseAppointments.length]
    // Generate dates: first 15 items on '2026-05-29' for default active 'today' filter
    const isToday = index < 15
    const date = isToday ? '2026-05-29' : `2026-05-${String(30 + (index % 2)).padStart(2, '0')}`
    return {
      ...base,
      id: String(index + 1),
      no: `BK202605${isToday ? '29' : '30'}0${String(index + 1).padStart(2, '0')}`,
      patient: base.patient + (index === 0 ? '' : `-${index + 1}`),
      date,
      status: index % 6 === 0 ? 'arrived' : (index % 6 === 1 || index % 6 === 4 ? 'waiting' : (index % 6 === 2 ? 'pending' : 'cancelled'))
    }
  })
)

const storeOptions = [
  { label: '全部门店', value: '全部门店' },
  { label: '龙岗总店', value: '龙岗总店' },
  { label: '南山分院', value: '南山分院' },
  { label: '福田门诊部', value: '福田门诊部' },
]

const doctorOptions = [
  { label: '全部医生', value: '全部医生' },
  { label: '古堪民', value: '古堪民' },
  { label: '王志远', value: '王志远' },
  { label: '刘婉清', value: '刘婉清' },
]

const tabOptions = [
  { label: '全部', value: 'all' },
  { label: '今日', value: 'today' },
  { label: '待确认', value: 'pending' },
  { label: '候诊中', value: 'waiting' },
  { label: '已取消', value: 'cancelled' },
]

const statusMap: Record<string, { label: string; theme: string }> = {
  arrived: { label: '已到诊', theme: 'success' },
  waiting: { label: '候诊中', theme: 'primary' },
  pending: { label: '待确认', theme: 'warning' },
  cancelled: { label: '已取消', theme: 'danger' }
}

const counts = computed(() => {
  const list = appointments.value
  const todayStr = '2026-05-29'
  return {
    all: list.length,
    today: list.filter(a => a.date === todayStr).length,
    pending: list.filter(a => a.status === 'pending').length,
    waiting: list.filter(a => a.status === 'waiting').length,
    cancelled: list.filter(a => a.status === 'cancelled').length,
  }
})

watch([activeTab, filterStore, filterDoctor, filterDate, searchKeyword], () => {
  currentPage.value = 1
})

function getFilteredAppointments() {
  let list = appointments.value

  // 1. Tab filter
  if (activeTab.value === 'today') {
    list = list.filter(a => a.date === '2026-05-29')
  } else if (activeTab.value === 'pending') {
    list = list.filter(a => a.status === 'pending')
  } else if (activeTab.value === 'waiting') {
    list = list.filter(a => a.status === 'waiting')
  } else if (activeTab.value === 'cancelled') {
    list = list.filter(a => a.status === 'cancelled')
  }

  // 2. Search Keyword
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(a => a.patient.includes(kw) || a.no.toLowerCase().includes(kw))
  }

  // 3. Store filter
  if (filterStore.value && filterStore.value !== '全部门店') {
    list = list.filter(a => a.store === filterStore.value)
  }

  // 4. Doctor filter
  if (filterDoctor.value && filterDoctor.value !== '全部医生') {
    list = list.filter(a => a.doctor === filterDoctor.value)
  }

  // 5. Date filter
  if (filterDate.value) {
    list = list.filter(a => a.date === filterDate.value)
  }

  return list
}

const paginatedAppointments = computed(() => {
  const filtered = getFilteredAppointments()
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
})

function formatDateTime(dateStr: string, timeStr: string) {
  if (!dateStr) return timeStr
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    const month = parseInt(parts[1], 10)
    const day = parseInt(parts[2], 10)
    return `${month}/${day} ${timeStr}`
  }
  return `${dateStr} ${timeStr}`
}

function confirmStatus(id: string) {
  const idx = appointments.value.findIndex(a => a.id === id)
  if (idx >= 0) {
    appointments.value[idx].status = 'arrived'
    MessagePlugin.success(`已成功确认预约单号 ${appointments.value[idx].no}`)
  }
}

function cancelStatus(id: string) {
  const idx = appointments.value.findIndex(a => a.id === id)
  if (idx >= 0) {
    appointments.value[idx].status = 'cancelled'
    MessagePlugin.success(`已取消预约单号 ${appointments.value[idx].no}`)
  }
}

</script>

<template>
  <div class="page-container">
    <!-- Header aligned with UI mockup -->
    <div class="page-title-row">
      <div>
        <div class="page-title">预约管理</div>
        <div class="page-title-sub">管理所有预约挂号记录</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <t-button theme="default" variant="outline">📥 导出</t-button>
        <t-button theme="primary" @click="router.push('/appointment/create')">➕ 新建预约</t-button>
      </div>
    </div>

    <!-- Panel Wrapper -->
    <div class="panel">
      <!-- Filter panel with Status Tabs (Left) and Dropdowns (Right) -->
      <div class="filter-bar">
        <!-- Left: Filter Tabs -->
        <div style="display: flex; gap: 8px;">
          <div
            v-for="tab in tabOptions"
            :key="tab.value"
            @click="activeTab = tab.value"
            :style="{
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === tab.value ? '600' : '400',
              background: activeTab === tab.value ? '#3B6BF5' : '#F3F4F6',
              color: activeTab === tab.value ? '#FFFFFF' : '#4B5563',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === tab.value ? '0 2px 6px rgba(59, 107, 245, 0.2)' : 'none'
            }"
          >
            {{ tab.label }}
            <span :style="{ opacity: activeTab === tab.value ? '0.9' : '0.6', fontSize: '11px', fontWeight: '500' }">
              {{ counts[tab.value] }}
            </span>
          </div>
        </div>

        <!-- Right: Dropdowns and Search -->
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <t-input
            v-model="searchKeyword"
            placeholder="搜索患者/预约单号"
            clearable
            style="width: 180px;"
          />
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; color: #4B5563;">门店</span>
            <t-select v-model="filterStore" :options="storeOptions" style="width: 125px;" />
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; color: #4B5563;">医生</span>
            <t-select v-model="filterDoctor" :options="doctorOptions" style="width: 110px;" />
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 13px; color: #4B5563;">日期</span>
            <t-date-picker v-model="filterDate" style="width: 135px;" clearable placeholder="选择日期" />
          </div>
        </div>
      </div>

      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="width: 140px;">预约单号</th>
              <th style="width: 180px;">患者</th>
              <th style="width: 120px;">门店</th>
              <th style="width: 100px;">医生</th>
              <th style="width: 140px;">预约时间</th>
              <th style="width: 90px;">来源</th>
              <th style="width: 100px;">状态</th>
              <th style="width: 210px; min-width: 210px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedAppointments" :key="row.id" @click="router.push('/appointment/detail/' + row.id)" style="cursor: pointer;">
              <td style="font-family: monospace; font-weight: 600; color: var(--primary-500);">{{ row.no }}</td>
              <td>
                <div style="display: flex; align-items: center; gap: 10px;" @click.stop>
                  <t-avatar size="32px" :style="{ background: row.avatarColor }">
                    {{ row.avatarChar }}
                  </t-avatar>
                  <div>
                    <div style="font-weight: 600; color: #1F2937; line-height: 1.4;">{{ row.patient }}</div>
                    <div style="font-size: 11px; color: #9CA3AF; line-height: 1.2;">{{ row.phone }}</div>
                  </div>
                </div>
              </td>
              <td>{{ row.store }}</td>
              <td>{{ row.doctor }}</td>
              <td style="font-size: 12px;">{{ formatDateTime(row.date, row.time) }}</td>
              <td>
                <t-tag size="small" variant="light" :theme="row.source === '小程序' ? 'success' : 'primary'">
                  {{ row.source }}
                </t-tag>
              </td>
              <td>
                <t-tag
                  :theme="statusMap[row.status]?.theme || 'default'"
                  size="small"
                  variant="light"
                >
                  {{ statusMap[row.status]?.label || row.status }}
                </t-tag>
              </td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;" @click.stop>
                  <button class="btn btn-xs btn-outline" @click="router.push('/appointment/detail/' + row.id)">详情</button>
                  <button
                    v-if="row.status === 'pending' || row.status === 'waiting'"
                    class="btn btn-xs btn-success"
                    @click="confirmStatus(row.id)"
                  >确认</button>
                  <button
                    v-if="row.status === 'pending'"
                    class="btn btn-xs btn-danger"
                    @click="cancelStatus(row.id)"
                  >取消</button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedAppointments.length === 0">
              <td colspan="8" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无匹配的预约记录数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="getFilteredAppointments().length"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>
  </div>
</template>

