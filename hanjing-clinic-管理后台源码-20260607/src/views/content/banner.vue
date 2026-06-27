<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

interface Banner {
  id: string;
  sort: number;
  title: string;
  previewText: string;
  previewColor: string;
  link: string;
  validity: string;
  status: string; // active (展示中), inactive (已下架), expired (已过期)
}

const banners = ref<Banner[]>([])
const loading = ref(false)

const currentPage = ref(1)
const pageSize = ref(30)

const activeTab = ref('all')
const searchKeyword = ref('')

const filteredBanners = computed(() => {
  return banners.value.filter(b => {
    const matchStatus = activeTab.value === 'all' || b.status === activeTab.value
    const kw = searchKeyword.value.trim().toLowerCase()
    const matchKeyword = !kw || 
      b.title.toLowerCase().includes(kw) || 
      b.link.toLowerCase().includes(kw)
    return matchStatus && matchKeyword
  })
})

const paginatedBanners = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredBanners.value.slice(start, end)
})

watch([activeTab, searchKeyword], () => {
  currentPage.value = 1
})

const showEdit = ref(false)
const isEdit = ref(false)
const editIndex = ref(-1)
const formData = ref<Partial<Banner>>({
  title: '',
  previewText: '',
  previewColor: 'linear-gradient(135deg, #1A3580, #3B6BF5)',
  link: '',
  validity: '长期'
})

function mapBanner(row: any): Banner {
  return {
    id: String(row.id),
    sort: Number(row.sort_order || row.sort || 0),
    title: row.title || '',
    previewText: row.preview_text || row.previewText || '',
    previewColor: row.preview_color || row.previewColor || 'linear-gradient(135deg, #1A3580, #3B6BF5)',
    link: row.link_url || row.link || '',
    validity: row.validity || '长期',
    status: row.status || 'inactive'
  }
}

function toPayload(banner: Partial<Banner>) {
  return {
    title: banner.title,
    preview_text: banner.previewText,
    preview_color: banner.previewColor,
    link_url: banner.link,
    validity: banner.validity,
    status: banner.status,
    sort_order: banner.sort
  }
}

async function fetchBanners() {
  loading.value = true
  try {
    const res: any = await request.get('/api/admin/content/banners')
    banners.value = (res.data || []).map(mapBanner)
  } catch (error) {
    MessagePlugin.error('加载轮播图失败')
  } finally {
    loading.value = false
  }
}

function handleAdd() {
  isEdit.value = false
  editIndex.value = -1
  formData.value = {
    title: '',
    previewText: '',
    previewColor: 'linear-gradient(135deg, #1A3580, #3B6BF5)',
    link: '',
    validity: '长期'
  }
  showEdit.value = true
}

async function handleEdit(id: string) {
  const idx = banners.value.findIndex(b => b.id === id)
  if (idx === -1) return
  isEdit.value = true
  editIndex.value = idx
  formData.value = { ...banners.value[idx] }
  showEdit.value = true
}

async function handleToggle(id: string) {
  const idx = banners.value.findIndex(b => b.id === id)
  if (idx === -1) return
  const b = banners.value[idx]
  if (b.status === 'expired') {
    MessagePlugin.warning('过期的轮播图无法重新上架，请先修改有效期')
    return
  }
  const nextStatus = b.status === 'active' ? 'inactive' : 'active'
  try {
    await request.put(`/api/admin/content/banners/${id}`, { status: nextStatus })
    b.status = nextStatus
    MessagePlugin.success(`轮播图 [${b.title}] 已${nextStatus === 'active' ? '上架展示' : '下架'}`)
  } catch (error) {
    MessagePlugin.error('更新轮播图状态失败')
  }
}

async function moveSort(id: string, direction: 'up' | 'down') {
  const index = banners.value.findIndex(b => b.id === id)
  if (index === -1) return
  if (direction === 'up' && index > 0) {
    const temp = banners.value[index]
    banners.value[index] = banners.value[index - 1]
    banners.value[index - 1] = temp
  } else if (direction === 'down' && index < banners.value.length - 1) {
    const temp = banners.value[index]
    banners.value[index] = banners.value[index + 1]
    banners.value[index + 1] = temp
  }
  // Reset sort sequence number
  banners.value.forEach((b, idx) => b.sort = idx + 1)
  try {
    await Promise.all(
      banners.value.map(b => request.put(`/api/admin/content/banners/${b.id}`, { sort_order: b.sort }))
    )
    MessagePlugin.success('已调整展示顺序')
  } catch (error) {
    MessagePlugin.error('保存排序失败')
    fetchBanners()
  }
}

async function handleDelete(id: string) {
  const idx = banners.value.findIndex(b => b.id === id)
  if (idx === -1) return
  try {
    await request.delete(`/api/admin/content/banners/${id}`)
    banners.value.splice(idx, 1)
    banners.value.forEach((b, i) => b.sort = i + 1)
    MessagePlugin.success('已成功删除轮播图')
  } catch (error) {
    MessagePlugin.error('删除轮播图失败')
  }
}

async function handleSave() {
  if (!formData.value.title || !formData.value.previewText) {
    MessagePlugin.warning('请填写标题与预览文字')
    return
  }
  
  try {
    if (isEdit.value && editIndex.value >= 0) {
      const nextBanner = {
        ...banners.value[editIndex.value],
        ...formData.value
      } as Banner
      await request.put(`/api/admin/content/banners/${nextBanner.id}`, toPayload(nextBanner))
      MessagePlugin.success('保存轮播图配置成功')
    } else {
      await request.post('/api/admin/content/banners', toPayload({
        ...formData.value,
        sort: banners.value.length + 1,
        status: 'active'
      }))
      MessagePlugin.success('新增轮播图成功')
    }
    showEdit.value = false
    fetchBanners()
  } catch (error) {
    MessagePlugin.error(isEdit.value ? '保存轮播图失败' : '新增轮播图失败')
  }
}

