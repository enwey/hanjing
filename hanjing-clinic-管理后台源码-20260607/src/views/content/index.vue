<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { hasPermission } from '@/utils/permission'
import { formatShanghaiDateTime } from '@/utils/dateTime'

const router = useRouter()

const searchKeyword = ref('')
const filterCategory = ref('')
const activeStatusTab = ref('all') // 'all', 'draft', 'pending', 'approved', 'rejected'

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

const categories = ref<string[]>([])

const filteredPosts = computed(() => {
  let list = posts.value

  // 1. Status Tab Filter
  if (activeStatusTab.value === 'draft') {
    list = list.filter(p => p.status === 'draft')
  } else if (activeStatusTab.value === 'pending') {
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
  return formatShanghaiDateTime(value, false)
}

function parseCategory(tags: any) {
  try {
    const list = typeof tags === 'string' ? JSON.parse(tags) : tags
    return Array.isArray(list) && list.length ? list[0] : '未分类'
  } catch (error) {
    return '未分类'
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
      status: row.status || 'draft',
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

const rejectionId = ref('')
const rejectionReason = ref('')
const rejectionVisible = ref(false)
const moderationBusy = ref(false)
function reject(id: string) {
  rejectionId.value = id
  rejectionReason.value = ''
  rejectionVisible.value = true
}
async function confirmReject() {
  if (!rejectionReason.value.trim()) return MessagePlugin.warning('请填写拒绝原因')
  if (moderationBusy.value) return
  moderationBusy.value = true
  try {
    await request.put(`/api/admin/content/articles/${rejectionId.value}`, { status: 'rejected', reject_reason: rejectionReason.value.trim() })
    const post = posts.value.find(p => p.id === rejectionId.value)
    if (post) post.status = 'rejected'
    rejectionVisible.value = false
    MessagePlugin.success('审核结果已通知作者')
  } finally { moderationBusy.value = false }
}
const reportsVisible = ref(false)
const reportsLoading = ref(false)
const reports = ref<any[]>([])
const reportTotal = ref(0)
const reportPage = ref(1)
const reportStatus = ref('pending')
const selectedReport = ref<any>(null)
const reportResult = ref('resolved')
const reportExplanation = ref('')
async function fetchReports() {
  if (!hasPermission('content:audit')) return
  reportsLoading.value = true
  try {
    const res: any = await request.get('/api/admin/content/reports', { params: { page: reportPage.value, limit: 10, status: reportStatus.value } })
    reports.value = res.data?.list || []
    reportTotal.value = res.data?.total || 0
  } finally { reportsLoading.value = false }
}
function openReports() { reportsVisible.value = true; reportPage.value = 1; fetchReports() }
function handleReport(row: any) { selectedReport.value = row; reportResult.value = 'resolved'; reportExplanation.value = '' }
async function confirmReport() {
  if (!reportExplanation.value.trim()) return MessagePlugin.warning('请填写可以告知举报人的处理说明')
  if (moderationBusy.value) return
  moderationBusy.value = true
  try {
    await request.put(`/api/admin/content/reports/${selectedReport.value.id}`, { status: reportResult.value, result_text: reportExplanation.value.trim() })
    selectedReport.value = null
    await fetchReports()
    MessagePlugin.success('处理结果已通知举报人')
  } finally { moderationBusy.value = false }
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

interface ArticleComment {
  id: string;
  post_id: string;
  author_name: string;
  author_phone: string;
  parent_author_name: string;
  content: string;
  likes_count: number;
  status: string;
  delete_reason: string;
  deleted_by: string;
  created_at: string;
}

const commentsVisible = ref(false)
const commentsLoading = ref(false)
const commentsArticle = ref<{ id: string; title: string } | null>(null)
const commentsList = ref<ArticleComment[]>([])
const commentStatusFilter = ref('all')
const commentSearchKeyword = ref('')
const commentEditVisible = ref(false)
const commentEditBusy = ref(false)
const editingCommentId = ref('')
const editingCommentContent = ref('')
const editingCommentStatus = ref('approved')

const filteredComments = computed(() => {
  let list = commentsList.value
  if (commentStatusFilter.value !== 'all') {
    list = list.filter(item => item.status === commentStatusFilter.value)
  }
  const kw = commentSearchKeyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(item =>
      item.content.toLowerCase().includes(kw) ||
      item.author_name.toLowerCase().includes(kw) ||
      item.author_phone.toLowerCase().includes(kw)
    )
  }
  return list
})

function syncPostCommentCount() {
  if (!commentsArticle.value) return
  const approvedCount = commentsList.value.filter(item => item.status === 'approved').length
  const post = posts.value.find(p => p.id === commentsArticle.value!.id)
  if (post) post.comments = approvedCount
}

async function fetchArticleComments(articleId: string) {
  commentsLoading.value = true
  try {
    const res: any = await request.get(`/api/admin/content/articles/${articleId}/comments`)
    const payload = res.data || {}
    commentsList.value = (payload.list || []).map((row: any) => ({
      id: String(row.id),
      post_id: String(row.post_id),
      author_name: row.author_name || '用户',
      author_phone: row.author_phone || '',
      parent_author_name: row.parent_author_name || '',
      content: row.content || '',
      likes_count: Number(row.likes_count || 0),
      status: row.status || 'approved',
      delete_reason: row.delete_reason || '',
      deleted_by: row.deleted_by || '',
      created_at: row.created_at || ''
    }))
    syncPostCommentCount()
  } catch (error) {
    MessagePlugin.error('加载评论列表失败')
  } finally {
    commentsLoading.value = false
  }
}

function openComments(post: Post) {
  commentsArticle.value = { id: post.id, title: post.title }
  commentStatusFilter.value = 'all'
  commentSearchKeyword.value = ''
  commentsVisible.value = true
  fetchArticleComments(post.id)
}

function openEditComment(row: ArticleComment) {
  editingCommentId.value = row.id
  editingCommentContent.value = row.content
  editingCommentStatus.value = row.status || 'approved'
  commentEditVisible.value = true
}

async function confirmEditComment() {
  const content = editingCommentContent.value.trim()
  if (!content) return MessagePlugin.warning('评论内容不能为空')
  if (commentEditBusy.value) return
  commentEditBusy.value = true
  try {
    await request.put(`/api/admin/content/comments/${editingCommentId.value}`, {
      content,
      status: editingCommentStatus.value
    })
    commentEditVisible.value = false
    MessagePlugin.success('评论已更新')
    if (commentsArticle.value) await fetchArticleComments(commentsArticle.value.id)
  } finally {
    commentEditBusy.value = false
  }
}

async function deleteArticleComment(row: ArticleComment) {
  await request.delete(`/api/admin/content/comments/${row.id}`)
  MessagePlugin.success('评论已删除')
  if (commentsArticle.value) await fetchArticleComments(commentsArticle.value.id)
}

const stats = computed(() => ({
  total: posts.value.length,
  draft: posts.value.filter(p => p.status === 'draft').length,
  pending: posts.value.filter(p => p.status === 'pending').length,
  today: posts.value.filter(p => p.createTime.startsWith('2026-06-05') || p.createTime.startsWith('2026-06-04')).length,
}))

function getAvatarBg(author: string) {
  if (author === '官方发布' || author === '官方客服' || author === '兴康明助手') {
    return 'linear-gradient(135deg, #3B6BF5, #1D4ED8)'
  }
  return 'linear-gradient(135deg, #F5A623, #FFD700)'
}

async function fetchCategories() {
  try {
    const res: any = await request.get('/api/admin/content/options/categories')
    if (res.code === 200 && res.data) {
      categories.value = res.data.map((cat: any) => cat.name)
    }
  } catch (error) {
    console.error(error)
  }
}

onMounted(() => {
  fetchCategories()
  fetchPosts()
})

const operationColumnWidth = computed(() => {
  if (paginatedPosts.value.length === 0) return '80px'
  const hasPending = paginatedPosts.value.some(p => p.status === 'pending')
  return hasPending ? '410px' : '290px'
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
        <div class="page-title">科普文章</div>
        <div class="page-title-sub">共 {{ stats.total }} 篇科普文章，包含 {{ stats.pending }} 篇待审核内容</div>
      </div>
      <div class="content-header-actions"><button v-permission="'content:audit'" class="btn btn-outline" @click="openReports">举报处理</button><button v-permission="'content:add'" class="btn btn-primary" @click="router.push('/content/edit')"><AppIcon name="plus" />  撰写科普文章</button></div>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-grid-3">
      <div class="stat-card">
        <div class="stat-card-header">
          <div class="stat-card-icon blue"><AppIcon name="file-text" /> </div>
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
            :class="{ active: activeStatusTab === 'draft' }" 
            @click="activeStatusTab = 'draft'"
          >
            草稿 <span style="opacity: 0.6; margin-left: 4px;">{{ stats.draft }}</span>
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
            placeholder="搜索标题/作者" 
            style="width: 200px;"
          >
        </div>
      </div>

      <!-- Data Table -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>文章标题</th>
              <th>发布作者</th>
              <th>文章分类</th>
              <th>阅读量</th>
              <th>点赞数</th>
              <th>评论数</th>
              <th>发布时间</th>
              <th>状态</th>
              <th :style="{ width: operationColumnWidth, minWidth: operationColumnWidth, textAlign: 'right' }">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="post in paginatedPosts" :key="post.id">
              <td>
                <div style="font-weight: 600; color: #1F2937; display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden;">
                  <span v-if="post.isTop" style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #FEF2F2; color: #EF4444; font-weight: 700; flex-shrink: 0;">置顶</span>
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;" :title="post.title">{{ post.title }}</span>
                </div>
              </td>
              <td>
                <div class="name-cell" style="min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 8px;">
                  <div class="avatar-xs" :style="{ background: getAvatarBg(post.author), flexShrink: 0 }">
                    {{ post.avatar }}
                  </div>
                  <span style="font-size: 13px; color: #4B5563; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ post.author }}</span>
                </div>
              </td>
              <td>
                <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: #F3F4F6; color: #4B5563; font-weight: 500;">
                  {{ post.category }}
                </span>
              </td>
              <td style="font-weight: 600;">{{ post.views.toLocaleString() }}</td>
              <td style="font-weight: 600;">{{ post.likes }}</td>
              <td style="font-weight: 600;">
                <span
                  v-if="hasPermission('content:view')"
                  class="comment-count-link"
                  @click="openComments(post)"
                >{{ post.comments }}</span>
                <span v-else>{{ post.comments }}</span>
              </td>
              <td style="font-size: 12px; color: #9CA3AF;">{{ post.createTime }}</td>
              <td>
                <span class="status-tag gray" v-if="post.status === 'draft'">草稿</span>
                <span class="status-tag gold" v-else-if="post.status === 'pending'">待审核</span>
                <span class="status-tag green" v-else-if="post.status === 'approved'">已通过</span>
                <span class="status-tag red" v-else-if="post.status === 'rejected'">已下架</span>
              </td>
              <td :style="{ width: operationColumnWidth, minWidth: operationColumnWidth }">
                <div style="display: flex; gap: 6px; justify-content: flex-end;">
                  <button v-permission="'content:audit'" class="btn btn-xs btn-success" @click="approve(post.id)" v-if="post.status === 'pending'">通过</button>
                  <button v-permission="'content:audit'" class="btn btn-xs btn-danger" @click="reject(post.id)" v-if="post.status === 'pending'">拒绝</button>
                  <button v-permission="'content:view'" class="btn btn-xs btn-outline" @click="openComments(post)">评论</button>
                  <button v-permission="'content:edit'" class="btn btn-xs btn-outline" @click="router.push('/content/edit/' + post.id)">编辑</button>
                  <button v-permission="'content:edit'" class="btn btn-xs btn-outline" @click="toggleTop(post.id)">{{ post.isTop ? '取消置顶' : '置顶' }}</button>
                  <button v-permission="'content:delete'" class="btn btn-xs btn-danger" style="background: #FEF2F2; color: #EF4444; border: 1px solid #FEE2E2;" @click="handleDelete(post.id)">删除</button>
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
    <t-dialog v-model:visible="rejectionVisible" header="拒绝发布" width="480px" :confirm-btn="{ content: '确认拒绝', loading: moderationBusy }" @confirm="confirmReject">
      <t-form label-align="top"><t-form-item label="拒绝原因"><t-textarea v-model="rejectionReason" :maxlength="500" placeholder="请说明需要修改的内容，作者将收到此原因" /></t-form-item></t-form>
    </t-dialog>
    <t-dialog v-model:visible="reportsVisible" header="举报处理" width="min(960px, 94vw)" :footer="false">
      <div class="report-filter"><t-radio-group v-model="reportStatus" variant="default-filled" @change="reportPage = 1; fetchReports()"><t-radio-button value="pending">待处理</t-radio-button><t-radio-button value="all">全部</t-radio-button></t-radio-group></div>
      <t-table :data="reports" :loading="reportsLoading" row-key="id" :columns="[{colKey:'title',title:'举报对象',ellipsis:true},{colKey:'reason',title:'举报原因',width:140},{colKey:'result_text',title:'处理说明',ellipsis:true},{colKey:'status',title:'状态',width:100},{colKey:'operation',title:'操作',width:80}]">
        <template #title="{ row }">
          <div>{{ row.title }}</div>
          <div v-if="row.comment_id" style="font-size: 12px; color: #6B7280; margin-top: 2px;">【评论】{{ row.comment_content || '（评论已删除）' }}</div>
        </template>
        <template #status="{ row }">{{ ({pending:'待处理',resolved:'已处理',dismissed:'不予采纳'} as Record<string,string>)[row.status] || row.status }}</template>
        <template #operation="{ row }"><t-button v-if="row.status === 'pending'" v-permission="'content:audit'" size="small" variant="text" @click="handleReport(row)">处理</t-button><span v-else>—</span></template>
      </t-table>
      <t-pagination v-model="reportPage" :total="reportTotal" :page-size="10" :show-page-size="false" @current-change="fetchReports" />
    </t-dialog>
    <t-dialog :visible="!!selectedReport" header="处理举报" width="480px" :confirm-btn="{ content: '确认处理', loading: moderationBusy }" @close="selectedReport = null" @cancel="selectedReport = null" @confirm="confirmReport">
      <t-form label-align="top"><t-form-item label="处理结果"><t-radio-group v-model="reportResult"><t-radio value="resolved">已核实并处理</t-radio><t-radio value="dismissed">不予采纳</t-radio></t-radio-group></t-form-item><t-form-item label="处理说明"><t-textarea v-model="reportExplanation" :maxlength="1000" placeholder="说明核实结论和已采取的处理措施，请勿包含他人隐私" /></t-form-item></t-form>
    </t-dialog>
    <t-dialog v-model:visible="commentsVisible" :header="commentsArticle ? `文章评论：${commentsArticle.title}` : '文章评论'" width="min(980px, 94vw)" :footer="false">
      <div class="comment-toolbar">
        <t-radio-group v-model="commentStatusFilter" variant="default-filled">
          <t-radio-button value="all">全部 ({{ commentsList.length }})</t-radio-button>
          <t-radio-button value="approved">已通过</t-radio-button>
          <t-radio-button value="pending">待审核</t-radio-button>
          <t-radio-button value="rejected">已隐藏</t-radio-button>
          <t-radio-button value="deleted">已删除</t-radio-button>
        </t-radio-group>
        <input type="text" v-model="commentSearchKeyword" class="filter-input" placeholder="搜索评论内容/评论人" style="width: 220px;" />
      </div>
      <t-table
        :data="filteredComments"
        :loading="commentsLoading"
        row-key="id"
        empty="该文章暂无匹配评论"
        :columns="[
          { colKey: 'content', title: '评论内容', minWidth: 260 },
          { colKey: 'author_name', title: '评论人', width: 140 },
          { colKey: 'likes_count', title: '点赞', width: 70 },
          { colKey: 'status', title: '状态', width: 90 },
          { colKey: 'created_at', title: '评论时间', width: 150 },
          { colKey: 'operation', title: '操作', width: 130 }
        ]"
      >
        <template #content="{ row }">
          <div style="white-space: pre-wrap; word-break: break-word;">
            <span v-if="row.parent_author_name" style="color: #3B6BF5; font-weight: 500;">回复 {{ row.parent_author_name }}：</span>
            <span>{{ row.content }}</span>
          </div>
          <div v-if="row.status === 'deleted'" style="font-size: 12px; color: #9CA3AF; margin-top: 4px;">
            {{ row.deleted_by === 'author' ? '作者已删除' : '平台已移除' }}{{ row.delete_reason ? `：${row.delete_reason}` : '' }}
          </div>
        </template>
        <template #author_name="{ row }">
          <div>{{ row.author_name }}</div>
          <div v-if="row.author_phone" style="font-size: 11px; color: #9CA3AF;">{{ row.author_phone }}</div>
        </template>
        <template #status="{ row }">
          <span class="status-tag green" v-if="row.status === 'approved'">已通过</span>
          <span class="status-tag gold" v-else-if="row.status === 'pending'">待审核</span>
          <span class="status-tag gray" v-else-if="row.status === 'deleted'">已删除</span>
          <span class="status-tag red" v-else>已隐藏</span>
        </template>
        <template #created_at="{ row }">{{ formatTime(row.created_at) }}</template>
        <template #operation="{ row }">
          <div style="display: flex; gap: 6px;">
            <button v-permission="'content:edit'" class="btn btn-xs btn-outline" @click="openEditComment(row)">编辑</button>
            <t-popconfirm v-if="row.status !== 'deleted'" v-permission="'content:delete'" content="删除后该评论有子回复时将显示为已删除占位，子回复仍正常展示，确定删除吗？" @confirm="deleteArticleComment(row)">
              <button class="btn btn-xs btn-danger">删除</button>
            </t-popconfirm>
          </div>
        </template>
      </t-table>
    </t-dialog>
    <t-dialog v-model:visible="commentEditVisible" header="编辑评论" width="520px" :confirm-btn="{ content: '保存修改', loading: commentEditBusy }" @confirm="confirmEditComment">
      <t-form label-align="top">
        <t-form-item label="评论内容">
          <t-textarea v-model="editingCommentContent" :maxlength="1000" :autosize="{ minRows: 3, maxRows: 8 }" placeholder="请输入评论内容" />
        </t-form-item>
        <t-form-item label="展示状态">
          <t-radio-group v-model="editingCommentStatus">
            <t-radio value="approved">已通过（公开展示）</t-radio>
            <t-radio value="pending">待审核</t-radio>
            <t-radio value="rejected">已隐藏</t-radio>
          </t-radio-group>
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.content-header-actions { display:flex;gap:12px;align-items:center; }
.report-filter { margin-bottom:16px; }
.comment-toolbar { display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap; }
.comment-count-link { color:#3B6BF5;cursor:pointer;text-decoration:underline;text-underline-offset:3px; }
:deep(.t-pagination) { margin-top:16px; }
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
