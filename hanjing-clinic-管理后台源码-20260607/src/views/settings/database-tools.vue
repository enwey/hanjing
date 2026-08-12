<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'

interface TableColumn {
  name: string
  type: string
  dataType: string
  nullable: boolean
  defaultValue: string | null
  key: string
  extra: string
  comment: string
  ordinalPosition: number
}

interface TableSchema {
  name: string
  comment: string
  engine: string
  rowCount: number
  createTime: string
  updateTime: string
  columns: TableColumn[]
}

const router = useRouter()
const userInfo = ref<any>({})
const loadingSchema = ref(false)
const runningSql = ref(false)
const databaseName = ref('')
const tables = ref<TableSchema[]>([])
const selectedTableName = ref('')
const tableKeyword = ref('')
const sqlText = ref('SHOW TABLES')
const sqlResult = ref<any>(null)
const tableIndexExpanded = ref(true)

const filteredTables = computed(() => {
  const keyword = String(tableKeyword.value || '').trim().toLowerCase()
  if (!keyword) return tables.value
  return tables.value.filter((table) => {
    return table.name.toLowerCase().includes(keyword) || String(table.comment || '').toLowerCase().includes(keyword)
  })
})

const tableNames = computed(() => tables.value.map((item) => item.name))

const selectedTable = computed(() => {
  const current = tables.value.find((item) => item.name === selectedTableName.value)
  return current || filteredTables.value[0] || null
})

function formatDateTime(value: string) {
  if (!value) return '—'
  return formatShanghaiDateTime(value)
}

function looksLikeDateTime(value: any) {
  const text = String(value || '').trim()
  if (!text) return false
  return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(text) || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text)
}

function formatSqlCell(column: string, value: any) {
  if (value === null || value === undefined) return 'NULL'
  if (looksLikeDateTime(value)) {
    return formatDateTime(String(value))
  }
  return value
}

function ensureSuperAdminAccess() {
  try {
    userInfo.value = JSON.parse(localStorage.getItem('user_info') || '{}')
  } catch (error) {
    userInfo.value = {}
  }
  if (userInfo.value?.role_code !== 'super_admin') {
    MessagePlugin.error('只有超级管理员可以访问数据库工具')
    router.replace('/dashboard')
    return false
  }
  return true
}

async function fetchSchema() {
  loadingSchema.value = true
  try {
    const res: any = await request.get('/api/admin/database/schema')
    const data = res.data || {}
    databaseName.value = data.database || ''
    tables.value = Array.isArray(data.tables) ? data.tables : []
    if (!selectedTableName.value || !tables.value.some((item) => item.name === selectedTableName.value)) {
      selectedTableName.value = tables.value[0]?.name || ''
    }
  } catch (error) {
    MessagePlugin.error('加载数据库结构失败')
  } finally {
    loadingSchema.value = false
  }
}

async function runSql() {
  const sql = String(sqlText.value || '').trim()
  if (!sql) {
    MessagePlugin.warning('请输入 SQL 语句')
    return
  }
  runningSql.value = true
  try {
    const res: any = await request.post('/api/admin/database/query', { sql })
    sqlResult.value = res.data || null
    MessagePlugin.success('SQL 执行成功')
    await fetchSchema()
  } catch (error) {
    sqlResult.value = null
  } finally {
    runningSql.value = false
  }
}

function useTemplate(sql: string) {
  sqlText.value = sql
}

