<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()

const searchKeyword = ref('')
const filterCategory = ref('')
const activeStatusTab = ref('all') // 'all', 'pending', 'approved', 'rejected'

const currentPage = ref(1)
const pageSize = ref(30)

// Reset to page 1 on filter changes
watch([searchKeyword, activeStatusTab, filterCategory], () => {
  currentPage.value = 1
})

interface Post {
  id: string; 
  title: string; 
  author: string; 
  avatar: string; 
  category: string;
  views: number; 
  likes: number; 
  comments: number; 
  createTime: string;
  status: string; 
  isTop: boolean;
}

const posts = ref<Post[]>([])

const categories = ['睡眠科普', '治疗知识', '设备介绍', '患者故事']

const filteredPosts = computed(() => {
  let list = posts.value

  // 1. Status Tab Filter
  if (activeStatusTab.value === 'pending') {
    list = list.filter(p => p.status === 'pending')
  } else if (activeStatusTab.value === 'approved') {
    list = list.filter(p => p.status === 'approved')
  } else if (activeStatusTab.value === 'rejected') {
    list = list.filter(p => p.status === 'rejected')
  }

  // 2. Category Filter
  if (filterCategory.value) {
    list = list.filter(p => p.category === filterCategory.value)
  }

  // 3. Keyword Search Filter
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(p => 
      p.title.toLowerCase().includes(kw) || 
      p.author.toLowerCase().includes(kw)
    )
  }

  return list
})

const paginatedPosts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredPosts.value.slice(start, end)
})

function formatTime(value: string) {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}

function parseCategory(tags: any) {
  try {
    const list = typeof tags === 'string' ? JSON.parse(tags) : tags
    return Array.isArray(list) && list.length ? list[0] : '睡眠科普'
  } catch (error) {
    return '睡眠科普'
  }
}

async function fetchPosts() {
  try {
    const res: any = await request.get('/api/admin/content/articles')
    posts.value = (res.data || []).map((row: any) => ({
      id: String(row.id),
      title: row.title,
      author: row.nickname || row.phone || '用户',
      avatar: (row.nickname || row.phone || '用').charAt(0),
      category: parseCategory(row.tags),
      views: 0,
      likes: Number(row.likes_count || 0),
      comments: Number(row.comments_count || 0),
      createTime: formatTime(row.created_at),
      status: row.status || 'pending',
      isTop: Boolean(row.is_top)
    }))
  } catch (error) {
    MessagePlugin.error('加载内容列表失败')
  }
}

async function approve(id: string) {
  const p = posts.value.find(p => p.id === id)
  if (p) {
    await request.put(`/api/admin/content/articles/${id}`, { status: 'approved' })
    p.status = 'approved'
    MessagePlugin.success('帖子已审核通过，已公开展示！')
  }
}

async function reject(id: string) {
  const p = posts.value.find(p => p.id === id)
  if (p) {
    await request.put(`/api/admin/content/articles/${id}`, { status: 'rejected' })
    p.status = 'rejected'
    MessagePlugin.success('已拒绝/下架该帖子')
  }
}

async function toggleTop(id: string) {
  const p = posts.value.find(p => p.id === id)
  if (p) {
    await request.put(`/api/admin/content/articles/${id}`, { is_top: !p.isTop })
    p.isTop = !p.isTop
    MessagePlugin.success(p.isTop ? '该帖子已置顶展示' : '已取消置顶展示')
  }
}

async function handleDelete(id: string) {
  const idx = posts.value.findIndex(p => p.id === id)
  if (idx !== -1) {
    await request.delete(`/api/admin/content/articles/${id}`)
    posts.value.splice(idx, 1)
    MessagePlugin.success('文章帖子已成功删除')
  }
}

const stats = computed(() => ({
  total: posts.value.length,
  pending: posts.value.filter(p => p.status === 'pending').length,
  today: posts.value.filter(p => p.createTime.startsWith('2026-06-05') || p.createTime.startsWith('2026-06-04')).length,
}))

function getAvatarBg(author: string) {
  if (author === '官方发布' || author === '官方客服' || author === '鼾静助手') {
    return 'linear-gradient(135deg, #3B6BF5, #1D4ED8)'
  }
  return 'linear-gradient(135deg, #F5A623, #FFD700)'
}

