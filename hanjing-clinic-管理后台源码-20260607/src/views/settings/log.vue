<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

interface LogEntry {
  id: string;
  time: string;
  operator: string;
  role: string;
  module: string;
  action: string;
  detail: string;
  ip: string;
  status: 'success' | 'fail';
}

const logs = ref<LogEntry[]>([])

/* ---- 筛选与搜索 ---- */
const searchKeyword = ref('')
const filterModule = ref('')
const filterAction = ref('')

const currentPage = ref(1)
const pageSize = ref(30)

// Reset to page 1 on filter changes
watch([searchKeyword, filterModule, filterAction], () => {
  currentPage.value = 1
})

const moduleOptions = [
  { label: '全部模块', value: '' },
  { label: '系统设置', value: '系统设置' },
  { label: '患者管理', value: '患者管理' },
  { label: '分销管理', value: '分销管理' },
  { label: '医生管理', value: '医生管理' },
  { label: '内容管理', value: '内容管理' },
  { label: '门店管理', value: '门店管理' },
]

const actionOptions = [
  { label: '全部行为', value: '' },
  { label: '修改', value: '修改' },
  { label: '新增', value: '新增' },
  { label: '查询敏感数据', value: '查询敏感数据' },
  { label: '提现审批', value: '提现审批' },
  { label: '启用账号', value: '启用账号' },
]

const actionLabels: Record<string, string> = {
  login: '登录',
  create_role: '新增角色',
  update_role: '修改角色',
  create_banner: '新增轮播图',
  update_banner: '修改轮播图',
  delete_banner: '删除轮播图',
  approve_withdraw: '提现审批',
  reject_withdraw: '提现驳回',
  approve_refund: '退款审批',
  reject_refund: '退款驳回',
  create_cashier_order: '新增收银订单',
  complete_order: '完成订单',
  notify_order_arrival: '到店通知',
  complete_consultation: '完成接诊'
}

const moduleLabels: Record<string, string> = {
  admin: '系统设置',
  role: '系统设置',
  content_banner: '内容管理',
  withdraw: '分销管理',
  order: '订单管理',
  appointment: '预约管理',
  medical_record: '患者管理',
  doctor: '医生管理',
  store: '门店管理',
  patient: '患者管理'
}

function formatTime(value: string) {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 19)
}

async function fetchLogs() {
  try {
    const res: any = await request.get('/api/admin/logs')
    logs.value = (res.data || []).map((row: any) => {
      const detailParts = []
      if (row.target_type) detailParts.push(`对象：${row.target_type}${row.target_id ? `#${row.target_id}` : ''}`)
      if (row.details) detailParts.push(`详情：${row.details}`)
      return {
        id: String(row.id),
        time: formatTime(row.created_at),
        operator: row.operator_name || row.username || '系统',
        role: row.role_name || '—',
        module: moduleLabels[row.target_type] || row.target_type || '系统',
        action: actionLabels[row.action] || row.action,
        detail: detailParts.join('；') || row.action,
        ip: '—',
        status: 'success'
      }
    })
  } catch (error) {
    MessagePlugin.error('加载操作日志失败')
  }
}

const filteredLogs = computed(() => {
  return logs.value.filter(l => {
    const matchKeyword = l.operator.includes(searchKeyword.value) || l.detail.includes(searchKeyword.value) || l.ip.includes(searchKeyword.value)
    const matchModule = !filterModule.value || l.module === filterModule.value
    const matchAction = !filterAction.value || l.action.includes(filterAction.value)
    return matchKeyword && matchModule && matchAction
  })
})

const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredLogs.value.slice(start, end)
})

onMounted(fetchLogs)
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">操作日志</div>
        <div class="page-title-sub">记录管理员在后台系统的所有关键操作，确保审计追踪与安全合规。</div>
      </div>
    </div>

    <!-- Panel Wrapper -->
    <div class="panel">
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <t-input
            v-model="searchKeyword"
            placeholder="搜索操作账号 / 操作详情 / IP 地址"
            style="width: 320px;"
            clearable
          />
          <t-select v-model="filterModule" :options="moduleOptions" placeholder="全部模块" style="width: 160px;" clearable />
          <t-select v-model="filterAction" :options="actionOptions" placeholder="全部行为" style="width: 160px;" clearable />
        </div>
        <div style="font-size: 13px; color: #9CA3AF;">
          共 {{ filteredLogs.length }} 条日志记录
        </div>
      </div>

      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="width: 180px;">操作时间</th>
              <th style="width: 180px;">操作账号</th>
              <th style="width: 120px;">操作模块</th>
              <th style="width: 130px;">行为类别</th>
              <th style="min-width: 280px;">操作详情</th>
              <th style="width: 130px;">IP 地址</th>
              <th style="width: 100px;">状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedLogs" :key="row.id">
              <td style="font-size: 12px; color: #9CA3AF;">{{ row.time }}</td>
              <td>
                <div style="font-weight: 500; color: #1F2937;">{{ row.operator }}</div>
                <div style="font-size: 11px; color: #9CA3AF;">{{ row.role }}</div>
              </td>
              <td>{{ row.module }}</td>
              <td>
                <t-tag
                  :theme="row.action.includes('修改') ? 'warning' : (row.action.includes('删除') || row.action.includes('查询敏感数据') ? 'danger' : 'primary')"
                  variant="light"
                  size="small"
                >
                  {{ row.action }}
                </t-tag>
              </td>
              <td>{{ row.detail }}</td>
              <td style="font-family: monospace; font-size: 12px; color: #6B7280;">{{ row.ip }}</td>
              <td>
                <t-tag
                  :theme="row.status === 'success' ? 'success' : 'danger'"
                  variant="light"
                  size="small"
                >
                  {{ row.status === 'success' ? '成功' : '失败' }}
                </t-tag>
              </td>
            </tr>
            <tr v-if="paginatedLogs.length === 0">
              <td colspan="7" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无匹配的操作日志记录</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredLogs.length"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
