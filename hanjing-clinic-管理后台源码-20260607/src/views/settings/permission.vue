<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

import { permissionCatalog as catalog, fullCatalog } from '@/utils/permissionCatalog'
import { scopeLabel } from '@/utils/dataScope'

const router = useRouter()

interface Role {
  id: string
  name: string
  membersCount: number
  scope: string[]
  dataScopeLabel?: string
  status: 'active' | 'inactive'
}

function summarizePermissions(row: { code?: string; permissions?: string[] }): string[] {
  if (row.code === 'super_admin') return ['全部模块（全权限）']
  const permissions = new Set(Array.isArray(row.permissions) ? row.permissions : [])
  const summaries = catalog.flatMap(group => {
    const selected = group.actions.filter(action => permissions.has(action.code))
    if (!selected.length) return []
    const onlyView = selected.length === 1 && selected[0].code === `${group.module}:view`
    const detail = onlyView ? '仅查看' : selected.length === group.actions.length ? '全权限' : selected.map(action => action.code === `${group.module}:view` ? '查看' : action.label).join('、')
    return [`${group.label}（${detail}）`]
  })
  const known = new Set(fullCatalog.flatMap(group => group.actions.map(action => action.code)))
  if ([...permissions].some(code => !known.has(code))) summaries.push('其他权限（待核对）')
  return summaries.length ? summaries : ['未配置权限']
}

const roles = ref<Role[]>(
  []
)

const currentPage = ref(1)
const pageSize = ref(30)

const paginatedRoles = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return roles.value.slice(start, end)
})

function editRole(id: string) {
  router.push(`/permission/role-edit/${id}`)
}

function handleAddRole() {
  router.push('/permission/role-edit')
}

async function fetchRoles() {
  try {
    const res: any = await request.get('/api/admin/roles')
    roles.value = (res.data || []).map((row: any) => ({
      id: String(row.id),
      name: row.name,
      membersCount: Number(row.members_count || 0),
      dataScopeLabel: scopeLabel(row.data_scope),
      scope: summarizePermissions(row),
      status: row.status || 'active'
    }))
  } catch (error) {
    MessagePlugin.error('加载角色列表失败')
    roles.value = []
  }
}

async function toggleStatus(row: Role) {
  if (row.name === '超级管理员') {
    MessagePlugin.error('超级管理员角色不能被禁用')
    return
  }
  const nextStatus = row.status === 'active' ? 'inactive' : 'active'
  try {
    await request.put(`/api/admin/roles/${row.id}`, { status: nextStatus })
    row.status = nextStatus
    MessagePlugin.success(`角色 ${row.name} 已${row.status === 'active' ? '启用' : '禁用'}`)
  } catch (error) {
    MessagePlugin.error('更新角色状态失败')
  }
}

onMounted(fetchRoles)

const operationColumnWidth = computed(() => {
  if (paginatedRoles.value.length === 0) return '80px'
  const hasToggleable = paginatedRoles.value.some(r => r.name !== '超级管理员')
  return hasToggleable ? '140px' : '80px'
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
        <div class="page-title">角色管理</div>
        <div class="page-title-sub">配置系统的角色类型，自定义不同岗位管理员的功能访问与操作权限。</div>
      </div>
      <button v-permission="'role:add'" class="btn btn-primary" @click="handleAddRole">
        <AppIcon name="plus" />  添加角色
      </button>
    </div>

    <!-- Panel Wrapper -->
    <div class="panel">
      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table role-table">
          <colgroup><col class="role-name-col"><col class="role-count-col"><col><col class="role-data-col"><col class="role-status-col"><col class="role-actions-col"></colgroup>
          <thead>
            <tr>
              <th>角色名称</th>
              <th>成员数</th>
              <th>权限范围</th>
              <th>查看数据范围</th>
              <th>状态</th>
              <th :style="{ width: operationColumnWidth, minWidth: operationColumnWidth, textAlign: 'right' }">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedRoles" :key="row.id" @click="editRole(row.id)" style="cursor: pointer;">
              <td style="font-weight: 600; color: #111827;">{{ row.name }}</td>
              <td>
                <t-badge :count="row.membersCount" theme="default" show-zero />
              </td>
              <td class="role-permission-cell"><div class="permission-summaries"><span v-for="summary in row.scope" :key="summary" class="permission-summary">{{ summary }}</span></div></td>
              <td>{{ row.dataScopeLabel || '个人数据' }}</td>
              <td>
                <t-tag v-if="row.status === 'active'" theme="success" variant="light">启用</t-tag>
                <t-tag v-else theme="default" variant="light">禁用</t-tag>
              </td>
               <td :style="{ width: operationColumnWidth, minWidth: operationColumnWidth, textAlign: 'right' }">
                <div class="actions" style="justify-content: flex-end;" @click.stop>
                  <button v-permission="'role:view'" class="btn btn-xs btn-outline" @click="editRole(row.id)">编辑</button>
                  <button
 v-permission="'role:edit'"                    v-if="row.name !== '超级管理员'"
                    :class="['btn', 'btn-xs', row.status === 'active' ? 'btn-danger' : 'btn-success']"
                    @click="toggleStatus(row)"
                  >
                    {{ row.status === 'active' ? '禁用' : '启用' }}
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedRoles.length === 0">
              <td colspan="6" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无角色数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="roles.length"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.role-table { width: 100%; table-layout: fixed; }
.role-name-col { width: 140px; }
.role-count-col { width: 80px; }
.role-data-col { width: 160px; }
.role-status-col { width: 80px; }
.role-actions-col { width: 150px; }
.role-table th, .role-table td { white-space: normal; overflow-wrap: anywhere; }
.permission-summaries { display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 0; }
.permission-summary { display: inline-block; max-width: 100%; padding: 5px 10px; border-radius: 6px; background: #f3f5f8; color: #4b5563; font-size: 13px; line-height: 1.7; white-space: normal; overflow-wrap: anywhere; }
.role-permission-cell { vertical-align: middle; }
@media (max-width: 1100px) { .role-name-col { width: 115px; } .role-count-col { width: 65px; } .role-data-col { width: 115px; } }
</style>
