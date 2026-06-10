<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

interface AdminAccount {
  id: string;
  username: string;
  name: string;
  avatarChar: string;
  avatarColor: string;
  role: string;
  roleTag: string; // blue, green, gold, gray
  store: string;
  lastLogin: string;
  status: string; // online, offline, disabled
}

const baseAdmins = [
  { id: '1', username: 'admin', name: '管理员', avatarChar: '管', avatarColor: 'var(--primary-500)', role: '超级管理员', roleTag: 'blue', store: '全部门店', lastLogin: '5/29 19:32', status: 'online' },
  { id: '2', username: 'chenmgr', name: '陈经理', avatarChar: '陈', avatarColor: 'var(--success-500)', role: '门店管理员', roleTag: 'green', store: '龙岗总店', lastLogin: '5/29 18:45', status: 'online' },
  { id: '3', username: 'finance01', name: '财务王', avatarChar: '财', avatarColor: '#9333EA', role: '财务人员', roleTag: 'gold', store: '全部门店', lastLogin: '5/29 16:33', status: 'offline' },
  { id: '4', username: 'editor01', name: '编辑小李', avatarChar: '编', avatarColor: '#EC4899', role: '内容编辑', roleTag: 'gray', store: '—', lastLogin: '5/28 14:20', status: 'offline' }
]

const admins = ref<AdminAccount[]>(
  Array.from({ length: 36 }, (_, i) => {
    const base = baseAdmins[i % baseAdmins.length]
    if (i === 0) return base
    return {
      ...base,
      id: String(i + 1),
      username: `${base.username}${i + 1}`,
      name: `${base.name}-${i + 1}`,
      status: i % 3 === 0 ? 'online' : (i % 3 === 1 ? 'offline' : 'disabled')
    }
  })
)

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
  role: '门店管理员',
  store: '龙岗总店'
})

function handleAdd() {
  isEdit.value = false
  formData.value = {
    username: '',
    name: '',
    role: '门店管理员',
    store: '龙岗总店'
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

function handleToggle(id: string) {
  const idx = admins.value.findIndex(a => a.id === id)
  if (idx === -1) return
  const account = admins.value[idx]
  if (account.username === 'admin') {
    MessagePlugin.error('超级管理员账号不可禁用')
    return
  }
  if (account.status === 'disabled') {
    account.status = 'offline'
    MessagePlugin.success(`账号 [${account.username}] 已成功启用`)
  } else {
    account.status = 'disabled'
    MessagePlugin.success(`账号 [${account.username}] 已成功禁用`)
  }
}

function handleSave() {
  if (!formData.value.username || !formData.value.name) {
    MessagePlugin.warning('请填写用户名与姓名')
    return
  }
  
  const roleTag = formData.value.role === '超级管理员' ? 'blue' : formData.value.role === '门店管理员' ? 'green' : formData.value.role === '财务人员' ? 'gold' : 'gray'
  const avatarChar = formData.value.name?.charAt(0) || '管'
  
  if (isEdit.value) {
    admins.value[editIndex.value] = {
      ...admins.value[editIndex.value],
      ...formData.value,
      roleTag,
      avatarChar
    } as AdminAccount
    MessagePlugin.success('保存管理员信息成功')
  } else {
    admins.value.push({
      id: String(Date.now()),
      username: formData.value.username || '',
      name: formData.value.name || '',
      avatarChar,
      avatarColor: 'var(--primary-500)',
      role: formData.value.role || '门店管理员',
      roleTag,
      store: formData.value.store || '全部门店',
      lastLogin: '—',
      status: 'offline'
    })
    MessagePlugin.success('新增管理员成功')
  }
  showEdit.value = false
}
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
              <th style="width: 140px;">账号</th>
              <th style="width: 130px;">姓名</th>
              <th style="width: 120px;">角色</th>
              <th style="width: 160px;">负责门店</th>
              <th style="width: 150px;">最近登录</th>
              <th style="width: 100px;">状态</th>
              <th style="width: 180px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedAdmins" :key="row.id">
              <td style="font-family: monospace; font-size: 12px;">{{ row.username }}</td>
              <td>
                <div class="name-cell">
                  <div class="avatar avatar-sm" :style="{ background: row.avatarColor }">{{ row.avatarChar }}</div>
                  <strong>{{ row.name }}</strong>
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
              <td>
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
          <label class="form-label">角色权限组</label>
          <select class="form-control" v-model="formData.role">
            <option>超级管理员</option>
            <option>门店管理员</option>
            <option>财务人员</option>
            <option>内容编辑</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">负责门店</label>
          <select class="form-control" v-model="formData.store">
            <option>全部门店</option>
            <option>龙岗总店</option>
            <option>南山分院</option>
            <option>福田门诊部</option>
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
