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
const totalLogs = ref(0)

/* ---- 筛选与搜索 ---- */
const searchKeyword = ref('')
const filterModule = ref('')
const filterAction = ref('')

const currentPage = ref(1)
const pageSize = ref(30)

// Reset to page 1 on filter changes
watch([searchKeyword, filterModule, filterAction], () => {
  currentPage.value = 1
  fetchLogs()
})

// Fetch logs on page changes
watch([currentPage, pageSize], () => {
  fetchLogs()
})

const moduleOptions = [
  { label: '全部模块', value: '' },
  { label: '系统设置', value: 'admin,role,system' },
  { label: '患者管理', value: 'patient,medical_record,follow_up_task,device_adjustment' },
  { label: '分销管理', value: 'withdraw,promoter,product' },
  { label: '医生管理', value: 'doctor' },
  { label: '内容管理', value: 'content_banner,community_post,article_category' },
  { label: '门店管理', value: 'store' },
  { label: '订单管理', value: 'order' },
  { label: '预约管理', value: 'appointment' },
]

const actionOptions = [
  { label: '全部行为', value: '' },
  { label: '系统登录', value: 'login' },
  { label: '新建角色', value: 'create_role' },
  { label: '修改角色', value: 'update_role' },
  { label: '提现审批', value: 'approve_withdraw' },
  { label: '提现驳回', value: 'reject_withdraw' },
  { label: '退款审批', value: 'approve_refund' },
  { label: '退款驳回', value: 'reject_refund' },
  { label: '到店通知', value: 'notify_order_arrival' },
  { label: '完成订单', value: 'complete_order' },
  { label: '完成接诊', value: 'complete_consultation' },
  { label: '新建账号', value: 'create_admin' },
  { label: '更新账号', value: 'update_admin' },
  { label: '新建医生', value: 'create_doctor' },
  { label: '更新医生', value: 'update_doctor' },
  { label: '创建门店', value: 'create_store' },
  { label: '更新门店', value: 'update_store' },
  { label: '订单发货', value: 'ship_order' },
  { label: '患者建档', value: 'create_patient' },
  { label: '跟进记录', value: 'create_crm_record' }
]

const actionLabels: Record<string, string> = {
  login: '系统登录',
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
  complete_consultation: '完成接诊',
  create_admin: '新建账号',
  update_admin: '更新账号',
  create_doctor: '新建医生',
  update_doctor: '更新医生',
  disable_doctor: '停用医生',
  create_store: '创建门店',
  update_store: '更新门店',
  disable_store: '停用门店',
  ship_order: '订单发货',
  create_patient: '患者建档',
  update_patient: '更新患者',
  create_crm_record: '新增跟进',
  create_schedule: '维护排班',
  batch_create_schedule: '批量排班',
  copy_last_month_schedule: '复制排班',
  reschedule_appointment: '预约改约',
  create_appointment: '新建预约',
  update_medical_record_attachments: '更新病历附件',
  create_medical_record: '新建病历',
  save_consultation: '暂存接诊',
  create_device_adjustment: '调整器械参数',
  update_follow_up: '跟进随访',
  update_settings: '修改系统设置',
  create_product: '新建商品',
  update_product: '更新商品',
  create_article: '新建文章',
  update_article: '更新文章',
  delete_article: '删除文章',
  create_article_category: '新建文章分类',
  update_article_category: '更新文章分类',
  delete_article_category: '删除文章分类',
  bind_patient_promoter: '绑定推广员',
  send_im_message: '发送客服消息'
}

const moduleLabels: Record<string, string> = {
  admin: '系统设置',
  role: '系统设置',
  system: '系统设置',
  content_banner: '内容管理',
  community_post: '内容管理',
  article_category: '内容管理',
  withdraw: '分销管理',
  promoter: '分销管理',
  order: '订单管理',
  appointment: '预约管理',
  medical_record: '患者管理',
  doctor: '医生管理',
  store: '门店管理',
  patient: '患者管理',
  follow_up_task: '患者管理',
  device_adjustment: '患者管理',
  product: '分销管理'
}

function formatTime(value: string) {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 19)
}

async function fetchLogs() {
  try {
    const res: any = await request.get('/api/admin/logs', {
      params: {
        page: currentPage.value,
        limit: pageSize.value,
        keyword: searchKeyword.value,
        module: filterModule.value,
        action: filterAction.value
      }
    })
    
    const list = res.data?.list || []
    totalLogs.value = res.data?.total || 0
    
    logs.value = list.map((row: any) => {
      const detailParts = []
      if (row.target_type) {
        detailParts.push(`对象：${moduleLabels[row.target_type] || row.target_type}${row.target_id ? `#${row.target_id}` : ''}`)
      }
      if (row.details) {
        let detailsText = row.details
        try {
          const parsed = JSON.parse(row.details)
          if (parsed && typeof parsed === 'object') {
            detailsText = Object.entries(parsed).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')
          }
        } catch (e) {}
        detailParts.push(`详情：${detailsText}`)
      }
      if (row.error_message) {
        detailParts.push(`失败原因：${row.error_message}`)
      }
      
      return {
        id: String(row.id),
        time: formatTime(row.created_at),
        operator: row.operator_name || row.username || '系统',
        role: row.role_name || '—',
        module: moduleLabels[row.target_type] || row.target_type || '系统',
        action: actionLabels[row.action] || row.action,
        detail: detailParts.join('；') || row.action,
        ip: row.ip_address || '—',
        status: row.status || 'success'
      }
    })
  } catch (error) {
    MessagePlugin.error('加载操作日志失败')
  }
}

const filteredLogs = computed(() => logs.value)
const paginatedLogs = computed(() => logs.value)

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
          共 {{ totalLogs }} 条日志记录
        </div>
      </div>

      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>操作时间</th>
              <th>操作账号</th>
              <th>操作模块</th>
              <th>行为类别</th>
              <th>操作详情</th>
              <th>IP 地址</th>
              <th>状态</th>
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
                  :theme="row.action.includes('修改') || row.action.includes('更新') || row.action.includes('改约') || row.action.includes('调整') ? 'warning' : (row.action.includes('删除') || row.action.includes('停用') || row.action.includes('驳回') ? 'danger' : (row.action.includes('新建') || row.action.includes('创建') || row.action.includes('新增') || row.action.includes('维护') || row.action.includes('批量') ? 'primary' : 'success'))"
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
          :total="totalLogs"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