onMounted(fetchPosts)
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">科普文章</div>
        <div class="page-title-sub">共 {{ stats.total }} 篇科普文章，包含 {{ stats.pending }} 篇待审核内容</div>
      </div>
      <button class="btn btn-primary" @click="router.push('/content/edit')">➕ 撰写科普文章</button>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid-3">
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon blue">📝</div>
        </div>
        <div class="stat-card-value" style="color: #3B6BF5;">
          {{ stats.total }}
          <span style="font-size: 14px; font-weight: 500; color: #9CA3AF; margin-left: 2px;">篇</span>
        </div>
        <div class="stat-card-label">帖子文章总数</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon gold">⏳</div>
        </div>
        <div class="stat-card-value" style="color: #F5A623;">
          {{ stats.pending }}
          <span style="font-size: 14px; font-weight: 500; color: #9CA3AF; margin-left: 2px;">篇</span>
        </div>
        <div class="stat-card-label">待审核</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon green">🆕</div>
        </div>
        <div class="stat-card-value" style="color: #16A34A;">
          {{ stats.today }}
          <span style="font-size: 14px; font-weight: 500; color: #9CA3AF; margin-left: 2px;">篇</span>
        </div>
        <div class="stat-card-label">近期新增</div>
      </div>
    </div>

    <!-- Panel -->
    <div class="panel">
      <!-- Filter Bar -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <div 
            class="filter-tab" 
            :class="{ active: activeStatusTab === 'all' }" 
            @click="activeStatusTab = 'all'"
          >
            全部
          </div>
          <div 
            class="filter-tab" 
            :class="{ active: activeStatusTab === 'pending' }" 
            @click="activeStatusTab = 'pending'"
          >
            待审核 <span style="opacity: 0.6; margin-left: 4px;">{{ stats.pending }}</span>
          </div>
          <div 
            class="filter-tab" 
            :class="{ active: activeStatusTab === 'approved' }" 
            @click="activeStatusTab = 'approved'"
          >
            已通过
          </div>
          <div 
            class="filter-tab" 
            :class="{ active: activeStatusTab === 'rejected' }" 
            @click="activeStatusTab = 'rejected'"
          >
            已拒绝
          </div>
        </div>

        <div style="display: flex; gap: 10px; align-items: center;">
          <select v-model="filterCategory" class="filter-select" style="width: 120px; cursor: pointer;">
            <option value="">全部分类</option>
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
          <input 
            type="text" 
            v-model="searchKeyword" 
            class="filter-input" 
            placeholder="🔍 搜索标题/作者" 
            style="width: 200px;"
          >
        </div>
      </div>

      <!-- Data Table -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="min-width: 250px;">文章标题</th>
              <th style="width: 130px;">发布作者</th>
              <th style="width: 100px;">文章分类</th>
              <th style="width: 80px;">阅读量</th>
              <th style="width: 80px;">点赞数</th>
              <th style="width: 80px;">评论数</th>
              <th style="width: 150px;">发布时间</th>
              <th style="width: 100px;">状态</th>
              <th style="width: 330px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="post in paginatedPosts" :key="post.id">
              <td>
                <div style="font-weight: 600; color: #1F2937; display: flex; align-items: center; gap: 6px;">
                  <span v-if="post.isTop" style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #FEF2F2; color: #EF4444; font-weight: 700; flex-shrink: 0;">置顶</span>
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" :title="post.title">{{ post.title }}</span>
                </div>
              </td>
              <td>
                <div class="name-cell">
                  <div class="avatar-xs" :style="{ background: getAvatarBg(post.author) }">
                    {{ post.avatar }}
                  </div>
                  <span style="font-size: 13px; color: #4B5563;">{{ post.author }}</span>
                </div>
              </td>
              <td>
                <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #F3F4F6; color: #4B5563; font-weight: 500;">
                  {{ post.category }}
                </span>
              </td>
              <td style="font-weight: 600;">{{ post.views.toLocaleString() }}</td>
              <td style="font-weight: 600;">{{ post.likes }}</td>
              <td style="font-weight: 600;">{{ post.comments }}</td>
              <td style="font-size: 12px; color: #9CA3AF;">{{ post.createTime }}</td>
              <td>
                <span class="status-tag gold" v-if="post.status === 'pending'">待审核</span>
                <span class="status-tag green" v-else-if="post.status === 'approved'">已通过</span>
                <span class="status-tag red" v-else-if="post.status === 'rejected'">已下架</span>
              </td>
              <td>
                <div style="display: flex; gap: 6px; justify-content: flex-end;">
                  <button class="btn btn-xs btn-success" @click="approve(post.id)" v-if="post.status === 'pending'">通过</button>
                  <button class="btn btn-xs btn-danger" @click="reject(post.id)" v-if="post.status === 'pending'">拒绝</button>
                  <button class="btn btn-xs btn-outline" @click="router.push('/content/edit/' + post.id)">编辑</button>
                  <button class="btn btn-xs btn-outline" @click="toggleTop(post.id)">{{ post.isTop ? '取消置顶' : '置顶' }}</button>
                  <button class="btn btn-xs btn-danger" style="background: #FEF2F2; color: #EF4444; border: 1px solid #FEE2E2;" @click="handleDelete(post.id)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedPosts.length === 0">
              <td colspan="9" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无匹配的科普文章数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredPosts.length"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Panels */