onMounted(async () => {
  if (!ensureSuperAdminAccess()) return
  await fetchSchema()
})
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">数据库工具</div>
        <div class="page-title-sub">查看表结构、字段说明，并执行只读查询 SQL。</div>
      </div>
      <div class="header-actions">
        <div class="db-tag">当前库：{{ databaseName || '—' }}</div>
        <button class="btn btn-outline" :disabled="loadingSchema" @click="fetchSchema">刷新结构</button>
      </div>
    </div>

    <div class="database-layout">
      <div class="panel sidebar-panel">
        <div class="panel-header">
        <div class="panel-title">表结构</div>
          <div class="panel-subtitle">共 {{ tables.length }} 张表，不搜索时默认显示全部</div>
        </div>
        <div class="panel-body sidebar-body">
          <t-input v-model="tableKeyword" clearable placeholder="搜索表名 / 说明" />
          <div class="sidebar-tip">当前已加载全部表，支持直接滚动选择，也可以搜索定位。</div>
          <div class="table-list">
            <button
              v-for="table in filteredTables"
              :key="table.name"
              class="table-list-item"
              :class="{ active: selectedTableName === table.name }"
              @click="selectedTableName = table.name"
            >
              <div class="table-name">{{ table.name }}</div>
              <div class="table-comment">{{ table.comment || '暂无表说明' }}</div>
            </button>
          </div>
        </div>
      </div>

      <div class="content-column">
        <div class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">全部表索引</div>
              <div class="panel-subtitle">点击表名可直接跳到对应结构，不需要先知道表名再搜索。</div>
            </div>
            <button class="btn btn-outline btn-xs" @click="tableIndexExpanded = !tableIndexExpanded">
              {{ tableIndexExpanded ? '收起' : '展开' }}
            </button>
          </div>
          <div v-if="tableIndexExpanded" class="panel-body table-index-body">
            <button
              v-for="name in tableNames"
              :key="name"
              class="table-chip"
              :class="{ active: selectedTableName === name }"
              @click="selectedTableName = name"
            >
              {{ name }}
            </button>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">{{ selectedTable?.name || '请选择表' }}</div>
              <div class="panel-subtitle">{{ selectedTable?.comment || '暂无表说明' }}</div>
            </div>
            <div class="table-meta" v-if="selectedTable">
              <span>引擎：{{ selectedTable.engine || '—' }}</span>
              <span>预估行数：{{ selectedTable.rowCount ?? 0 }}</span>
              <span>更新时间：{{ formatDateTime(selectedTable.updateTime) }}</span>
            </div>
          </div>
          <div class="panel-body table-structure-wrap">
            <table v-if="selectedTable" class="data-table">
              <thead>
                <tr>
                  <th>字段名</th>
                  <th>类型</th>
                  <th>允许空</th>
                  <th>键</th>
                  <th>默认值</th>
                  <th>额外</th>
                  <th>字段说明</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="column in selectedTable.columns" :key="column.name">
                  <td class="mono">{{ column.name }}</td>
                  <td class="mono">{{ column.type }}</td>
                  <td>{{ column.nullable ? '是' : '否' }}</td>
                  <td>{{ column.key || '—' }}</td>
                  <td class="mono">{{ column.defaultValue ?? '—' }}</td>
                  <td class="mono">{{ column.extra || '—' }}</td>
                  <td>{{ column.comment || '—' }}</td>
                </tr>
              </tbody>
            </table>
            <div v-else class="empty-box">暂无表结构数据</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <div>
              <div class="panel-title">SQL 执行台</div>
              <div class="panel-subtitle">只支持单条只读查询语句，例如 SELECT / SHOW / DESC / EXPLAIN。</div>
            </div>
            <div class="template-actions">
              <button class="btn btn-outline btn-xs" @click="useTemplate('SHOW TABLES')">SHOW TABLES</button>
              <button class="btn btn-outline btn-xs" @click="useTemplate(`DESC ${selectedTable?.name || 'users'}`)">DESC</button>
              <button class="btn btn-outline btn-xs" @click="useTemplate(`SELECT * FROM ${selectedTable?.name || 'users'} LIMIT 20`)">SELECT</button>
            </div>
          </div>
          <div class="panel-body sql-body">
            <textarea v-model="sqlText" class="sql-editor" spellcheck="false" placeholder="请输入单条只读查询 SQL"></textarea>
            <div class="sql-actions">
              <button class="btn btn-primary" :disabled="runningSql" @click="runSql">执行 SQL</button>
            </div>

            <div v-if="sqlResult" class="result-wrap">
              <div class="result-summary">
                <template v-if="sqlResult.mode === 'rows'">
                  返回 {{ sqlResult.rowCount }} 行
                  <span v-if="sqlResult.truncated">，当前仅展示前 500 行</span>
                </template>
                <template v-else>
                  执行完成，影响 {{ sqlResult.affectedRows }} 行
                  <span v-if="sqlResult.insertId">，新增 ID：{{ sqlResult.insertId }}</span>
                </template>
              </div>

              <div v-if="sqlResult.mode === 'rows'" class="result-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th v-for="column in sqlResult.columns" :key="column" class="mono">{{ column }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, index) in sqlResult.rows" :key="index">
                      <td v-for="column in sqlResult.columns" :key="column" class="mono-cell">
                        {{ formatSqlCell(column, row[column]) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <pre v-else class="result-json">{{ JSON.stringify(sqlResult, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.database-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
}

.sidebar-panel {
  margin: 0;
}

.sidebar-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.db-tag {
  padding: 8px 12px;
  border-radius: 999px;
  background: #eef4ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 600;
}

.table-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 270px);
  overflow-y: auto;
}

.sidebar-tip {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
}

.table-list-item {
  width: 100%;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 12px;
  text-align: left;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.table-list-item:hover,
.table-list-item.active {
  border-color: #3b82f6;
  background: #f8fbff;
}

.table-name {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.table-comment {
  margin-top: 4px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
}

.content-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.table-index-body {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 16px;
}

.table-chip {
  border: 1px solid #dbe4f0;
  background: #fff;
  color: #334155;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}

.table-chip:hover,
.table-chip.active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #1d4ed8;
}

.table-meta {
  display: flex;
  gap: 14px;
  color: #6b7280;
  font-size: 12px;
  flex-wrap: wrap;
}

.table-structure-wrap,
.result-table-wrap {
  overflow: auto;
}

.sql-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-xs {
  height: 30px;
  padding: 0 12px;
  font-size: 12px;
}

.sql-editor {
  width: 100%;
  min-height: 180px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid #dbe4f0;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.7;
  resize: vertical;
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.sql-actions {
  display: flex;
  justify-content: flex-end;
}

.result-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
}

.result-summary {
  padding: 12px 16px;
  font-size: 13px;
  color: #374151;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}

.result-json {
  margin: 0;
  padding: 16px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.7;
  overflow: auto;
}

.mono,
.mono-cell {
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
}

.mono-cell {
  white-space: pre-wrap;
  word-break: break-all;
}

.empty-box {
  padding: 32px 16px;
  text-align: center;
  color: #9ca3af;
}

@media (max-width: 1200px) {
  .database-layout {
    grid-template-columns: 1fr;
  }

  .table-list {
    max-height: 280px;
  }
}
</style>
