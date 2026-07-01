<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { navigateToParent } from '@/utils/routeNavigation'
import ImageUploadField from '@/components/ImageUploadField.vue'

const router = useRouter()
const route = useRoute()

const articleId = ref(route.params.id as string || '')
const isEdit = ref(!!route.params.id)

const title = ref('')
const category = ref('睡眠科普')
const tags = ref('')
const summary = ref('')
const relatedProduct = ref('')
const relatedDoctor = ref('')
const publishTime = ref('')
const sortWeight = ref(100)
const coverUrl = ref('')

// Rich text editor state
const editorHtml = ref('')

async function fetchArticle() {
  if (!isEdit.value || !articleId.value) return
  try {
    const res: any = await request.get(`/api/admin/content/articles/${articleId.value}`)
    if (res.code === 200 && res.data) {
      const data = res.data
      title.value = data.title || ''
      editorHtml.value = data.content || ''
      coverUrl.value = data.cover_url || ''
      
      let tagList: string[] = []
      if (data.tags) {
        try {
          tagList = Array.isArray(data.tags) ? data.tags : JSON.parse(data.tags)
        } catch (e) {}
      }
      if (tagList.length > 0) {
        category.value = tagList[0]
        tags.value = tagList.slice(1).join(', ')
      } else {
        category.value = '睡眠科普'
        tags.value = ''
      }
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('加载文章详情失败')
  }
}

function handleBack() {
  navigateToParent(router, route, '/content')
}

function handlePreview() {
  MessagePlugin.info('正在生成预览页面...')
}

function buildPayload(status: string) {
  const cat = category.value
  const list = tags.value.split(/[,，]/).map(item => item.trim()).filter(Boolean)
  if (cat) {
    list.unshift(cat)
  }
  return {
    title: title.value,
    content: editorHtml.value,
    tags: list,
    cover_url: coverUrl.value,
    status
  }
}

async function handleSaveDraft() {
  if (!title.value.trim() || !editorHtml.value.trim()) {
    MessagePlugin.warning('请填写文章标题 and 正文')
    return
  }
  try {
    const payload = buildPayload('pending')
    if (isEdit.value && articleId.value) {
      await request.put(`/api/admin/content/articles/${articleId.value}`, payload)
      MessagePlugin.success('保存文章修改成功')
    } else {
      await request.post('/api/admin/content/articles', payload)
      MessagePlugin.success('草稿已成功保存')
    }
    navigateToParent(router, route, '/content')
  } catch (error) {
    console.error(error)
    MessagePlugin.error('保存失败')
  }
}

async function handlePublish() {
  if (!title.value.trim() || !editorHtml.value.trim()) {
    MessagePlugin.warning('请填写文章标题 and 正文')
    return
  }
  try {
    const payload = buildPayload('approved')
    if (isEdit.value && articleId.value) {
      await request.put(`/api/admin/content/articles/${articleId.value}`, payload)
      MessagePlugin.success('文章已更新并发布')
    } else {
      await request.post('/api/admin/content/articles', payload)
      MessagePlugin.success('文章发布成功')
    }
    navigateToParent(router, route, '/content')
  } catch (error) {
    console.error(error)
    MessagePlugin.error('发布失败')
  }
}

const categoryList = ref<string[]>([])

async function fetchCategories() {
  try {
    const res: any = await request.get('/api/admin/content/categories')
    if (res.code === 200 && res.data) {
      categoryList.value = res.data.map((cat: any) => cat.name)
    }
  } catch (error) {
    console.error(error)
  }
}

onMounted(() => {
  fetchCategories()
  fetchArticle()
})
</script>

<template>
  <div class="page-container">


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">{{ isEdit ? '编辑科普文章' : '撰写科普文章' }}</div>
        <div class="page-title-sub">{{ isEdit ? '更新文章内容及分流状态' : '新建健康科普文章或草稿' }}</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" @click="handlePreview">预览</button>
        <button class="btn btn-outline" @click="handleSaveDraft">保存草稿</button>
        <button class="btn btn-primary" @click="handlePublish">发布</button>
      </div>
    </div>

    <!-- Article Editor Panel -->
    <div class="panel">
      <div class="panel-body">
        <div class="form-grid">
          <!-- Title -->
          <div class="form-group full">
            <label class="form-label">文章标题<span class="required">*</span></label>
            <input type="text" class="form-control" v-model="title" placeholder="请输入文章标题">
          </div>

          <!-- Category -->
          <div class="form-group">
            <label class="form-label">分类</label>
            <select class="form-control" v-model="category">
              <option v-for="cat in categoryList" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>

          <!-- Tags -->
          <div class="form-group">
            <label class="form-label">标签</label>
            <input type="text" class="form-control" v-model="tags" placeholder="例如：打鼾, 睡眠呼吸暂停">
          </div>

          <!-- Cover Image -->
          <div class="form-group">
            <label class="form-label">封面图</label>
            <ImageUploadField
              v-model="coverUrl"
              label="文章封面"
              context="article-cover"
              :max-size-mb="2"
              :ratio="16 / 9"
              ratio-label="16:9 横图"
              :min-width="1200"
              :min-height="675"
              preview-ratio="16 / 9"
            />
          </div>

          <!-- Summary -->
          <div class="form-group">
            <label class="form-label">摘要</label>
            <textarea class="form-control" style="min-height: 60px;" v-model="summary" placeholder="请输入文章摘要"></textarea>
          </div>

          <!-- Editor Body -->
          <div class="form-group full">
            <label class="form-label">正文内容</label>
            <div class="rich-editor-box">
              <!-- Toolbar -->
              <div class="editor-toolbar">
                <button class="toolbar-btn bold-btn">B</button>
                <button class="toolbar-btn italic-btn">I</button>
                <button class="toolbar-btn underline-btn">U</button>
                <span class="toolbar-sep">|</span>
                <button class="toolbar-btn">H1</button>
                <button class="toolbar-btn">H2</button>
                <span class="toolbar-sep">|</span>
                <button class="toolbar-btn"><AppIcon name="image-plus" /> </button>
                <button class="toolbar-btn"><AppIcon name="link" /> </button>
                <button class="toolbar-btn"><AppIcon name="clipboard" /> </button>
              </div>
              
              <!-- Content Area -->
              <div
                contenteditable="true"
                class="editor-content-area"
                v-html="editorHtml"
              ></div>
            </div>
          </div>

          <!-- Related Product -->
          <div class="form-group">
            <label class="form-label">关联商品</label>
            <select class="form-control" v-model="relatedProduct">
              <option>无</option>
              <option>睡眠监测套餐</option>
              <option>CPAP呼吸机</option>
            </select>
          </div>

          <!-- Related Doctor -->
          <div class="form-group">
            <label class="form-label">关联医生</label>
            <select class="form-control" v-model="relatedDoctor">
              <option>无</option>
              <option>古堪民 主任医师</option>
            </select>
          </div>

          <!-- Publish Date -->
          <div class="form-group">
            <label class="form-label">发布时间</label>
            <input type="datetime-local" class="form-control" v-model="publishTime">
          </div>

          <!-- Order Weight -->
          <div class="form-group">
            <label class="form-label">排序权重</label>
            <input type="number" class="form-control" v-model.number="sortWeight">
          </div>
        </div>
      </div>
    </div>
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
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
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
  transition: border 150ms;
}
.form-control:focus {
  border-color: #5A85F5;
  box-shadow: 0 0 0 3px rgba(59, 107, 245, 0.08);
}
textarea.form-control {
  resize: vertical;
  min-height: 80px;
}
select.form-control {
  appearance: auto;
}

/* Rich Text Editor Box */
.rich-editor-box {
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  overflow: hidden;
}
.editor-toolbar {
  display: flex;
  gap: 2px;
  padding: 8px 12px;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
  font-size: 14px;
}
.toolbar-btn {
  padding: 4px 8px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
  font-weight: 500;
  color: #4B5563;
}
.toolbar-btn:hover {
  background: #F3F4F6;
  color: #111827;
}
.toolbar-btn.bold-btn { font-weight: 700; }
.toolbar-btn.italic-btn { font-style: italic; }
.toolbar-btn.underline-btn { text-decoration: underline; }
.toolbar-sep {
  color: #E5E7EB;
  margin: 0 4px;
  display: flex;
  align-items: center;
}
.editor-content-area {
  min-height: 220px;
  padding: 16px;
  font-size: 14px;
  line-height: 1.8;
  outline: none;
  background: #fff;
}
</style>
