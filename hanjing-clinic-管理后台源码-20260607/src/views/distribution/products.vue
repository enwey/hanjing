<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useRouter } from 'vue-router'
import request from '@/utils/request'

interface Product {
  id: string
  name: string
  desc: string
  icon: string
  imageUrl: string
  price: number
  originalPrice: number
  galleryUrls: string[]
  stock: number
  sales: number
  isDistribution: boolean
  commission1: number
  commission2: number
  status: string
}

const router = useRouter()

const currentPage = ref(1)
const pageSize = ref(30)
const products = ref<Product[]>([])
const searchKeyword = ref('')
const activeStatusTab = ref('all')

const filteredProducts = computed(() => {
  let list = products.value

  if (activeStatusTab.value === 'on') {
    list = list.filter(product => product.status === 'on')
  } else if (activeStatusTab.value === 'off') {
    list = list.filter(product => product.status === 'off')
  } else if (activeStatusTab.value === 'distribution') {
    list = list.filter(product => product.isDistribution)
  }

  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    list = list.filter(product => product.name.toLowerCase().includes(keyword))
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

const operationColumnWidth = computed(() => {
  if (paginatedProducts.value.length === 0) {
    return '80px'
  }

  let maxButtons = 1
  for (const row of paginatedProducts.value) {
    if (row.status === 'on' || row.status === 'off' || row.isDistribution) {
      maxButtons = Math.max(maxButtons, 3)
    }
  }

  if (maxButtons === 3) return '240px'
  if (maxButtons === 2) return '160px'
  return '80px'
})

watch(operationColumnWidth, () => {
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'))
  }, 100)
})

function handleAdd() {
  router.push('/products/edit')
}

function handleEdit(productId: string) {
  router.push(`/products/edit/${productId}`)
}

function mapProduct(row: any): Product {
  let galleryUrls: string[] = []
  if (row.gallery_urls) {
    try {
      galleryUrls = Array.isArray(row.gallery_urls) ? row.gallery_urls : JSON.parse(row.gallery_urls)
    } catch (error) {
      galleryUrls = []
    }
  }

  return {
    id: String(row.id),
    name: row.name,
    desc: row.description || '',
    icon: row.category === 'device' ? 'mask' : row.category === 'product' ? 'wind' : 'bed',
    imageUrl: row.image_url || '',
    price: Number(row.price || 0) / 100,
    originalPrice: row.original_price ? Number(row.original_price) / 100 : 0,
    galleryUrls,
    stock: Number(row.stock || 0),
    sales: Number(row.sales_count || 0),
    isDistribution: Number(row.is_distribution || 0) === 1,
    commission1: Number(row.commission_rate || 0),
    commission2: 0,
    status: row.status || 'off'
  }
}

async function fetchProducts() {
  try {
    const res: any = await request.get('/api/admin/products')
    products.value = (res.data || []).map(mapProduct)
  } catch (error) {
    MessagePlugin.error('加载商品列表失败')
  }
}

async function handleToggle(productId: string) {
  const index = products.value.findIndex(product => product.id === productId)
  if (index === -1) return

  const product = products.value[index]
  const nextStatus = product.status === 'on' ? 'off' : 'on'

  try {
    await request.put(`/api/admin/products/${productId}`, { status: nextStatus })
    product.status = nextStatus
    MessagePlugin.success(nextStatus === 'on' ? '商品已上架' : '商品已下架')
  } catch (error) {
    MessagePlugin.error('更新商品状态失败')
  }
}

async function handleToggleDistribution(productId: string) {
  const index = products.value.findIndex(product => product.id === productId)
  if (index === -1) return

  const product = products.value[index]
  const nextIsDistribution = !product.isDistribution

  try {
    await request.put(`/api/admin/products/${productId}`, {
      is_distribution: nextIsDistribution ? 1 : 0
    })
    product.isDistribution = nextIsDistribution
    MessagePlugin.success(nextIsDistribution ? '已开启分销推广' : '已取消分销推广')
  } catch (error) {
    MessagePlugin.error('更新分销状态失败')
  }
}

function getIconBoxClass(product: Product) {
  if (product.status === 'off') return 'product-icon-box grayscale'
  if (product.icon === 'bed') return 'product-icon-box blue-grad'
  if (product.icon === 'mask') return 'product-icon-box green-grad'
  if (product.icon === 'wind') return 'product-icon-box orange-grad'
  return 'product-icon-box default-grad'
}

