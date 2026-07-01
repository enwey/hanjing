<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

interface Category {
  id: string
  name: string
  sortOrder: number
  createdAt: string
}

const categories = ref<Category[]>([])
const loading = ref(false)
const showEdit = ref(false)
const isEdit = ref(false)
const currentId = ref('')

const formData = ref({
  name: '',
  sortOrder: 0
})

async function fetchCategories() {
  loading.value = true
  try {
    const res: any = await request.get('/api/admin/content/categories')
    if (res.code === 200) {
      categories.value = (res.data || []).map((row: any) => ({
        id: String(row.id),
        name: row.name,
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at
      }))
    }
  } catch (error) {
    MessagePlugin.error('加载分类列表失败')
  } finally {
    loading.value = false
  }
}

function handleAdd() {
  isEdit.value = false
  currentId.value = ''
  formData.value = {
    name: '',
    sortOrder: 10
  }
  showEdit.value = true
}

function handleEdit(row: Category) {
  isEdit.value = true
  currentId.value = row.id
  formData.value = {
    name: row.name,
    sortOrder: row.sortOrder
  }
  showEdit.value = true
}

async function handleSave() {
  if (!formData.value.name.trim()) {
    MessagePlugin.warning('请输入分类名称')
    return
  }

  try {
    const payload = {
      name: formData.value.name.trim(),
      sort_order: Number(formData.value.sortOrder || 0)
    }

    if (isEdit.value && currentId.value) {
      const res: any = await request.put(`/api/admin/content/categories/${currentId.value}`, payload)
      if (res.code === 200) {
        MessagePlugin.success('更新分类成功')
        showEdit.value = false
        fetchCategories()
      } else {
        MessagePlugin.error(res.message || '更新分类失败')
      }
    } else {
      const res: any = await request.post('/api/admin/content/categories', payload)
      if (res.code === 200) {
        MessagePlugin.success('添加分类成功')
        showEdit.value = false
        fetchCategories()
      } else {
        MessagePlugin.error(res.message || '添加分类失败')
      }
    }
  } catch (error: any) {
    console.error(error)
    MessagePlugin.error('操作失败')
  }
}

async function handleDelete(id: string) {
  try {
    const res: any = await request.delete(`/api/admin/content/categories/${id}`)
    if (res.code === 200) {
      MessagePlugin.success('删除分类成功')
      fetchCategories()
    } else {
      MessagePlugin.error(res.message || '删除分类失败')
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('删除分类失败')
  }
}

onMounted(() => {
  fetchCategories()
})
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">科普文章分类管理</div>
        <div class="page-title-sub">管理打鼾、呼吸机等科普文章的前端筛选分类及权重排序</div>
      </div>
      <button class="btn btn-primary" @click="handleAdd"><AppIcon name="plus" /> 添加分类</button>
    </div>

    <div class="panel">
      <div class="panel-body" style="padding: 0;">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>分类名称</th>
              <th>排序权重 (数值越小越靠前)</th>
              <th>创建时间</th>
              <th style="text-align: right; width: 160px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in categories" :key="row.id">
              <td>{{ row.id }}</td>
              <td style="font-weight: 600; color: #1F2937;">{{ row.name }}</td>
              <td>{{ row.sortOrder }}</td>
              <td>{{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '—' }}</td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;">
                  <button class="btn btn-xs btn-outline" @click="handleEdit(row)">编辑</button>
                  <t-popconfirm content="确认删除该分类吗？" @confirm="handleDelete(row.id)">
                    <button class="btn btn-xs btn-danger">删除</button>
                  </t-popconfirm>
                </div>
              </td>
            </tr>
            <tr v-if="categories.length === 0 && !loading">
              <td colspan="5" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无分类数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Dialog -->
    <t-dialog
      v-model:visible="showEdit"
      :header="isEdit ? '编辑分类' : '添加分类'"
      @confirm="handleSave"
      :cancelBtn="null"
      width="400px"
    >
      <div style="padding: 12px 0;">
        <div style="margin-bottom: 16px;">
          <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">分类名称 <span style="color:red">*</span></label>
          <input type="text" class="form-control" v-model="formData.name" placeholder="请输入分类名称" style="width: 100%;">
        </div>
        <div>
          <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px;">排序权重</label>
          <input type="number" class="form-control" v-model.number="formData.sortOrder" placeholder="如 10" style="width: 100%;">
          <span style="font-size: 11px; color: #9CA3AF; margin-top: 4px; display: block;">数值越小，展示在手机端的分类越靠前。</span>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  margin-top: 16px;
}
</style>
