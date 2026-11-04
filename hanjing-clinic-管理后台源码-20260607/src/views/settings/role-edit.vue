<script setup lang="ts">
import { hasPermission } from '@/utils/permission'
import { ref, computed, onMounted } from 'vue'
import { permissionCatalog, fullCatalog } from '@/utils/permissionCatalog'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { navigateToParent } from '@/utils/routeNavigation'
import { formatShanghaiDateTime } from '@/utils/dateTime'

import DataScopeSelector from '@/components/DataScopeSelector.vue'
import { personalScope, scopeLabel, type DataScope } from '@/utils/dataScope'

const dataScope = ref<DataScope | null>(personalScope())
const scopeStores = ref<Array<{ id: number; name: string }>>([])
const router = useRouter()
const route = useRoute()

const roleId = ref(route.params.id ? String(route.params.id) : '')
const isEdit = ref(!!route.params.id)

const roleName = ref('')
const roleDesc = ref('')

interface Member {
  id: string;
  name: string;
  avatarChar: string;
  avatarColor: string;
  store: string;
  username: string;
  phone: string;
  doctorName: string;
  lastLogin: string;
  status: string;
  dataScope: DataScope | null;
}

function mapMember(user: any): Member {
  return {
    id: String(user.id), name: user.name || user.username,
    username: user.username || '—', phone: user.phone || '—',
    doctorName: user.doctor_name || '—',
    lastLogin: user.last_login_at ? formatShanghaiDateTime(user.last_login_at, false) : '从未登录',
    status: user.status || 'offline',
    avatarChar: (user.name || user.username || '管').charAt(0), avatarColor: 'var(--primary-500)',
    store: user.all_stores ? '全部门店' : (user.store_names || '未分配门店'),
    dataScope: String(user.role_id) === roleId.value ? (user.role_member_data_scope ?? null) : null
  }
}
const scopeMemberId = ref('')
const memberScopeDraft = ref<DataScope | null>(null)
const showMemberScope = ref(false)
const scopeMemberName = computed(() => members.value.find(m => m.id === scopeMemberId.value)?.name || '')
function openMemberScope(member: Member) {
  scopeMemberId.value = member.id
  memberScopeDraft.value = member.dataScope ? JSON.parse(JSON.stringify(member.dataScope)) : null
  showMemberScope.value = true
}
function saveMemberScope() {
  const scope = memberScopeDraft.value
  if (scope?.type === 'store' && !scope.all_stores && !scope.store_ids.length) {
    MessagePlugin.warning('请至少选择一家门店'); return
  }
  const member = members.value.find(m => m.id === scopeMemberId.value)
  if (member) member.dataScope = scope ? JSON.parse(JSON.stringify(scope)) : null
  showMemberScope.value = false
}

const members = ref<Member[]>([])
const allAdminUsers = ref<any[]>([])
const selectedUserIdToAdd = ref('')

const addableUsers = computed(() => {
  return allAdminUsers.value.filter(u => !members.value.some(m => String(m.id) === String(u.id)))
})

const selectedPermissions = ref<string[]>([])
const showAddMember = ref(false)

function removeMember(index: number) {
  const member = members.value[index]
  members.value.splice(index, 1)
  MessagePlugin.success(`已从角色临时移除成员 ${member.name}，点击右上角“保存权限”后保存。`)
}

function handleAddMember() {
  if (!selectedUserIdToAdd.value) {
    MessagePlugin.warning('请选择要添加的成员账号')
    return
  }
  const user = allAdminUsers.value.find(u => String(u.id) === selectedUserIdToAdd.value)
  if (user) {
    members.value.push(mapMember(user))
    MessagePlugin.success(`已临时将成员 ${user.name || user.username} 加入列表，点击右上角“保存权限”以生效。`)
  }
  showAddMember.value = false
  selectedUserIdToAdd.value = ''
}