onMounted(fetchBanners)

const operationColumnWidth = computed(() => {
  if (paginatedBanners.value.length === 0) return '80px'
  const hasInactive = paginatedBanners.value.some(b => b.status === 'inactive')
  return hasInactive ? '340px' : '280px'
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
        <div class="page-title">轮播图管理</div>
        <div class="page-title-sub">小程序首页轮播Banner</div>
      </div>
      <button class="btn btn-primary" @click="handleAdd">➕ 添加轮播图</button>
    </div>

    <!-- Banner List Table -->
    <div class="panel">
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <div
            :class="['filter-tab', activeTab === 'all' ? 'active' : '']"
            @click="activeTab = 'all'"
          >
            全部
          </div>
          <div
            :class="['filter-tab', activeTab === 'active' ? 'active' : '']"
            @click="activeTab = 'active'"
          >
            展示中
          </div>
          <div
            :class="['filter-tab', activeTab === 'inactive' ? 'active' : '']"
            @click="activeTab = 'inactive'"
          >
            已下架
          </div>
          <div
            :class="['filter-tab', activeTab === 'expired' ? 'active' : '']"
            @click="activeTab = 'expired'"
          >
            已过期
          </div>
        </div>

        <input 
          type="text" 
          v-model="searchKeyword" 
          class="filter-input" 
          placeholder="🔍 搜索标题/跳转链接" 
          style="width: 200px;"
        >
      </div>

      <div class="panel-body">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>排序</th>
              <th>预览</th>
              <th>标题</th>
              <th>跳转链接</th>
              <th>有效期</th>
              <th>展示状态</th>
              <th :style="{ width: operationColumnWidth, minWidth: operationColumnWidth, textAlign: 'right' }">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in paginatedBanners" :key="b.id">
              <td style="font-weight: 700; color: var(--primary-500);">{{ b.sort }}</td>
              <td>
                <div class="banner-preview-box" :style="{ background: b.previewColor }">
                  {{ b.previewText }}
                </div>
              </td>
              <td style="font-weight: 600; color: #1F2937;">{{ b.title }}</td>
              <td style="font-size: 12px; color: var(--primary-500);">{{ b.link }}</td>
              <td style="font-size: 12px; color: #6B7280;">{{ b.validity }}</td>
              <td>
                <span class="status-tag green" v-if="b.status === 'active'">展示中</span>
                <span class="status-tag gray" v-else-if="b.status === 'inactive'">已下架</span>
                <span class="status-tag gray" v-else-if="b.status === 'expired'">已过期</span>
              </td>
              <td :style="{ width: operationColumnWidth, minWidth: operationColumnWidth }">
                <div style="display: flex; gap: 4px; justify-content: flex-end;">
                  <button class="btn btn-xs btn-outline" @click="handleEdit(b.id)">编辑</button>
                  
                  <!-- Sort Up/Down arrows -->
                  <button class="btn btn-xs btn-outline" @click="moveSort(b.id, 'up')" :disabled="banners.findIndex(item => item.id === b.id) === 0">↑</button>
                  <button class="btn btn-xs btn-outline" @click="moveSort(b.id, 'down')" :disabled="banners.findIndex(item => item.id === b.id) === banners.length - 1">↓</button>
                  
                  <button
                    class="btn btn-xs btn-danger"
                    @click="handleToggle(b.id)"
                    v-if="b.status === 'active'"
                  >
                    下架
                  </button>
                  <button
                    class="btn btn-xs btn-success"
                    @click="handleToggle(b.id)"
                    v-if="b.status === 'inactive'"
                  >
                    上架
                  </button>
                  <button
                    class="btn btn-xs btn-danger"
                    @click="handleDelete(b.id)"
                    v-if="b.status === 'expired' || b.status === 'inactive'"
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedBanners.length === 0">
              <td colspan="7" style="text-align:center;color:#9CA3AF;padding:40px 0;">暂无匹配的轮播图数据</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- 分页 footer -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredBanners.length"
          :pageSizeOptions="[30, 60, 100]"
          style="width: 100%; border: none; padding: 0; display: flex; justify-content: flex-end;"
        />
      </div>
    </div>

    <!-- Edit Dialog -->
    <t-dialog
      v-model:visible="showEdit"
      :header="isEdit ? '编辑轮播图' : '添加轮播图'"
      @confirm="handleSave"
      :cancelBtn="null"
    >
      <div class="dialog-body-form" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label class="form-label">Banner 标题</label>
          <input type="text" class="form-control" v-model="formData.title" placeholder="例如：世界睡眠日特惠活动">
        </div>
        <div class="form-group">
          <label class="form-label">预览文字</label>
          <input type="text" class="form-control" v-model="formData.previewText" placeholder="例如：💤 睡眠日特惠">
        </div>
        <div class="form-group">
          <label class="form-label">背景颜色 (CSS Linear-gradient 或 Hex)</label>
          <input type="text" class="form-control" v-model="formData.previewColor" placeholder="例如：linear-gradient(135deg, #1A3580, #3B6BF5)">
        </div>
        <div class="form-group">
          <label class="form-label">跳转链接</label>
          <input type="text" class="form-control" v-model="formData.link" placeholder="例如：→ 商品详情（睡眠监测套餐）">
        </div>
        <div class="form-group">
          <label class="form-label">有效期</label>
          <input type="text" class="form-control" v-model="formData.validity" placeholder="例如：5/1 - 6/30 或 长期">
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



/* Preview Banner Box */
.banner-preview-box {
  width: 80px;
  height: 45px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
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

/* Status tags */
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
</style>
