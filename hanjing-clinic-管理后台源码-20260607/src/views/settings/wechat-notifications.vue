<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'

interface NotificationConfig {
  event: string; title: string; group: string; connected: boolean; trigger: string
  fields: Record<string, string>; enabled: boolean; templateId: string
  mapping: Record<string, string>; revision: string; source: string
}
const items = ref<NotificationConfig[]>([])
const loading = ref(false)
const error = ref('')
const group = ref('')
const tab = ref('config')
const editing = ref<NotificationConfig | null>(null)
const fieldRows = ref<{ target: string; source: string }[]>([])
const saving = ref(false)
const logs = ref<any[]>([])
const logEvent = ref('')
const page = ref(1)
const total = ref(0)
const logLoading = ref(false)
const logError = ref('')
const filtered = computed(() => items.value.filter(item => !group.value || item.group === group.value))
const groups = computed(() => [...new Set(items.value.map(item => item.group))])
const connectedCount = computed(() => items.value.filter(item => item.connected).length)
const enabledCount = computed(() => items.value.filter(item => item.connected && item.enabled && item.templateId).length)
async function load() {
  loading.value = true
  error.value = ''
  try { items.value = (await request.get<NotificationConfig[]>('/api/admin/settings/wechat-notifications')).data }
  catch { error.value = '无法读取微信通知配置，请检查账号权限及服务状态。' }
  finally { loading.value = false }
}
function edit(item: NotificationConfig) {
  editing.value = JSON.parse(JSON.stringify(item))
  fieldRows.value = Object.entries(item.mapping).map(([target, source]) => ({ target, source }))
}
async function save() {
  if (!editing.value || saving.value) return
  if (new Set(fieldRows.value.map(row => row.target.trim())).size !== fieldRows.value.length) {
    MessagePlugin.warning('微信模板字段不能重复')
    return
  }
  saving.value = true
  try {
    const current = editing.value
    const result = await request.put(`/api/admin/settings/wechat-notifications/${current.event}`, {
      enabled: current.enabled, templateId: current.templateId, revision: current.revision,
      mapping: Object.fromEntries(fieldRows.value.map(row => [row.target.trim(), row.source]))
    })
    const index = items.value.findIndex(item => item.event === current.event)
    items.value[index] = { ...current, ...result.data, source: '独立配置' }
    editing.value = null
    MessagePlugin.success('已保存通知配置')
  } catch { /* Request interceptor displays the server validation message. */ }
  finally { saving.value = false }
}
let logRequest = 0
async function loadLogs() {
  const id = ++logRequest
  logLoading.value = true
  logError.value = ''
  try {
    const result = await request.get('/api/admin/settings/wechat-notifications/logs', { params: { page: page.value, event: logEvent.value } })
    if (id !== logRequest) return
    logs.value = result.data.list
    total.value = result.data.total
  } catch { if (id === logRequest) logError.value = '发送记录读取失败，请重试。' }
  finally { if (id === logRequest) logLoading.value = false }
}
function status(item: NotificationConfig) {
  if (!item.connected) return '待接入触发点'
  if (!item.templateId) return '待配置模板'
  return item.enabled ? '已启用' : '已关闭'
}
onMounted(load)
</script>

