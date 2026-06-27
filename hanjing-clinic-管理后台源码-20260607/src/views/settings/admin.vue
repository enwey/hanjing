<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

interface AdminAccount {
  id: string;
  username: string;
  name: string;
  phone?: string;
  password?: string;
  roleId?: string;
  storeId?: string;
  avatarChar: string;
  avatarColor: string;
  role: string;
  roleTag: string; // blue, green, gold, gray
  store: string;
  lastLogin: string;
  status: string; // online, offline, disabled
}

interface RoleOption {
  id: string;
  name: string;
  code?: string;
}

interface StoreOption {
  id: string;
  name: string;
}

const admins = ref<AdminAccount[]>([])
const roles = ref<RoleOption[]>([])
const stores = ref<StoreOption[]>([])

const currentPage = ref(1)
const pageSize = ref(30)

const activeTab = ref('all')
const searchKeyword = ref('')

const filteredAdmins = computed(() => {
  return admins.value.filter(a => {
    const matchStatus = activeTab.value === 'all' || a.status === activeTab.value
    const kw = searchKeyword.value.trim().toLowerCase()
    const matchKeyword = !kw || 
      a.username.toLowerCase().includes(kw) || 
      a.name.toLowerCase().includes(kw) || 
      a.role.toLowerCase().includes(kw) || 
      a.store.toLowerCase().includes(kw)
    return matchStatus && matchKeyword
  })
})

const paginatedAdmins = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredAdmins.value.slice(start, end)
})

watch([activeTab, searchKeyword], () => {
  currentPage.value = 1
})

const showEdit = ref(false)
const isEdit = ref(false)
const editIndex = ref(-1)
const formData = ref<Partial<AdminAccount>>({
  username: '',
  name: '',
  phone: '',
  roleId: '',
  storeId: '',
  status: 'online'
})

function roleTagByName(name: string) {
  if (name.includes('超级')) return 'blue'
  if (name.includes('门店')) return 'green'
  if (name.includes('财务')) return 'gold'
  return 'gray'
}

function formatTime(value: string) {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}

function mapAdmin(row: any): AdminAccount {
  return {
    id: String(row.id),
    username: row.username || '',
    name: row.name || '',
    phone: row.phone || '',
    roleId: row.role_id ? String(row.role_id) : '',
    storeId: row.store_id ? String(row.store_id) : '',
    avatarChar: (row.name || row.username || '管').charAt(0),
    avatarColor: roleTagByName(row.role_name || '') === 'green' ? 'var(--success-500)' : 'var(--primary-500)',
    role: row.role_name || '未分配角色',
    roleTag: roleTagByName(row.role_name || ''),
    store: row.store_name || '全部门店',
    lastLogin: formatTime(row.last_login_at),
    status: row.status || 'offline'
  }
}

async function fetchOptions() {
  const [roleRes, storeRes]: any[] = await Promise.all([
    request.get('/api/admin/roles'),
    request.get('/api/admin/stores')
  ])
  roles.value = (roleRes.data || []).map((row: any) => ({
    id: String(row.id),
    name: row.name,
    code: row.code
  }))
  stores.value = (storeRes.data || []).map((row: any) => ({
    id: String(row.id),
    name: row.name
  }))
}

async function fetchAdmins() {
  try {
    const res: any = await request.get('/api/admin/users')
    admins.value = (res.data || []).map(mapAdmin)
  } catch (error) {
    MessagePlugin.error('加载管理员账号失败')
  }
}

async function handleAdd() {
  isEdit.value = false
  editIndex.value = -1
  formData.value = {
    username: '',
    name: '',
    phone: '',
    roleId: roles.value[0]?.id || '',
    storeId: '',
    status: 'online'
  }
  showEdit.value = true
}

function handleEdit(id: string) {
  const idx = admins.value.findIndex(a => a.id === id)
  if (idx === -1) return
  isEdit.value = true
  editIndex.value = idx
  formData.value = { ...admins.value[idx] }
  showEdit.value = true
}