.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  margin-bottom: 0;
}
.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #F3F4F6;
  background: #fff;
}

/* Button styles matching mockup global CSS */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 150ms ease;
  font-family: inherit;
}
.btn-primary {
  background: #3B6BF5;
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
  color: #3B6BF5;
}
.btn-success {
  background: #ECFDF5;
  color: #16A34A;
  border: 1px solid #BBF7D0;
}
.btn-success:hover {
  background: #D3F5E3;
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
  padding: 4px 10px;
  font-size: 11px;
}

/* Filter components */
.filter-tabs {
  display: flex;
  gap: 0;
}
.filter-tab {
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  border: 1px solid #E5E7EB;
  background: #fff;
  transition: all 150ms;
}
.filter-tab:first-child {
  border-radius: 6px 0 0 6px;
}
.filter-tab:last-child {
  border-radius: 0 6px 6px 0;
}
.filter-tab + .filter-tab {
  border-left: none;
}
.filter-tab.active {
  background: #3B6BF5;
  color: #fff;
  border-color: #3B6BF5;
}

.filter-input, .filter-select {
  padding: 6px 12px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  outline: none;
  transition: border-color 150ms;
}
.filter-input:focus, .filter-select:focus {
  border-color: #3B6BF5;
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-label {
  font-size: 13px;
  color: #6B7280;
}

/* Table styles matching mockup */
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #F9FAFB;
  border-bottom: 1px solid #F3F4F6;
}
.data-table td {
  padding: 14px 16px;
  font-size: 13px;
  color: #374151;
  border-bottom: 1px solid #F9FAFB;
  vertical-align: middle;
}
.data-table tr:hover td {
  background-color: #F9FAFB;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.avatar-xs {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  color: #fff;
  flex-shrink: 0;
}
.actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.pagination-footer {
  padding: 16px 20px;
  border-top: 1px solid #F3F4F6;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* Rounded Status tags with indicator dots */
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}
.status-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.status-tag.green {
  background: #ecfdf5;
  color: #16a34a;
}
.status-tag.green::before {
  background: #10b981;
}
.status-tag.gray {
  background: #f3f4f6;
  color: #6b7280;
}
.status-tag.gray::before {
  background: #9ca3af;
}
.status-tag.gold {
  background: #FFFBEB;
  color: #D97706;
}
.status-tag.gold::before {
  background: #F59E0B;
}
.status-tag.red {
  background: #fef2f2;
  color: #ef4444;
}
.status-tag.red::before {
  background: #f87171;
}

/* KPI Cards Layout */
.stat-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.stat-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.stat-card-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.stat-card-icon.gold { background: #FFFBEB; }
.stat-card-icon.blue { background: #EEF4FF; }
.stat-card-icon.green { background: #ECFDF5; }

.stat-card-value {
  font-size: 26px;
  font-weight: 800;
  color: #1F2937;
}
.stat-card-label {
  font-size: 12px;
  color: #9CA3AF;
  margin-top: 4px;
}
</style>