<template>
  <div class="page-container notification-page">
    <header class="page-title-row">
      <h1 class="page-title">微信通知</h1>
      <t-tooltip content="刷新配置"><t-button variant="outline" shape="square" :loading="loading" aria-label="刷新配置" @click="load"><AppIcon name="refresh" /></t-button></t-tooltip>
    </header>
    <div class="panel notification-panel">
    <t-tabs v-model="tab" @change="() => { if (tab === 'logs') loadLogs() }">
      <t-tab-panel value="config" label="通知配置">
        <div class="filter-bar">
          <div class="filter-left">
          <t-select v-model="group" placeholder="全部业务" clearable class="business-filter">
            <t-option v-for="value in groups" :key="value" :value="value" :label="value" />
          </t-select>
          </div>
          <div class="total-text">
            <span>通知场景 <strong>{{ items.length }}</strong></span>
            <span>已有发送入口 <strong>{{ connectedCount }}</strong></span>
            <span>已启用 <strong>{{ enabledCount }}</strong></span>
          </div>
        </div>
        <div v-if="error" role="alert" class="state-message error">{{ error }} <t-button variant="text" @click="load">重试</t-button></div>
        <div v-else-if="loading" class="state-message"><t-loading size="small" /> 加载中…</div>
        <div v-else class="panel-body table-wrap">
          <table class="data-table notification-table">
            <colgroup><col style="width: 21%" /><col style="width: 29%" /><col style="width: 15%" /><col style="width: 27%" /><col style="width: 8%" /></colgroup>
            <thead><tr><th>通知 / 接收对象</th><th>触发条件</th><th>状态</th><th>模板 ID</th><th class="actions">操作</th></tr></thead>
            <tbody>
              <tr v-for="item in filtered" :key="item.event">
                <td><span class="cell-title">{{ item.title }}</span><small>{{ item.group }} · {{ item.group === '推广' ? '推广员本人' : '关联小程序用户' }}</small></td>
                <td class="trigger">{{ item.trigger }}</td>
                <td><t-tag :theme="!item.connected ? 'warning' : item.enabled && item.templateId ? 'success' : 'default'" variant="light" size="small">{{ status(item) }}</t-tag></td>
                <td class="template-id"><span class="mono">{{ item.templateId || '未配置' }}</span><small>{{ item.source }}</small></td>
                <td class="actions"><t-button theme="primary" variant="text" size="small" @click="edit(item)">配置</t-button></td>
              </tr>
              <tr v-if="!filtered.length"><td colspan="5" class="empty-cell">暂无通知配置</td></tr>
            </tbody>
          </table>
        </div>
      </t-tab-panel>
      <t-tab-panel value="logs" label="发送记录">
        <div class="filter-bar">
          <div class="filter-left">
          <t-select v-model="logEvent" clearable placeholder="全部通知" class="business-filter" @change="() => { page = 1; loadLogs() }">
            <t-option v-for="item in items" :key="item.event" :value="item.event" :label="item.title" />
          </t-select>
          <t-tooltip content="刷新记录"><t-button variant="outline" shape="square" :loading="logLoading" aria-label="刷新记录" @click="loadLogs"><AppIcon name="refresh" /></t-button></t-tooltip>
          </div>
          <div class="total-text">共 {{ total }} 条记录</div>
        </div>
        <div v-if="logError" class="state-message error" role="alert">{{ logError }}</div>
        <div class="panel-body table-wrap" :aria-busy="logLoading">
          <table class="data-table log-table">
            <thead><tr><th>时间</th><th>通知</th><th>用户ID</th><th>业务标识</th><th>发送结果</th><th>失败原因</th></tr></thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id">
                <td class="muted">{{ formatShanghaiDateTime(log.sent_at) }}</td><td>{{ items.find(item => item.event === log.event)?.title || log.event }}</td>
                <td>{{ log.user_id }}</td><td class="mono">{{ log.business_id }}</td>
                <td><t-tag :theme="log.status === 'sent' ? 'success' : log.status === 'failed' ? 'danger' : 'default'" variant="light" size="small">{{ log.status === 'sent' ? '微信接口受理' : log.status === 'failed' ? '发送失败' : '未发送' }}</t-tag></td>
                <td class="log-error">{{ log.error_message || '—' }}</td>
              </tr>
              <tr v-if="!logs.length"><td colspan="6" class="empty-cell">{{ logLoading ? '加载中…' : '暂无发送记录' }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination-footer"><t-pagination v-model:current="page" :total="total" :page-size="20" :show-page-size="false" @current-change="loadLogs" /></div>
      </t-tab-panel>
    </t-tabs>
    </div>
    <t-dialog :visible="!!editing" :header="editing?.title" width="min(720px, calc(100vw - 32px))" :close-on-overlay-click="false" @close="() => { if (!saving) editing = null }">
      <form v-if="editing" id="notification-config-form" @submit.prevent="save">
        <t-alert v-if="!editing.connected" theme="warning" message="发送触发点尚未接入，目前仅可保存模板配置。" />
        <div class="form-row"><label>启用通知</label><t-switch v-model="editing.enabled" :disabled="!editing.connected || saving" /></div>
        <div class="form-row"><label for="template-id">模板 ID</label><t-input id="template-id" v-model="editing.templateId" :maxlength="128" :disabled="saving" /></div>
        <h3>模板字段</h3>
        <div class="field-heading"><span>微信字段名</span><span>业务数据来源</span></div>
        <div v-for="(field, index) in fieldRows" :key="index" class="field-row">
          <t-input v-model="field.target" :disabled="saving" :aria-label="`微信字段名${index + 1}`" />
          <t-select v-model="field.source" :disabled="saving" :aria-label="`业务数据来源${index + 1}`">
            <t-option v-for="(label, value) in editing.fields" :key="value" :value="value" :label="`${label} (${value})`" />
          </t-select>
          <t-tooltip content="删除字段"><t-button shape="square" variant="text" :disabled="saving || fieldRows.length <= 1" aria-label="删除字段" @click="fieldRows.splice(index, 1)"><AppIcon name="close" /></t-button></t-tooltip>
        </div>
        <t-button variant="outline" :disabled="saving || fieldRows.length >= 10" @click="fieldRows.push({ target: '', source: Object.keys(editing.fields)[0] })"><AppIcon name="plus" /> 添加字段</t-button>
      </form>
      <template #footer><div class="dialog-actions"><t-button variant="outline" :disabled="saving" @click="editing = null">取消</t-button><t-button type="submit" form="notification-config-form" :loading="saving">保存</t-button></div></template>
    </t-dialog>
  </div>
</template>

<style scoped>
.notification-page, .notification-panel { min-width: 0; }
.page-title { margin: 0; }
.page-title-row { flex-wrap: wrap; gap: 12px; }
.notification-panel :deep(.t-tabs__nav-container) { padding: 0 20px; }
.notification-panel :deep(.t-tabs__nav-item) { font-size: 14px; }
.filter-left, .total-text, .dialog-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.business-filter { width: 200px; max-width: 100%; }
.total-text { font-size: 12px; color: #9CA3AF; gap: 16px; }
.total-text strong { color: #374151; font-weight: 600; }
.table-wrap { padding: 0; }
.notification-table { table-layout: fixed; min-width: 900px; }
.log-table { min-width: 900px; }
.notification-table th, .log-table th { letter-spacing: 0 !important; }
.notification-table td.trigger, .notification-table td.template-id, .log-table td.log-error { white-space: normal !important; overflow-wrap: anywhere; line-height: 1.6; }
.cell-title { font-weight: 500; color: #1F2937; }
small { display: block; color: #9CA3AF; margin-top: 4px; font-size: 12px; }
.mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
.muted { color: #9CA3AF !important; font-size: 12px !important; }
.actions { text-align: right !important; }
.data-table td.empty-cell { text-align: center; color: #9CA3AF !important; padding: 48px 16px !important; }
.state-message { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 48px 20px; color: #9CA3AF; }
.state-message.error { color: #d54941; }
.form-row { display: grid; grid-template-columns: 100px minmax(0, 1fr); align-items: center; gap: 12px; margin: 24px 0; font-size: 14px; }
.form-row :deep(.t-switch) { justify-self: start; }
h3 { font-size: 14px; font-weight: 600; margin: 24px 0 16px; color: #1F2937; }
.field-row, .field-heading { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 32px; gap: 12px; margin-bottom: 12px; }
.field-heading { color: #9CA3AF; font-size: 12px; }
.dialog-actions { justify-content: flex-end; }
@media (max-width: 640px) { .total-text { gap: 8px 16px; } .form-row { grid-template-columns: 80px minmax(0, 1fr); } }
</style>
