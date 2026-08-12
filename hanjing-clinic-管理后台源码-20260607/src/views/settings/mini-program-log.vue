<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

interface MiniProgramLog {
  id: number
  created_at: string
  level: string
  event: string
  route: string
  message: string
  api_url: string
  method: string
  status_code: number | null
  trace_id: string
  env_version: string
  platform: string
  device_model: string
  sdk_version: string
  network_type: string
  ip_address: string
  extra: any
}

const logs = ref<MiniProgramLog[]>([])
const total = ref(0)
const unfilteredTotal = ref(0)
const currentPage = ref(1)
const pageSize = ref(30)
const keyword = ref('')
const level = ref('')
const event = ref('')
const traceId = ref('')
const diagnostics = ref<any>({})
const loadError = ref('')
const loading = ref(false)

const levelOptions = [
  { label: '全部等级', value: '' },
  { label: '错误', value: 'error' },
  { label: '警告', value: 'warn' },
  { label: '信息', value: 'info' },
  { label: '调试', value: 'debug' },
]

const eventOptions = [
  { label: '全部事件', value: '' },
  { label: '服务端登录失败', value: 'login_server_failed' },
  { label: '缺少登录 code', value: 'login_missing_code' },
  { label: '点击登录按钮', value: 'login_button_tap' },
  { label: '未勾选协议', value: 'login_agreement_missing' },
  { label: '手机号授权回调', value: 'login_phone_callback' },
  { label: '手机号按钮能力失败', value: 'login_open_type_error' },
  { label: '开始登录流程', value: 'session_login_start' },
  { label: 'wx.login 成功', value: 'wx_login_success' },
  { label: 'wx.login 失败', value: 'wx_login_failed' },
  { label: 'wx.login 缺少 code', value: 'wx_login_missing_code' },
  { label: '请求登录接口', value: 'login_api_request' },
  { label: '登录接口成功', value: 'login_api_success' },
  { label: '登录成功', value: 'login_success' },
  { label: '登录失败', value: 'login_failed' },
  { label: '登录接口失败', value: 'login_api_failed' },
  { label: '登录网络失败', value: 'login_network_failed' },
  { label: '手机号授权取消', value: 'login_phone_auth_cancelled' },
  { label: '拉取个人资料', value: 'profile_request' },
  { label: '个人资料成功', value: 'profile_success' },
  { label: '个人资料失败', value: 'profile_failed' },
  { label: '接口响应失败', value: 'api_response_failed' },
  { label: '接口网络失败', value: 'api_network_failed' },
  { label: 'JS 异常', value: 'js_error' },
  { label: '网络变化', value: 'network_change' },
  { label: '应用启动', value: 'app_launch' },
]

function formatTime(value: string) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

function levelTheme(value: string) {
  if (value === 'error') return 'danger'
  if (value === 'warn') return 'warning'
  if (value === 'debug') return 'default'
  return 'primary'
}

