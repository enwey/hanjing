<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const rows = ref<any[]>([])

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

async function loadData() {
  try {
    const res: any = await request.get('/api/promoter/products')
    rows.value = res.data || []
  } catch (_error) {
    MessagePlugin.error('加载推广商品失败')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="page-container">
    <div class="page-title-block">
      <div class="page-title">推广商品</div>
      <div class="page-sub">当前推广员可推广的商品列表与佣金比例展示</div>
    </div>

    <section class="product-grid">
    <article v-for="item in rows" :key="item.id" class="product-card">
      <img class="product-image" :src="item.image_url || '/brand-koala.png'" :alt="item.name" />
      <div class="product-body">
        <div class="product-name">{{ item.name }}</div>
        <div class="product-desc">{{ item.description || '暂无商品描述' }}</div>
        <div class="product-meta">
          <span>售价 ¥{{ yuan(item.price) }}</span>
          <span>库存 {{ item.stock || 0 }}</span>
        </div>
        <div class="product-commission">
          一级佣金 {{ item.commission_rate || 0 }}% / 二级佣金 {{ item.commission_rate_level2 || 0 }}%
        </div>
      </div>
    </article>

    <div v-if="rows.length === 0" class="empty-block">暂无推广商品</div>
    </section>
  </div>
</template>

<style scoped>
.page-title-block {
  margin-bottom: 4px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
}

.page-sub {
  margin-top: 4px;
  font-size: 13px;
  color: #9ca3af;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.product-card {
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.product-image {
  width: 100%;
  height: 220px;
  object-fit: cover;
  background: #f8fafc;
}

.product-body {
  padding: 16px 20px;
}

.product-name {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.product-desc {
  margin-top: 8px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
  min-height: 42px;
}

.product-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
  font-size: 13px;
  color: #334155;
}

.product-commission {
  margin-top: 12px;
  font-size: 12px;
  color: #1a9d5c;
  background: #ecfdf5;
  border-radius: 8px;
  padding: 10px 12px;
}

.empty-block {
  grid-column: 1 / -1;
  background: #fff;
  border: 1px dashed #cbd5e1;
  color: #94a3b8;
  border-radius: 12px;
  padding: 48px 0;
  text-align: center;
}
</style>