function buildPermissions() { return [...new Set(selectedPermissions.value)] }
function applyPermissions(permissions: string[]) {
  const known = new Set(fullCatalog.flatMap(group => group.actions.map(action => action.code)))
  selectedPermissions.value = permissions.filter(permission => known.has(permission))
}

async function fetchRole() {
  try {
    const storesRes: any = await request.get('/api/admin/data-scope-stores')
    scopeStores.value = storesRes.data || []
    const usersRes: any = await request.get('/api/admin/users')
    allAdminUsers.value = usersRes.data || []

    if (!isEdit.value) return
    const res: any = await request.get('/api/admin/roles')
    const role = (res.data || []).find((row: any) => String(row.id) === roleId.value)
    if (!role) return
    dataScope.value = role.data_scope || personalScope()
    roleName.value = role.name
    roleDesc.value = role.description || ''
    applyPermissions(role.permissions || [])

    members.value = allAdminUsers.value
      .filter((row: any) => String(row.role_id) === roleId.value)
      .map(mapMember)
  } catch (error) {
    MessagePlugin.error('加载角色或账号列表失败')
  }
}

async function handleSave() {
  if (!roleName.value.trim()) {
    MessagePlugin.warning('请填写角色名称')
    return
  }
  if (dataScope.value?.type === 'store' && !dataScope.value.all_stores && !dataScope.value.store_ids.length) {
    MessagePlugin.warning('请至少选择一家门店')
    return
  }
  try {
    const payload: Record<string, unknown> = {}
    if (!isEdit.value || hasPermission('role:edit')) Object.assign(payload, { name:roleName.value,description:roleDesc.value,status:'active' })
    if (hasPermission('role:assign')) payload.permissions = buildPermissions()
    if (hasPermission('role:scope')) Object.assign(payload, { data_scope:dataScope.value || personalScope(), member_data_scopes:members.value.map(m=>({admin_user_id:m.id,data_scope:m.dataScope})) })
    if (hasPermission('role:members')) payload.memberIds = members.value.map(m=>m.id)
    if (isEdit.value) {
      await request.put(`/api/admin/roles/${roleId.value}`, payload)
    } else {
      await request.post('/api/admin/roles', payload)
    }
    MessagePlugin.success('保存角色及权限矩阵成功')
    navigateToParent(router, route, '/permission')
  } catch (error) {
    MessagePlugin.error('保存角色失败')
  }
}

function handleCancel() {
  navigateToParent(router, route, '/permission')
}

onMounted(() => {
  fetchRole()
})
</script>

