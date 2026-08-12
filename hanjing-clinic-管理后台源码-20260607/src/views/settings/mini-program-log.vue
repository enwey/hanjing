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
  nickname: string
  extra: string
}

const logs = ref<MiniProgramLog[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(30)
const keyword = ref('')
const level = ref('')
const event = ref('')
const traceId = ref('')

const levelOptions = [
  { label: '全部等级', value: '' },
  { label: '错误', value: 'error' },
  { label: '警告', value: 'warn' },
  { label: '信息', value: 'info' },
  { label: '调试', value: 'debug' },
]

const eventOptions = [
  { label: '全部事件', value: '' },
  { label: '登录失败', value: 'login_failed' },
  { label: '登录接口失败', value: 'login_api_failed' },
  { label: '登录网络失败', value: 'login_network_failed' },
  { label: '手机号授权取消', value: 'login_phone_auth_cancelled' },
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

function parseExtra(value: string) {
  if (!value) return '-'
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch (error) {
    return value
  }
}

async function fetchLogs() {
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
  } catch (error) {
    MessagePlugin.error('加载小程序日志失败')
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
      <t-button theme="primary" @click="fetchLogs">刷新</t-button>
    </div>

    <div class="panel">
      <div class="filter-bar">
        <div class="filter-left">
          <t-input v-model="keyword" placeholder="搜索错误信息 / 接口 / IP / 用户" clearable class="filter-input" />
          <t-select v-model="level" :options="levelOptions" class="filter-select" />
          <t-select v-model="event" :options="eventOptions" class="filter-select event-select" />
          <t-input v-model="traceId" placeholder="Trace ID" clearable class="filter-trace" />
        </div>
        <div class="total-text">共 {{ total }} 条</div>
      </div>

      <div class="panel-body table-wrap">
        <table class="data-table">
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
            <tr v-if="logs.length === 0">
              <td colspan="8" class="empty-cell">暂无小程序日志</td>
            </tr>
          </tbody>
        </table>
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

.empty-cell {
  padding: 40px 0;
  color: #9ca3af;
  text-align: center;
}
</style>