async function handleToggle(id: string) {
  const idx = admins.value.findIndex(a => a.id === id)
  if (idx === -1) return
  const account = admins.value[idx]
  if (account.username === 'admin') {
    MessagePlugin.error('超级管理员账号不可禁用')
    return
  }
  const nextStatus = account.status === 'disabled' ? 'offline' : 'disabled'
  try {
    await request.put(`/api/admin/users/${id}`, {
      name: account.name,
      phone: account.phone,
      role_id: account.roleId,
      store_id: account.storeId || null,
      status: nextStatus
    })
    account.status = nextStatus
    MessagePlugin.success(`账号 [${account.username}] 已成功${nextStatus === 'disabled' ? '禁用' : '启用'}`)
  } catch (error) {
    MessagePlugin.error('更新账号状态失败')
  }
}

async function handleSave() {
  if (!formData.value.username || !formData.value.name || !formData.value.roleId) {
    MessagePlugin.warning('请填写用户名、姓名与角色')
    return
  }

  try {
    const payload: any = {
      username: formData.value.username,
      name: formData.value.name,
      phone: formData.value.phone || '',
      role_id: formData.value.roleId,
      store_id: formData.value.storeId || null,
      status: formData.value.status || 'online'
    }
    if ((formData.value as any).password) payload.password = (formData.value as any).password

    if (isEdit.value && editIndex.value >= 0) {
      await request.put(`/api/admin/users/${formData.value.id}`, payload)
      MessagePlugin.success('保存管理员信息成功')
    } else {
      if (!payload.password) {
        MessagePlugin.warning('新增管理员必须设置初始密码')
        return
      }
      await request.post('/api/admin/users', payload)
      MessagePlugin.success('新增管理员成功')
    }
    showEdit.value = false
    fetchAdmins()
  } catch (error) {
    MessagePlugin.error(isEdit.value ? '保存管理员失败' : '新增管理员失败')
  }
}

onMounted(async () => {
  try {
    await fetchOptions()
  } catch (error) {
    MessagePlugin.error('加载角色或门店选项失败')
  } finally {
    fetchAdmins()
  }
})