function parseExtra(value: any) {
  if (!value) return '-'
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch (error) {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

function hasActiveFilter() {
  return Boolean(keyword.value || level.value || event.value || traceId.value)
}

function emptyTitle() {
  if (loadError.value) return '日志加载失败'
  if (hasActiveFilter() && unfilteredTotal.value > 0) return '当前筛选没有匹配日志'
  return '还没有收到小程序日志'
}

function emptyReasons() {
  if (loadError.value) {
    return [
      loadError.value,
      diagnostics.value?.tableReady === false ? '生产数据库可能还没有 mini_program_logs 表。' : '',
      diagnostics.value?.errorCode ? `错误码：${diagnostics.value.errorCode}` : '',
      '请确认生产后端已部署最新 master，并且服务已重启。',
    ].filter(Boolean)
  }
  if (hasActiveFilter() && unfilteredTotal.value > 0) {
    return [
      `当前共有 ${unfilteredTotal.value} 条小程序日志，但没有符合筛选条件的记录。`,
      '请清空等级、事件、Trace ID 或关键字后重新查看。',
    ]
  }
  return [
    '生产后端可能还没有收到小程序日志上报。',
    '请确认后端已部署最新 master，并且服务已重启执行 initDB。',
    '请确认生产数据库存在 mini_program_logs 表。',
    '如果登录失败仍无日志，请检查请求是否在 Nginx/网关层被拦截，是否进入 Node 后端。',
    '请确认后台查看的是小程序实际连接的同一套数据库。',
  ]
}

async function fetchLogs() {
  loading.value = true
  loadError.value = ''
  try {
    const res: any = await request.get('/api/admin/mini-program-logs', {
      params: {
        page: currentPage.value,
        limit: pageSize.value,
        keyword: keyword.value,
        level: level.value,
        event: event.value,
        traceId: traceId.value,
      },
    })
    logs.value = res.data?.list || []
    total.value = Number(res.data?.total || 0)
    unfilteredTotal.value = Number(res.data?.unfilteredTotal || 0)
    diagnostics.value = res.data?.diagnostics || {}
  } catch (error) {
    logs.value = []
    total.value = 0
    const err: any = error
    loadError.value = err?.response?.data?.message || err?.message || '加载小程序日志失败'
    diagnostics.value = err?.response?.data?.data?.diagnostics || {}
    MessagePlugin.error(loadError.value)
  } finally {
    loading.value = false
  }
}

watch([keyword, level, event, traceId], () => {
  currentPage.value = 1
  fetchLogs()
})

watch([currentPage, pageSize], fetchLogs)

onMounted(fetchLogs)
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">小程序日志</div>
        <div class="page-title-sub">记录小程序登录、接口请求、页面异常等排查信息。</div>
      </div>
      <t-button theme="primary" :loading="loading" @click="fetchLogs">刷新</t-button>
    </div>

    <div class="panel">
      <div class="filter-bar">
        <div class="filter-left">
          <t-input v-model="keyword" placeholder="搜索错误信息 / 接口 / IP / 用户" clearable class="filter-input" />
          <t-select v-model="level" :options="levelOptions" class="filter-select" />
          <t-select v-model="event" :options="eventOptions" class="filter-select event-select" />
          <t-input v-model="traceId" placeholder="Trace ID" clearable class="filter-trace" />
        </div>
        <div class="total-text">
          当前 {{ total }} 条<span v-if="unfilteredTotal !== total"> / 全部 {{ unfilteredTotal }} 条</span>
        </div>
      </div>

      <div v-if="diagnostics?.serverTime" class="diagnostic-bar">
        后端时间：{{ formatTime(diagnostics.serverTime) }}
        <span v-if="diagnostics.tableReady === true"> · 日志表正常</span>
        <span v-if="diagnostics.tableReady === false"> · 日志表不存在</span>
      </div>

      <div class="panel-body table-wrap">
        <table v-if="logs.length > 0" class="data-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>等级</th>
              <th>事件</th>
              <th>页面 / 接口</th>
              <th>错误信息</th>
              <th>设备</th>
              <th>Trace ID</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in logs" :key="row.id">
              <td class="muted small">{{ formatTime(row.created_at) }}</td>
              <td>
                <t-tag :theme="levelTheme(row.level)" variant="light" size="small">{{ row.level }}</t-tag>
              </td>
              <td>{{ row.event }}</td>
              <td>
                <div>{{ row.route || '-' }}</div>
                <div class="muted small">{{ row.method }} {{ row.api_url }} {{ row.status_code || '' }}</div>
              </td>
              <td class="message-cell">{{ row.message || '-' }}</td>
              <td>
                <div>{{ row.device_model || row.platform || '-' }}</div>
                <div class="muted small">{{ row.env_version }} / {{ row.network_type || '-' }} / SDK {{ row.sdk_version || '-' }}</div>
              </td>
              <td class="trace">{{ row.trace_id || '-' }}</td>
              <td>
                <t-popup placement="left" show-arrow>
                  <template #content>
                    <pre class="extra-pre">{{ parseExtra(row.extra) }}</pre>
                  </template>
                  <t-button size="small" variant="text">查看</t-button>
                </t-popup>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-else class="empty-state">
          <div class="empty-title">{{ emptyTitle() }}</div>
          <ul>
            <li v-for="item in emptyReasons()" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>

      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="total"
          :pageSizeOptions="[30, 60, 100]"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-left {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.filter-input {
  width: 300px;
}

.filter-select {
  width: 140px;
}

.event-select {
  width: 190px;
}

.filter-trace {
  width: 220px;
}

.total-text,
.muted {
  color: #6b7280;
}

.small {
  font-size: 12px;
}

.diagnostic-bar {
  padding: 10px 16px;
  border-top: 1px solid #eef2f7;
  color: #64748b;
  font-size: 13px;
}

.table-wrap {
  padding: 0;
  overflow-x: auto;
}

.message-cell {
  max-width: 280px;
  white-space: normal;
  word-break: break-word;
}

.trace {
  max-width: 140px;
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
  color: #4b5563;
}

.extra-pre {
  max-width: 520px;
  max-height: 360px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
}

.empty-state {
  padding: 48px;
  color: #475569;
}

.empty-title {
  margin-bottom: 12px;
  color: #0f172a;
  font-size: 18px;
  font-weight: 700;
}

.empty-state ul {
  margin: 0;
  padding-left: 20px;
  line-height: 1.9;
}
</style>