<template>
  <div class="page-container">


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">{{ isEdit ? '编辑角色' : '新建角色' }}{{ roleName ? ` — ${roleName}` : '' }}</div>
        <div class="page-title-sub">{{ members.length }}位成员 · 自定义权限</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" @click="handleCancel">取消</button>
        <button v-if="isEdit ? ['role:edit','role:assign','role:scope','role:members'].some(hasPermission) : hasPermission('role:add')" class="btn btn-primary" @click="handleSave">保存权限</button>
      </div>
    </div>

    <!-- Double panel layout -->
    <div class="card-grid-2">
      <!-- Role info -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header"><div class="panel-title"><AppIcon name="file-text" />  角色信息</div></div>
        <div class="panel-body">
          <div class="form-grid">
            <div class="form-group full">
              <label class="form-label">角色名称<span class="required">*</span></label>
              <input type="text" class="form-control" v-model="roleName" :disabled="isEdit && !hasPermission('role:edit')">
            </div>
            <div class="form-group full">
              <label class="form-label">角色描述</label>
              <textarea class="form-control" style="min-height: 60px;" v-model="roleDesc" :disabled="isEdit && !hasPermission('role:edit')"></textarea>
            </div>
          </div>
        </div>
      </div>

      <div class="panel" style="margin: 0;">
        <div class="panel-header"><div class="panel-title">查看数据范围</div></div>
        <div class="panel-body">
          <fieldset :disabled="!hasPermission('role:scope')" class="scope-fieldset"><DataScopeSelector v-model="dataScope" :stores="scopeStores" /></fieldset>
          <p class="scope-help">成员默认继承当前角色范围，可在下方成员列表中单独调整。</p>
        </div>
      </div>
    </div>

    <div class="panel member-panel">
      <div class="panel-header">
        <div class="panel-title"><AppIcon name="team" /> 成员列表 <span class="member-count">{{ members.length }} 人</span></div>
        <button v-permission="'role:members'" class="btn btn-sm btn-primary" @click="showAddMember = true"><AppIcon name="plus" /> 添加成员</button>
      </div>
      <div class="member-table-wrap">
        <table class="data-table member-table">
          <thead><tr><th>成员 / 账号</th><th>手机号</th><th>业务操作门店</th><th>关联医生</th><th>账号状态</th><th>最近登录</th><th>当前角色中的数据范围</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="(member, index) in members" :key="member.id">
              <td><div class="name-cell"><div class="avatar avatar-sm" :style="{ background: member.avatarColor }">{{ member.avatarChar }}</div><div><div>{{ member.name }}</div><div class="member-account">{{ member.username }}</div></div></div></td>
              <td>{{ member.phone }}</td>
              <td class="member-stores">{{ member.store }}</td>
              <td>{{ member.doctorName }}</td>
              <td><span class="member-status" :class="{ disabled: member.status === 'disabled' }">{{ member.status === 'disabled' ? '已禁用' : member.status === 'online' ? '正常' : '离线' }}</span></td>
              <td>{{ member.lastLogin }}</td>
              <td class="member-scope"><div>{{ scopeLabel(member.dataScope || dataScope, scopeStores) }}</div><span class="member-account">{{ member.dataScope ? '当前角色单独调整' : '继承当前角色' }}</span></td>
              <td><div class="member-actions"><button v-permission="'role:scope'" class="btn btn-xs btn-outline" @click="openMemberScope(member)">调整范围</button><button v-permission="'role:members'" class="btn btn-xs btn-danger" @click="removeMember(index)">移除</button></div></td>
            </tr>
            <tr v-if="!members.length"><td colspan="8" class="members-empty">暂无成员</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Permission Matrix Panel -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title"><AppIcon name="lock" /> 权限矩阵</div></div>
      <table class="data-table permission-table">
        <thead><tr><th>菜单 / 模块</th><th>可分配功能</th></tr></thead>
        <tbody>
          <tr v-for="group in permissionCatalog" :key="group.module">
            <td class="permission-module">{{ group.label }}</td>
            <td><div class="permission-options">
              <label v-for="action in group.actions" :key="action.code" class="permission-option">
                <input type="checkbox" v-model="selectedPermissions" :disabled="!hasPermission('role:assign')" :value="action.code" class="custom-checkbox">
                <span>{{ action.label }}</span>
              </label>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>

    <t-dialog v-model:visible="showMemberScope" :header="`${scopeMemberName} · 当前角色数据范围`" :width="560" :confirm-btn="'确定'" @confirm="saveMemberScope">
      <DataScopeSelector v-model="memberScopeDraft" :stores="scopeStores" allow-inherit :inherited-scope="dataScope" />
      <p class="scope-help">仅调整此成员在当前角色中的查看范围，保存角色后生效。</p>
    </t-dialog>

    <!-- Add Member Dialog -->
    <t-dialog
      v-model:visible="showAddMember"
      header="添加角色成员"
      @confirm="handleAddMember"
      :cancelBtn="null"
    >
      <div class="form-container" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label class="form-label">选择要添加的成员账号</label>
          <t-select v-model="selectedUserIdToAdd" placeholder="请选择系统管理员" clearable>
            <t-option 
              v-for="user in addableUsers" 
              :key="user.id" 
              :value="String(user.id)" 
              :label="`${user.name || user.username} (${user.role_name || '无角色'})`" 
            />
          </t-select>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