onMounted(fetchProducts)
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">商品管理</div>
        <div class="page-title-sub">统一管理小程序商城商品，上下架与是否参与分销都在这里设置</div>
      </div>
      <button class="btn btn-primary" @click="handleAdd"><AppIcon name="plus" /> 添加商品</button>
    </div>

    <div class="panel">
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
            :class="{ active: activeStatusTab === 'on' }"
            @click="activeStatusTab = 'on'"
          >
            已上架
          </div>
          <div
            class="filter-tab"
            :class="{ active: activeStatusTab === 'distribution' }"
            @click="activeStatusTab = 'distribution'"
          >
            分销商品
          </div>
          <div
            class="filter-tab"
            :class="{ active: activeStatusTab === 'off' }"
            @click="activeStatusTab = 'off'"
          >
            已下架
          </div>
        </div>

        <input
          v-model="searchKeyword"
          type="text"
          class="filter-input"
          placeholder="搜索商品名称"
          style="width: 210px;"
        >
      </div>

      <div class="panel-body" style="padding: 0;">
        <table class="data-table product-data-table" v-resizable>
          <thead>
            <tr>
              <th class="product-col">商品</th>
              <th>价格</th>
              <th>库存</th>
              <th>一级佣金</th>
              <th>二级佣金</th>
              <th>销量</th>
              <th>商城状态</th>
              <th>分销状态</th>
              <th class="action-col" :style="{ width: operationColumnWidth, minWidth: operationColumnWidth }">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in paginatedProducts" :key="product.id">
              <td>
                <div class="product-cell">
                  <div :class="getIconBoxClass(product)" style="flex-shrink: 0;">
                    <AppIcon :name="product.icon" size="28" />
                  </div>
                  <div class="product-info">
                    <div
                      :style="{ fontWeight: '600', color: product.status === 'on' ? '#1F2937' : '#9CA3AF' }"
                      style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
                    >
                      {{ product.name }}
                    </div>
                    <div style="font-size: 11px; color: #9CA3AF; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      {{ product.desc }}
                    </div>
                  </div>
                </div>
              </td>
              <td :style="{ fontWeight: '700', color: product.status === 'on' ? '#1F2937' : '#9CA3AF' }">
                ¥{{ product.price.toLocaleString() }}
              </td>
              <td :style="{ color: product.status === 'on' ? '#1F2937' : '#9CA3AF', fontWeight: '600' }">
                {{ product.stock }}
              </td>
              <td :style="{ color: product.isDistribution ? '#F5A623' : '#9CA3AF', fontWeight: '600' }">
                <span v-if="product.isDistribution">
                  {{ product.commission1 }}% (¥{{ ((product.price * product.commission1) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 }) }})
                </span>
                <span v-else>—</span>
              </td>
              <td :style="{ color: product.isDistribution ? '#F5A623' : '#9CA3AF', fontWeight: '600' }">
                <span v-if="product.isDistribution">
                  {{ product.commission2 }}% (¥{{ ((product.price * product.commission2) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 }) }})
                </span>
                <span v-else>—</span>
              </td>
              <td :style="{ fontWeight: '600', color: product.status === 'on' ? '#1F2937' : '#9CA3AF' }">
                {{ product.sales }}
              </td>
              <td>
                <span v-if="product.status === 'on'" class="status-tag green">已上架</span>
                <span v-else class="status-tag gray">已下架</span>
              </td>
              <td>
                <span v-if="product.isDistribution" class="status-tag blue">分销商品</span>
                <span v-else class="status-tag gray">普通商品</span>
              </td>
              <td class="action-col" :style="{ width: operationColumnWidth, minWidth: operationColumnWidth }">
                <div class="actions">
                  <button class="btn btn-xs btn-outline" @click="handleEdit(product.id)">编辑</button>
                  <button v-if="product.status === 'on'" class="btn btn-xs btn-danger" @click="handleToggle(product.id)">下架</button>
                  <button v-else class="btn btn-xs btn-success" @click="handleToggle(product.id)">上架</button>
                  <button v-if="product.isDistribution" class="btn btn-xs btn-warning" @click="handleToggleDistribution(product.id)">取消推广</button>
                  <button v-else class="btn btn-xs btn-outline" @click="handleToggleDistribution(product.id)">设为推广</button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedProducts.length === 0">
              <td colspan="9" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无商品数据</td>
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
  </div>
</template>

<style scoped>
.actions {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.product-data-table {
  width: max-content !important;
  min-width: 100%;
}

.product-data-table th,
.product-data-table td {
  width: auto;
}

.product-data-table th.action-col,
.product-data-table td.action-col {
  text-align: center !important;
}

.product-data-table .product-col {
  width: 420px;
  min-width: 360px;
  max-width: 480px;
}

.product-cell {
  width: 420px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.product-info {
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

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

.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: #3B6BF5;
  color: #fff;
}

.btn-primary:hover {
  background: #2557DC;
  box-shadow: 0 4px 12px rgba(59, 107, 245, 0.2);
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

.btn-warning {
  background: #FFF7ED;
  color: #C2410C;
  border: 1px solid #FED7AA;
}

.btn-warning:hover {
  background: #FFEDD5;
}

.btn-xs {
  padding: 5px 12px;
  font-size: 12px;
}

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

.pagination-footer {
  padding: 16px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #F3F4F6;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 20px;
}

.status-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-tag.green {
  background: #EDFBF5;
  color: #10B981;
}

.status-tag.green::before {
  background: #10B981;
}

.status-tag.gray {
  background: #F3F4F6;
  color: #6B7280;
}

.status-tag.gray::before {
  background: #9CA3AF;
}

.status-tag.blue {
  background: #EFF6FF;
  color: #2563EB;
}

.status-tag.blue::before {
  background: #3B82F6;
}

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
