<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

interface Category {
  id: string
  code: string
  name: string
  sortOrder: number
  createdAt: string
}

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'device', code: 'device', name: '医疗器械', sortOrder: 10, createdAt: '' },
  { id: 'accessory', code: 'accessory', name: '配件耗材', sortOrder: 20, createdAt: '' },
  { id: 'service', code: 'service', name: '服务套餐', sortOrder: 30, createdAt: '' }
]

const categories = ref<Category[]>([])
const loading = ref(false)
const showEdit = ref(false)
const isEdit = ref(false)
const currentId = ref('')
const apiReady = ref(true)

const formData = ref({
  name: '',
  sortOrder: 0
})

async function fetchCategories() {
  loading.value = true
  try {
    const res: any = await request.get('/api/admin/product-categories')
    if (res.code === 200) {
      apiReady.value = true
      categories.value = (res.data || []).map((row: any) => ({
        id: String(row.id),
        code: row.code,
        name: row.name,
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at
      }))
    }
  } catch (error) {
    const status = (error as any)?.response?.status
    if (status === 404) {
      apiReady.value = false
      categories.value = DEFAULT_CATEGORIES
      MessagePlugin.warning('当前后端还未部署商品分类接口，先展示默认分类')
    } else {
      MessagePlugin.error('加载商品分类失败')
    }
  } finally {
    loading.value = false
  }
}

function handleAdd() {
  if (!apiReady.value) {
    MessagePlugin.warning('当前后端还未部署商品分类接口，暂时不能新增分类')
    return
  }
  isEdit.value = false
  currentId.value = ''
  formData.value = {
    name: '',
    sortOrder: (categories.value.length + 1) * 10
  }
  showEdit.value = true
}

function handleEdit(row: Category) {
  if (!apiReady.value) {
    MessagePlugin.warning('当前后端还未部署商品分类接口，暂时不能编辑分类')
    return
  }
  isEdit.value = true
  currentId.value = row.id
  formData.value = {
    name: row.name,
    sortOrder: row.sortOrder
  }
  showEdit.value = true
}

async function handleSave() {
  const name = formData.value.name.trim()
  if (!name) {
    MessagePlugin.warning('请填写分类名称')
    return
  }

  try {
    const payload = {
      name,
      sort_order: Number(formData.value.sortOrder || 0)
    }

    if (isEdit.value && currentId.value) {
      const res: any = await request.put(`/api/admin/product-categories/${currentId.value}`, payload)
      if (res.code === 200) {
        MessagePlugin.success('更新商品分类成功')
        showEdit.value = false
        fetchCategories()
      } else {
        MessagePlugin.error(res.message || '更新商品分类失败')
      }
    } else {
      const res: any = await request.post('/api/admin/product-categories', payload)
      if (res.code === 200) {
        MessagePlugin.success('添加商品分类成功')
        showEdit.value = false
        fetchCategories()
      } else {
        MessagePlugin.error(res.message || '添加商品分类失败')
      }
    }
  } catch (error) {
    MessagePlugin.error('操作失败')
  }
}

async function handleDelete(id: string) {
  if (!apiReady.value) {
    MessagePlugin.warning('当前后端还未部署商品分类接口，暂时不能删除分类')
    return
  }
  try {
    const res: any = await request.delete(`/api/admin/product-categories/${id}`)
    if (res.code === 200) {
      MessagePlugin.success('删除商品分类成功')
      fetchCategories()
    } else {
      MessagePlugin.error(res.message || '删除商品分类失败')
    }
  } catch (error) {
    MessagePlugin.error('删除商品分类失败')
  }
}

onMounted(fetchCategories)
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">商品分类管理</div>
        <div class="page-title-sub">维护后台与小程序商城共用的商品分类，“全部”由小程序自动汇总生成。</div>
      </div>
      <button class="btn btn-primary" @click="handleAdd"><AppIcon name="plus" /> 添加分类</button>
    </div>

    <div v-if="!apiReady" class="warning-banner">
      当前后端还未部署商品分类接口，所以这里先显示默认分类且仅只读。要支持新增/编辑/删除分类，需要先部署最新后端。
    </div>

    <div class="panel">
      <div class="panel-body" style="padding: 0;">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>分类标识</th>
              <th>分类名称</th>
              <th>排序权重</th>
              <th>创建时间</th>
              <th style="text-align: right; width: 160px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in categories" :key="row.id">
              <td>{{ row.id }}</td>
              <td><code>{{ row.code }}</code></td>
              <td style="font-weight: 600; color: #1F2937;">{{ row.name }}</td>
              <td>{{ row.sortOrder }}</td>
              <td>{{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '—' }}</td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;">
                  <button class="btn btn-xs btn-outline" @click="handleEdit(row)">编辑</button>
                  <t-popconfirm content="确认删除该商品分类吗？" @confirm="handleDelete(row.id)">
                    <button class="btn btn-xs btn-danger">删除</button>
                  </t-popconfirm>
                </div>
              </td>
            </tr>
            <tr v-if="categories.length === 0 && !loading">
              <td colspan="6" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无商品分类数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <t-dialog
      v-model:visible="showEdit"
      :header="isEdit ? '编辑商品分类' : '添加商品分类'"
      @confirm="handleSave"
      :cancelBtn="null"
      width="420px"
    >
      <div class="dialog-form">
        <div class="form-group">
          <label class="form-label">分类名称</label>
          <input
            v-model="formData.name"
            type="text"
            class="form-control"
            placeholder="请输入商品分类名称，例如：配件耗材"
          >
          <span class="form-help">系统会自动生成内部标识，你只需要维护展示名称即可。</span>
        </div>
        <div class="form-group">
          <label class="form-label">排序权重</label>
          <input
            v-model.number="formData.sortOrder"
            type="number"
            class="form-control"
            placeholder="请输入排序权重，例如：20"
          >
          <span class="form-help">数值越小，分类展示越靠前。</span>
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

.warning-banner {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #FFF7ED;
  border: 1px solid #FED7AA;
  color: #C2410C;
  font-size: 13px;
  line-height: 1.6;
}

.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 13px;
  color: #1F2937;
  outline: none;
  background: #fff;
  transition: all 150ms ease;
  height: 36px;
  box-sizing: border-box;
}

.form-control:focus {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 2px rgba(59, 107, 245, 0.1);
}

.form-control:hover {
  border-color: #BCCFFF;
}

.form-help {
  font-size: 11px;
  color: #9CA3AF;
  line-height: 1.5;
}
</style>
