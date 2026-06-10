<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

interface Product {
  id: string;
  name: string;
  desc: string;
  icon: string;
  price: number;
  commission1: number; // percent
  commission2: number; // percent
  promotes: string;
  status: string; // active, inactive
}

const currentPage = ref(1)
const pageSize = ref(30)

const initialProducts: Product[] = [
  { id: '1', name: '睡眠监测套餐', desc: 'PSG + 初诊 + 报告', icon: '🛏️', price: 3680, commission1: 15, commission2: 5, promotes: '246', status: 'active' },
  { id: '2', name: '止鼾器定制', desc: '口腔止鼾器定制', icon: '😷', price: 1280, commission1: 15, commission2: 5, promotes: '128', status: 'active' },
  { id: '3', name: 'CPAP呼吸机', desc: '瑞思迈AirSense 10', icon: '💨', price: 8900, commission1: 12, commission2: 3, promotes: '67', status: 'active' },
  { id: '4', name: '初诊挂号', desc: '含基础检查', icon: '🩺', price: 200, commission1: 10, commission2: 3, promotes: '—', status: 'inactive' }
]

const products = ref<Product[]>(
  Array.from({ length: 35 }, (_, index) => {
    if (index < 4) {
      return { ...initialProducts[index] }
    }
    const base = initialProducts[index % initialProducts.length]
    const status = index % 4 === 3 ? 'inactive' : 'active'
    return {
      ...base,
      id: String(index + 1),
      name: base.name + (index + 1),
      promotes: status === 'active' ? String(10 + index * 3) : '—',
      status
    }
  })
)

const searchKeyword = ref('')
const activeStatusTab = ref('all') // 'all', 'active', 'inactive'

const filteredProducts = computed(() => {
  let list = products.value

  // 1. Status Filter
  if (activeStatusTab.value === 'active') {
    list = list.filter(p => p.status === 'active')
  } else if (activeStatusTab.value === 'inactive') {
    list = list.filter(p => p.status === 'inactive')
  }

  // 2. Keyword Search
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(p => p.name.toLowerCase().includes(kw))
  }

  return list
})

watch([searchKeyword, activeStatusTab], () => {
  currentPage.value = 1
})

const paginatedProducts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredProducts.value.slice(start, end)
})

const showEdit = ref(false)
const isEdit = ref(false)
const editIndex = ref(-1)
const formData = ref<Partial<Product>>({
  name: '',
  desc: '',
  icon: '🛏️',
  price: 0,
  commission1: 15,
  commission2: 5,
  status: 'active'
})

function handleAdd() {
  isEdit.value = false
  formData.value = {
    name: '',
    desc: '',
    icon: '🛏️',
    price: 0,
    commission1: 15,
    commission2: 5,
    status: 'active'
  }
  showEdit.value = true
}

function handleEdit(prodId: string) {
  isEdit.value = true
  const idx = products.value.findIndex(p => p.id === prodId)
  editIndex.value = idx
  const prod = products.value[idx]
  formData.value = { ...prod }
  showEdit.value = true
}

function handleToggle(prodId: string) {
  const idx = products.value.findIndex(p => p.id === prodId)
  if (idx !== -1) {
    const prod = products.value[idx]
    prod.status = prod.status === 'active' ? 'inactive' : 'active'
    if (prod.status === 'inactive') {
      prod.promotes = '—'
    } else {
      prod.promotes = '0'
    }
    MessagePlugin.success(prod.status === 'active' ? '商品已上架推广' : '商品已下架')
  }
}

function handleSave() {
  if (!formData.value.name || !formData.value.price) {
    MessagePlugin.warning('请填写商品名称和价格')
    return
  }
  
  if (isEdit.value) {
    products.value[editIndex.value] = {
      ...products.value[editIndex.value],
      ...formData.value
    } as Product
    MessagePlugin.success('保存商品配置成功')
  } else {
    products.value.push({
      id: String(products.value.length + 1),
      name: formData.value.name || '',
      desc: formData.value.desc || '',
      icon: formData.value.icon || '🛍️',
      price: Number(formData.value.price),
      commission1: Number(formData.value.commission1) || 15,
      commission2: Number(formData.value.commission2) || 5,
      promotes: formData.value.status === 'active' ? '0' : '—',
      status: formData.value.status || 'active'
    })
    MessagePlugin.success('添加推广商品成功')
  }
  showEdit.value = false
}

function getIconBoxClass(prod: Product) {
  if (prod.status === 'inactive') {
    return 'product-icon-box grayscale'
  }
  if (prod.icon === '🛏️') return 'product-icon-box blue-grad'
  if (prod.icon === '😷') return 'product-icon-box green-grad'
  if (prod.icon === '💨') return 'product-icon-box orange-grad'
  return 'product-icon-box default-grad'
}
</script>