const operationColumnWidth = computed(() => {
  if (paginatedAdmins.value.length === 0) return '80px'
  const hasToggleable = paginatedAdmins.value.some(a => a.username !== 'admin')
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


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">管理员账号</div>
        <div class="page-title-sub">{{ admins.length }}位管理员</div>
      </div>
      <button class="btn btn-primary" @click="handleAdd">➕ 添加管理员</button>
    </div>

    <!-- Admins Table -->
    <div class="panel">
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <div 
            class="filter-tab" 
            :class="{ active: activeTab === 'all' }" 
            @click="activeTab = 'all'"
          >
            全部 <span style="opacity: 0.6; margin-left: 4px;">{{ admins.length }}</span>
          </div>
          <div 
            class="filter-tab" 
            :class="{ active: activeTab === 'online' }" 
            @click="activeTab = 'online'"
          >
            在线 <span style="opacity: 0.6; margin-left: 4px;">{{ admins.filter(a => a.status === 'online').length }}</span>
          </div>
          <div 
            class="filter-tab" 
            :class="{ active: activeTab === 'offline' }" 
            @click="activeTab = 'offline'"
          >
            离线 <span style="opacity: 0.6; margin-left: 4px;">{{ admins.filter(a => a.status === 'offline').length }}</span>
          </div>
          <div 
            class="filter-tab" 
            :class="{ active: activeTab === 'disabled' }" 
            @click="activeTab = 'disabled'"
          >
            已禁用 <span style="opacity: 0.6; margin-left: 4px;">{{ admins.filter(a => a.status === 'disabled').length }}</span>
          </div>
        </div>

        <input 
          type="text" 
          v-model="searchKeyword" 
          class="filter-input" 
          placeholder="🔍 搜索账号/姓名/角色/门店" 
          style="width: 240px;"
        >
      </div>

      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>账号</th>
              <th>姓名</th>
              <th>角色</th>
              <th>负责门店</th>
              <th>最近登录</th>
              <th>状态</th>
              <th :style="{ width: operationColumnWidth, minWidth: operationColumnWidth, textAlign: 'right' }">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedAdmins" :key="row.id">
              <td style="font-family: monospace; font-size: 12px;">{{ row.username }}</td>
              <td>
                <div class="name-cell" style="min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 8px;">
                  <div class="avatar avatar-sm" :style="{ background: row.avatarColor, flexShrink: 0 }">{{ row.avatarChar }}</div>
                  <strong style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ row.name }}</strong>
                </div>
              </td>
              <td>
                <span class="tag tag-blue" v-if="row.roleTag === 'blue'">{{ row.role }}</span>
                <span class="tag tag-green" v-else-if="row.roleTag === 'green'">{{ row.role }}</span>
                <span class="tag tag-gold" v-else-if="row.roleTag === 'gold'">{{ row.role }}</span>
                <span class="tag tag-gray" v-else-if="row.roleTag === 'gray'">{{ row.role }}</span>
              </td>
              <td>{{ row.store }}</td>
              <td style="font-size: 12px; color: #6B7280;">{{ row.lastLogin }}</td>
              <td>
                <span class="status-tag green" v-if="row.status === 'online'">在线</span>
                <span class="status-tag gray" v-else-if="row.status === 'offline'">离线</span>
                <span class="status-tag red" v-else-if="row.status === 'disabled'">已禁用</span>
              </td>
              <td :style="{ width: operationColumnWidth, minWidth: operationColumnWidth }">
                <div style="display: flex; gap: 4px; justify-content: flex-end;">
                  <button class="btn btn-xs btn-outline" @click="handleEdit(row.id)">编辑</button>
                  <button
                    class="btn btn-xs btn-danger"
                    @click="handleToggle(row.id)"
                    v-if="row.username !== 'admin' && row.status !== 'disabled'"
                  >
                    禁用
                  </button>
                  <button
                    class="btn btn-xs btn-success"
                    @click="handleToggle(row.id)"
                    v-if="row.username !== 'admin' && row.status === 'disabled'"
                  >
                    启用
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- 分页 -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredAdmins.length"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>

    <!-- Edit Dialog -->
    <t-dialog
      v-model:visible="showEdit"
      :header="isEdit ? '编辑管理员' : '添加管理员'"
      @confirm="handleSave"
      :cancelBtn="null"
    >
      <div class="dialog-body-form" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label class="form-label">登录账号</label>
          <input type="text" class="form-control" v-model="formData.username" :disabled="isEdit" placeholder="例如：editor02">
        </div>
        <div class="form-group">
          <label class="form-label">真实姓名</label>
          <input type="text" class="form-control" v-model="formData.name" placeholder="请输入姓名">
        </div>
        <div class="form-group">
          <label class="form-label">手机号</label>
          <input type="text" class="form-control" v-model="formData.phone" placeholder="请输入手机号">
        </div>
        <div class="form-group">
          <label class="form-label">{{ isEdit ? '重置密码（可选）' : '初始密码' }}</label>
          <input type="password" class="form-control" v-model="formData.password" placeholder="新增账号必须设置密码">
        </div>
        <div class="form-group">
          <label class="form-label">角色权限组</label>
          <select class="form-control" v-model="formData.roleId">
            <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">负责门店</label>
          <select class="form-control" v-model="formData.storeId">
            <option value="">全部门店</option>
            <option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
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

/* Panels */
.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
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
.btn-success {
  background: #ECFDF5;
  color: #16A34A;
  border: 1px solid #BBF7D0;
}
.btn-success:hover {
  background: #D3F5E3;
}
.btn-xs {
  padding: 3px 8px;
  font-size: 11px;
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

/* Form Styles */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.form-control {
  padding: 10px 14px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 14px;
  color: #1F2937;
  outline: none;
}
select.form-control {
  appearance: auto;
}

/* Tags & Badges */
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.tag-blue {
  background: #EEF4FF;
  color: #2A52D4;
}
.tag-green {
  background: #ECFDF5;
  color: #16A34A;
}
.tag-gold {
  background: #FFF9E6;
  color: #D4930A;
}
.tag-gray {
  background: #F3F4F6;
  color: #6B7280;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.status-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status-tag.green {
  background: #ECFDF5;
  color: #16A34A;
}
.status-tag.green::before {
  background: #22C55E;
}
.status-tag.gray {
  background: #F3F4F6;
  color: #6B7280;
}
.status-tag.gray::before {
  background: #9CA3AF;
}
.status-tag.red {
  background: #FEF2F2;
  color: #DC2626;
}
.status-tag.red::before {
  background: #EF4444;
}
</style>
