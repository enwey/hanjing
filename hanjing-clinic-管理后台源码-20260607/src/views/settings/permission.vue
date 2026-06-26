<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()

interface Role {
  id: string
  name: string
  membersCount: number
  scope: string
  status: 'active' | 'inactive'
}

const baseRoles = [
  {
    id: 'super-admin',
    name: '超级管理员',
    membersCount: 1,
    scope: '全部权限',
    status: 'active'
  },
  {
    id: 'store-admin',
    name: '门店管理员',
    membersCount: 4,
    scope: '预约/患者/医生/门店',
    status: 'active'
  },
  {
    id: 'finance',
    name: '财务人员',
    membersCount: 2,
    scope: '订单/分销/提现',
    status: 'active'
  },
  {
    id: 'editor',
    name: '内容编辑',
    membersCount: 1,
    scope: '文章/轮播图',
    status: 'active'
  }
]

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
      scope: (row.permissions || []).length ? row.permissions.join('、') : (row.description || '未配置权限'),
      status: row.status || 'active'
    }))
  } catch (error) {
    MessagePlugin.error('加载角色列表失败')
    roles.value = baseRoles as Role[]
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

</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">权限管理</div>
        <div class="page-title-sub">配置系统的角色类型，自定义不同岗位管理员的功能访问与操作权限。</div>
      </div>
      <t-button theme="primary" @click="handleAddRole">
        <template #icon>➕</template>添加角色
      </t-button>
    </div>

    <!-- Panel Wrapper -->
    <div class="panel">
      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="width: 180px;">角色名称</th>
              <th style="width: 100px;">成员数</th>
              <th style="min-width: 250px;">权限范围</th>
              <th style="width: 120px;">状态</th>
              <th style="width: 150px; min-width: 150px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedRoles" :key="row.id" @click="editRole(row.id)" style="cursor: pointer;">
              <td style="font-weight: 600; color: #111827;">{{ row.name }}</td>
              <td>
                <t-badge :count="row.membersCount" theme="default" show-zero />
              </td>
              <td style="font-size: 13px; color: #4B5563;">{{ row.scope }}</td>
              <td>
                <t-tag v-if="row.status === 'active'" theme="success" variant="light">启用</t-tag>
                <t-tag v-else theme="default" variant="light">禁用</t-tag>
              </td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;" @click.stop>
                  <button class="btn btn-xs btn-outline" @click="editRole(row.id)">编辑</button>
                  <button
                    v-if="row.name !== '超级管理员'"
                    :class="['btn', 'btn-xs', row.status === 'active' ? 'btn-danger' : 'btn-success']"
                    @click="toggleStatus(row)"
                  >
                    {{ row.status === 'active' ? '禁用' : '启用' }}
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedRoles.length === 0">
              <td colspan="5" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无角色数据</td>
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
