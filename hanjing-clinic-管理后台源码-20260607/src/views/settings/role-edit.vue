<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()
const route = useRoute()

const roleId = ref(route.params.id ? String(route.params.id) : '')
const isEdit = ref(!!route.params.id)

const roleName = ref('')
const roleDesc = ref('')

interface Member {
  name: string;
  avatarChar: string;
  avatarColor: string;
  store: string;
}

const members = ref<Member[]>([])

interface PermissionRow {
  module: string;
  view: boolean;
  add: boolean | null;
  edit: boolean;
  delete: boolean;
  audit: boolean | null;
}

const permissionMatrix = ref<PermissionRow[]>([
  { module: 'appointment', view: false, add: false, edit: false, delete: false, audit: false },
  { module: 'patient', view: false, add: false, edit: false, delete: false, audit: null },
  { module: 'doctor', view: false, add: false, edit: false, delete: false, audit: null },
  { module: 'store', view: false, add: false, edit: false, delete: false, audit: null },
  { module: 'order', view: false, add: null, edit: false, delete: false, audit: null },
  { module: 'distribution', view: false, add: false, edit: false, delete: false, audit: false },
  { module: 'system', view: false, add: false, edit: false, delete: false, audit: false },
  { module: 'audit_log', view: false, add: null, edit: false, delete: false, audit: null }
])

const moduleLabels: Record<string, string> = {
  appointment: '预约管理',
  patient: '患者管理',
  doctor: '医生管理',
  store: '门店管理',
  order: '订单管理',
  distribution: '分销管理',
  system: '系统设置',
  audit_log: '操作日志'
}

const showAddMember = ref(false)
const newMemberName = ref('')
const newMemberStore = ref('龙岗总店')

function removeMember(index: number) {
  members.value.splice(index, 1)
  MessagePlugin.warning('成员角色调整请到管理员账号页保存')
}

function handleAddMember() {
  if (!newMemberName.value.trim()) {
    MessagePlugin.warning('请填写成员姓名')
    return
  }
  MessagePlugin.warning('成员角色调整请到管理员账号页操作')
}

function buildPermissions() {
  const permissions: string[] = []
  permissionMatrix.value.forEach(row => {
    if (row.view) permissions.push(`${row.module}:view`)
    if (row.add) permissions.push(`${row.module}:add`)
    if (row.edit) permissions.push(`${row.module}:edit`)
    if (row.delete) permissions.push(`${row.module}:delete`)
    if (row.audit) permissions.push(`${row.module}:audit`)
  })
  return permissions
}

function applyPermissions(permissions: string[]) {
  permissionMatrix.value.forEach(row => {
    row.view = permissions.includes(`${row.module}:view`)
    if (row.add !== null) row.add = permissions.includes(`${row.module}:add`)
    row.edit = permissions.includes(`${row.module}:edit`)
    row.delete = permissions.includes(`${row.module}:delete`)
    if (row.audit !== null) row.audit = permissions.includes(`${row.module}:audit`)
  })
}

async function fetchRole() {
  if (!isEdit.value) return
  const res: any = await request.get('/api/admin/roles')
  const role = (res.data || []).find((row: any) => String(row.id) === roleId.value)
  if (!role) return
  roleName.value = role.name
  roleDesc.value = role.description || ''
  applyPermissions(role.permissions || [])

  const usersRes: any = await request.get('/api/admin/users')
  members.value = (usersRes.data || [])
    .filter((row: any) => String(row.role_id) === roleId.value)
    .map((row: any) => ({
      name: row.name || row.username,
      avatarChar: (row.name || row.username || '管').charAt(0),
      avatarColor: 'var(--primary-500)',
      store: row.store_name || '全部门店'
    }))
}

async function handleSave() {
  if (!roleName.value.trim()) {
    MessagePlugin.warning('请填写角色名称')
    return
  }
  try {
    const payload = {
      name: roleName.value,
      description: roleDesc.value,
      status: 'active',
      permissions: buildPermissions()
    }
    if (isEdit.value) {
      await request.put(`/api/admin/roles/${roleId.value}`, payload)
    } else {
      await request.post('/api/admin/roles', payload)
    }
    MessagePlugin.success('保存角色及权限矩阵成功')
    router.push('/permission')
  } catch (error) {
    MessagePlugin.error('保存角色失败')
  }
}

function handleCancel() {
  router.push('/permission')
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
        <div class="page-title">编辑角色 — {{ roleName }}</div>
        <div class="page-title-sub">{{ members.length }}位成员 · 自定义权限</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" @click="handleCancel">取消</button>
        <button class="btn btn-primary" @click="handleSave">保存权限</button>
      </div>
    </div>

    <!-- Double panel layout -->
    <div class="card-grid-2">
      <!-- Role info -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header"><div class="panel-title">📝 角色信息</div></div>
        <div class="panel-body">
          <div class="form-grid">
            <div class="form-group full">
              <label class="form-label">角色名称<span class="required">*</span></label>
              <input type="text" class="form-control" v-model="roleName">
            </div>
            <div class="form-group full">
              <label class="form-label">角色描述</label>
              <textarea class="form-control" style="min-height: 60px;" v-model="roleDesc"></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- Members list -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header">
          <div class="panel-title">👥 成员列表</div>
          <button class="btn btn-sm btn-primary" @click="showAddMember = true">➕ 添加</button>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>成员</th>
              <th>负责门店</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(m, idx) in members" :key="idx">
              <td>
                <div class="name-cell">
                  <div class="avatar avatar-sm" :style="{ background: m.avatarColor }">{{ m.avatarChar }}</div>
                  <span>{{ m.name }}</span>
                </div>
              </td>
              <td>{{ m.store }}</td>
              <td>
                <button class="btn btn-xs btn-danger" @click="removeMember(idx)">移除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Permission Matrix Panel -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">🔐 权限矩阵</div></div>
      <table class="data-table">
        <thead>
          <tr>
            <th>模块</th>
            <th>查看</th>
            <th>新增</th>
            <th>编辑</th>
            <th>删除</th>
            <th>审核</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in permissionMatrix" :key="idx">
            <td style="font-weight: 600; color: #1F2937;">{{ moduleLabels[row.module] || row.module }}</td>
            <td>
              <input type="checkbox" v-model="row.view" class="custom-checkbox">
            </td>
            <td>
              <input type="checkbox" v-model="row.add" class="custom-checkbox" v-if="row.add !== null">
              <span v-else style="color: #9CA3AF;">—</span>
            </td>
            <td>
              <input type="checkbox" v-model="row.edit" class="custom-checkbox">
            </td>
            <td>
              <input type="checkbox" v-model="row.delete" class="custom-checkbox">
            </td>
            <td>
              <input type="checkbox" v-model="row.audit" class="custom-checkbox" v-if="row.audit !== null">
              <span v-else style="color: #9CA3AF;">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add Member Dialog -->
    <t-dialog
      v-model:visible="showAddMember"
      header="添加角色成员"
      @confirm="handleAddMember"
      :cancelBtn="null"
    >
      <div class="form-container" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label class="form-label">成员姓名</label>
          <input type="text" class="form-control" v-model="newMemberName" placeholder="例如：何经理">
        </div>
        <div class="form-group">
          <label class="form-label">负责门店</label>
          <select class="form-control" v-model="newMemberStore">
            <option>龙岗总店</option>
            <option>南山分院</option>
            <option>福田门诊部</option>
            <option>全部门店</option>
          </select>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>


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