.scope-help { margin: 12px 0 0; color: #6b7280; font-size: 13px; line-height: 1.6; }
.member-panel { margin-top: 16px; }
.member-count { margin-left: 8px; color: #6b7280; font-size: 13px; font-weight: 400; }
.member-table-wrap { overflow-x: auto; }
.member-table { min-width: 1040px; }
.member-table td { white-space: nowrap; }
.member-table .member-stores, .member-table .member-scope { white-space: normal; min-width: 140px; max-width: 240px; line-height: 1.6; }
.member-account { margin-top: 4px; color: #9ca3af; font-size: 12px; font-weight: 400; }
.member-actions { display: flex; align-items: center; gap: 8px; }
.member-status { display: inline-block; padding: 3px 8px; border-radius: 4px; color: #059669; background: #ecfdf5; }
.member-status.disabled { color: #6b7280; background: #f3f4f6; }
.member-table .members-empty { padding: 32px; text-align: center; color: #9ca3af; }
@media (max-width: 1000px) { .card-grid-2 { grid-template-columns: 1fr !important; } }



/* Breadcrumb */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #9CA3AF;
  margin-bottom: 16px;
}
.breadcrumb .current {
  color: #1F2937;
  font-weight: 600;
}
.breadcrumb .sep {
  color: #D1D5DB;
}

/* Screen Label */
.screen-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--primary-500);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.screen-label::before {
  content: '';
  width: 3px;
  height: 16px;
  background: var(--primary-500);
  border-radius: 2px;
}
.screen-sublabel {
  font-size: 12px;
  color: #9CA3AF;
  margin-left: 8px;
  font-weight: 400;
}

/* Page Title Row */
.page-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
}
.page-title-sub {
  font-size: 13px;
  color: #9CA3AF;
  margin-top: 4px;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 8px;
}

/* Panels */
.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #F3F4F6;
}
.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.panel-body {
  padding: 20px;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 150ms;
}
.btn-primary {
  background: var(--primary-500);
  color: #fff;
}
.btn-primary:hover {
  background: #2A52D4;
}
.btn-outline {
  background: #fff;
  color: #374151;
  border: 1px solid #E5E7EB;
}
.btn-outline:hover {
  border-color: #BCCFFF;
  color: var(--primary-500);
}
.btn-danger {
  background: #FEF2F2;
  color: #DC2626;
  border: 1px solid #FECACA;
}
.btn-danger:hover {
  background: #FEE2E2;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}
.btn-xs {
  padding: 3px 8px;
  font-size: 11px;
}

/* Grids */
.card-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* Form Styles */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group.full {
  grid-column: span 2;
}
.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.form-label .required {
  color: var(--error-500);
  margin-left: 2px;
}
.form-control {
  padding: 10px 14px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 14px;
  color: #1F2937;
  outline: none;
}
textarea.form-control {
  resize: vertical;
  min-height: 80px;
}
select.form-control {
  appearance: auto;
}

/* Data Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  text-align: left;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #9CA3AF;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
}
.data-table td {
  padding: 12px 14px;
  font-size: 13px;
  color: #4B5563;
  border-bottom: 1px solid #F3F4F6;
  vertical-align: middle;
}
.data-table tr:hover td {
  background: #F9FAFB;
}

/* Avatar */
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}
.avatar-sm {
  width: 24px;
  height: 24px;
  font-size: 11px;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

/* Custom Checkbox */
.custom-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--primary-500);
}
</style>

<style scoped>
.scope-fieldset { border:0; margin:0; padding:0; min-width:0; }
.permission-module { width: 160px; font-weight: 600; vertical-align: top; }
.permission-options { display: flex; flex-wrap: wrap; gap: 14px 24px; }
.permission-option { display: inline-flex; align-items: center; gap: 8px; min-width: 130px; cursor: pointer; }
.permission-table td { padding: 18px 24px; }
</style>