<template>
  <div class="page-container">
    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">推广商品管理</div>
        <div class="page-title-sub">设置可推广商品及佣金比例</div>
      </div>
      <button class="btn btn-primary" @click="handleAdd">➕ 添加推广商品</button>
    </div>

    <!-- Products Table -->
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
            :class="{ active: activeStatusTab === 'active' }" 
            @click="activeStatusTab = 'active'"
          >
            推广中
          </div>
          <div 
            class="filter-tab" 
            :class="{ active: activeStatusTab === 'inactive' }" 
            @click="activeStatusTab = 'inactive'"
          >
            已下架
          </div>
        </div>

        <input 
          type="text" 
          v-model="searchKeyword" 
          class="filter-input" 
          placeholder="🔍 搜索商品名称" 
          style="width: 210px;"
        >
      </div>

      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="min-width: 220px;">商品</th>
              <th style="width: 100px;">价格</th>
              <th style="width: 130px;">一级佣金</th>
              <th style="width: 130px;">二级佣金</th>
              <th style="width: 100px;">推广次数</th>
              <th style="width: 100px;">状态</th>
              <th style="width: 160px; min-width: 160px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="prod in paginatedProducts" :key="prod.id">
              <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div :class="getIconBoxClass(prod)">
                    {{ prod.icon }}
                  </div>
                  <div>
                    <div :style="{ fontWeight: '600', color: prod.status === 'active' ? '#1F2937' : '#9CA3AF' }">
                      {{ prod.name }}
                    </div>
                    <div style="font-size: 11px; color: #9CA3AF; margin-top: 2px;">
                      {{ prod.desc }}
                    </div>
                  </div>
                </div>
              </td>
              <td :style="{ fontWeight: '700', color: prod.status === 'active' ? '#1F2937' : '#9CA3AF' }">
                ¥{{ prod.price.toLocaleString() }}
              </td>
              <td :style="{ color: prod.status === 'active' ? '#F5A623' : '#9CA3AF', fontWeight: '600' }">
                {{ prod.commission1 }}% (¥{{ ((prod.price * prod.commission1) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 }) }})
              </td>
              <td :style="{ color: prod.status === 'active' ? '#F5A623' : '#9CA3AF', fontWeight: '600' }">
                {{ prod.commission2 }}% (¥{{ ((prod.price * prod.commission2) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 }) }})
              </td>
              <td :style="{ fontWeight: '600', color: prod.status === 'active' ? '#1F2937' : '#9CA3AF' }">
                {{ prod.promotes }}
              </td>
              <td>
                <span class="status-tag green" v-if="prod.status === 'active'">推广中</span>
                <span class="status-tag gray" v-else-if="prod.status === 'inactive'">已下架</span>
              </td>
              <td>
                <div style="display: flex; gap: 6px; justify-content: flex-end;">
                  <button class="btn btn-xs btn-outline" @click="handleEdit(prod.id)" v-if="prod.status === 'active'">编辑</button>
                  <button class="btn btn-xs btn-danger" @click="handleToggle(prod.id)" v-if="prod.status === 'active'">下架</button>
                  <button class="btn btn-xs btn-success" @click="handleToggle(prod.id)" v-else>上架</button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedProducts.length === 0">
              <td colspan="7" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无推广商品数据</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredProducts.length"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>

    <!-- Edit Dialog -->
    <t-dialog
      v-model:visible="showEdit"
      :header="isEdit ? '编辑推广商品' : '添加推广商品'"
      @confirm="handleSave"
      :cancelBtn="null"
    >
      <div class="dialog-body-form" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label class="form-label">商品名称</label>
          <input type="text" class="form-control" v-model="formData.name" placeholder="请输入商品名称">
        </div>
        <div class="form-group">
          <label class="form-label">商品描述</label>
          <input type="text" class="form-control" v-model="formData.desc" placeholder="请输入商品简短描述">
        </div>
        <div class="form-group">
          <label class="form-label">商品图标 (Emoji)</label>
          <input type="text" class="form-control" v-model="formData.icon" placeholder="如 🛏️, 😷, 💨">
        </div>
        <div class="form-group">
          <label class="form-label">销售价格 (元)</label>
          <input type="number" class="form-control" v-model.number="formData.price" placeholder="请输入售价">
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">一级返佣比例 (%)</label>
            <input type="number" class="form-control" v-model.number="formData.commission1" min="1" max="100">
          </div>
          <div class="form-group">
            <label class="form-label">二级返佣比例 (%)</label>
            <input type="number" class="form-control" v-model.number="formData.commission2" min="1" max="100">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">上架状态</label>
          <select class="form-control" v-model="formData.status">
            <option value="active">推广中</option>
            <option value="inactive">已下架</option>
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
  color: #3B6BF5;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.screen-label::before {
  content: '';
  width: 3px;
  height: 16px;
  background: #3B6BF5;
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
  padding: 5px 12px;
  font-size: 12px;
}

/* Data Table */
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

/* Product icon block */
.product-icon-box {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.product-icon-box.blue-grad {
  background: linear-gradient(135deg, #EEF2FF, #E0E7FF);
}
.product-icon-box.green-grad {
  background: linear-gradient(135deg, #EDFBF5, #D3F5E3);
}
.product-icon-box.orange-grad {
  background: linear-gradient(135deg, #FFF7ED, #FFEDD5);
}
.product-icon-box.default-grad {
  background: linear-gradient(135deg, #F3F4F6, #E5E7EB);
}
.product-icon-box.grayscale {
  background: #F3F4F6;
  filter: grayscale(0.5);
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
.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.form-control {
  padding: 10px 14px;
  border: 1px solid #D1D5DB;
  border-radius: 6px;
  font-size: 13px;
  color: #1F2937;
  outline: none;
  background: #fff;
  transition: border-color 150ms;
}
.form-control:focus {
  border-color: #3B6BF5;
}

.pagination-footer {
  padding: 16px 20px;
  border-top: 1px solid #F3F4F6;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* Tags & Badges */
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

/* Filter components */
.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #F3F4F6;
  background: #fff;
}
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

.filter-input {
  padding: 6px 12px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  outline: none;
  transition: border-color 150ms;
}
.filter-input:focus {
  border-color: #3B6BF5;
}
</style>
