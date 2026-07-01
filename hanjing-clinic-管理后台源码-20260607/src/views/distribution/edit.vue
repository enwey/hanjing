<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useRoute, useRouter } from 'vue-router'
import request from '@/utils/request'
import { navigateToParent } from '@/utils/routeNavigation'
import { MdEditor, MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

interface Product {
  id: string;
  name: string;
  desc: string;
  icon: string; // 'bed', 'mask', 'wind'
  imageUrl: string;
  price: number;
  originalPrice: number;
  galleryUrls: string[];
  stock: number;
  isDistribution: boolean;
  commission1: number; // percent
  commission2: number; // percent
  status: string; // 'on', 'off'
}

const route = useRoute()
const router = useRouter()

const isEdit = ref(false)
const editorMode = ref<'edit' | 'preview'>('edit')

const formData = ref<Partial<Product>>({
  name: '',
  desc: '',
  icon: 'bed',
  imageUrl: '',
  price: 0,
  originalPrice: 0,
  galleryUrls: [],
  stock: 0,
  isDistribution: false,
  commission1: 15,
  commission2: 5,
  status: 'on'
})

const mainImageInputRef = ref<HTMLInputElement | null>(null)
const galleryImageInputRef = ref<HTMLInputElement | null>(null)

function deleteMainImage() {
  formData.value.imageUrl = ''
}

function deleteGalleryImage(index: number) {
  if (formData.value.galleryUrls) {
    formData.value.galleryUrls.splice(index, 1)
  }
}

function handleImageError(event: Event) {
  const target = event.target as HTMLImageElement;
  target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNjAnIGhlaWdodD0nOTAnIHZpZXdCb3g9JzAgMCAxNjAgOTAnPjxyZWN0IHdpZHRoPScxMDAlJyBoZWlnaHQ9JzEwMCUnIGZpbGw9JyNGRkY1RjUnLz48dGV4dCB4PSc1MCUnIHk9JzUwJScgZG9taW5hbnQtYmFzZWxpbmU9J21pZGRsZScgdGV4dC1hbmNob3I9J21pZGRsZScgZm9udC1mYW1pbHk9J3NhbnMtc2VyaWYnIGZvbnQtc2l6ZT0nMTInIGZpbGw9JyNFRjQ0NDQnPuWbvueJh+WKoOi9veWksei0pTwvdGV4dD48L3N2Zz4=';
}

async function uploadImageFile(file: File, context = 'product-image'): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  
  const res: any = await request.post('/api/admin/uploads/images', {
    fileName: file.name,
    mimeType: file.type,
    fileData: dataUrl,
    context
  })
  
  return res.data?.url || ''
}

async function handleMainImageUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const url = await uploadImageFile(file, 'product-image')
    formData.value.imageUrl = url
    MessagePlugin.success('主图上传成功')
  } catch (error) {
    MessagePlugin.error('图片上传失败')
  } finally {
    target.value = ''
  }
}

async function handleGalleryImageUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const url = await uploadImageFile(file, 'product-image')
    if (!formData.value.galleryUrls) {
      formData.value.galleryUrls = []
    }
    formData.value.galleryUrls.push(url)
    MessagePlugin.success('图集图片上传成功')
  } catch (error) {
    MessagePlugin.error('图片上传失败')
  } finally {
    target.value = ''
  }
}

async function handleDescImageUpload(files: File[], callback: (urls: string[]) => void) {
  try {
    const urls = await Promise.all(
      files.map(file => uploadImageFile(file, 'product-desc'))
    )
    callback(urls)
    MessagePlugin.success('插图上传并插入成功')
  } catch (error) {
    MessagePlugin.error('图片上传失败')
  }
}

function toPayload(prod: Partial<Product>) {
  return {
    name: prod.name,
    category: prod.icon === 'mask' ? 'device' : prod.icon === 'wind' ? 'product' : 'service',
    image_url: prod.imageUrl || '/static/products/default.png',
    price: Math.round(Number(prod.price || 0) * 100),
    original_price: prod.originalPrice ? Math.round(Number(prod.originalPrice) * 100) : null,
    description: prod.desc || '',
    stock: Number(prod.stock || 0),
    is_distribution: prod.isDistribution ? 1 : 0,
    commission_rate: Number(prod.commission1 || 0),
    status: prod.status || 'off',
    gallery_urls: JSON.stringify(prod.galleryUrls || [])
  }
}

function handleCancel() {
  navigateToParent(router, route, '/products')
}

async function handleSave() {
  if (!formData.value.name || !formData.value.price) {
    MessagePlugin.warning('请填写商品名称和价格')
    return
  }
  
  try {
    if (isEdit.value && route.params.id) {
      await request.put(`/api/admin/products/${route.params.id}`, toPayload(formData.value))
      MessagePlugin.success('保存商品配置成功')
    } else {
      await request.post('/api/admin/products', toPayload(formData.value))
      MessagePlugin.success('添加商品成功')
    }
    navigateToParent(router, route, '/products')
  } catch (error) {
    MessagePlugin.error(isEdit.value ? '保存商品配置失败' : '添加商品失败')
  }
}

onMounted(async () => {
  const prodId = route.params.id
  if (prodId) {
    isEdit.value = true
    try {
      const res: any = await request.get(`/api/admin/products/${prodId}`)
      const row = res.data
      if (row) {
        let gUrls: string[] = []
        if (row.gallery_urls) {
          try {
            gUrls = Array.isArray(row.gallery_urls) ? row.gallery_urls : JSON.parse(row.gallery_urls)
          } catch (e) {
            gUrls = []
          }
        }
        formData.value = {
          id: String(row.id),
          name: row.name,
          desc: row.description || '',
          icon: row.category === 'device' ? 'mask' : row.category === 'product' ? 'wind' : 'bed',
          imageUrl: row.image_url || '',
          price: Number(row.price || 0) / 100,
          originalPrice: row.original_price ? Number(row.original_price) / 100 : 0,
          galleryUrls: gUrls,
          stock: Number(row.stock || 0),
          isDistribution: !!row.is_distribution,
          commission1: Number(row.commission_rate || 0),
          commission2: 0,
          status: row.status || 'off'
        }
      }
    } catch (error) {
      MessagePlugin.error('加载商品详情失败')
      navigateToParent(router, route, '/products')
    }
  } else {
    isEdit.value = false
    formData.value = {
      name: '',
      desc: '',
      icon: 'bed',
      imageUrl: '',
      price: 0,
      originalPrice: 0,
      galleryUrls: [],
      stock: 0,
      isDistribution: false,
      commission1: 15,
      commission2: 5,
      status: 'on'
    }
  }
})
</script>

<template>
  <div class="page-container">
    <div class="edit-page-workspace">
      <!-- Edit Page Header -->
      <div class="page-title-row">
        <div>
          <div class="page-title">{{ isEdit ? '编辑商品' : '添加商品' }}</div>
          <div class="page-title-sub">{{ isEdit ? '修改已有的商品规格、描述及分销比例' : '手动在商城中上架新商品' }}</div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <t-button variant="outline" theme="default" @click="handleCancel">取消</t-button>
          <t-button theme="primary" @click="handleSave">保存并发布</t-button>
        </div>
      </div>

      <!-- Two Column Grid Editor Workspace -->
      <div class="edit-grid">
        <!-- Left Column: Content & Media -->
        <div class="edit-col-left">
          <!-- Card 1: Basic Info -->
          <div class="edit-card">
            <div class="card-header">基本信息</div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">商品名称 <span class="required">*</span></label>
                <input type="text" class="form-control" v-model="formData.name" placeholder="请输入商品名称，如：智能睡眠呼吸机">
              </div>
              <div class="form-group" style="margin-top: 14px;">
                <label class="form-label">分类/类型</label>
                <select class="form-control" v-model="formData.icon">
                  <option value="bed">服务类型 (诊疗/睡眠咨询服务)</option>
                  <option value="mask">医疗器械 (呼吸面罩/耗材)</option>
                  <option value="wind">商城商品 (呼吸机/风机/配件)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Card 2: Media and Swiper Gallery -->
          <div class="edit-card">
            <div class="card-header">商品图片及轮播图集</div>
            <div class="card-body" style="display: flex; flex-direction: column; gap: 18px;">
              <!-- Main Cover image uploader with single placeholder -->
              <div class="form-group">
                <label class="form-label">商品主图/封面图 <span class="required">*</span></label>
                <div class="image-uploader-single">
                  <div v-if="formData.imageUrl" class="uploaded-box">
                    <img :src="formData.imageUrl" class="uploaded-img" @error="handleImageError">
                    <div class="uploader-overlay">
                      <span class="action-btn delete" @click.stop="deleteMainImage">删除</span>
                      <span class="action-btn replace" @click.stop="mainImageInputRef?.click()">更换</span>
                    </div>
                  </div>
                  <div class="upload-placeholder" v-else @click="mainImageInputRef?.click()">
                    <AppIcon name="image-plus" size="24" style="color: #3B6BF5;" />
                    <span class="upload-text">点击上传主图</span>
                  </div>
                  <input 
                    ref="mainImageInputRef" 
                    type="file" 
                    accept="image/*" 
                    class="hidden-input" 
                    @change="handleMainImageUpload"
                  >
                </div>
              </div>

              <!-- Swiper gallery uploader arranged horizontally -->
              <div class="form-group">
                <label class="form-label">详情页轮播图集 (建议 3-5 张，首图默认为主图)</label>
                <div class="image-uploader-gallery">
                  <div v-for="(img, idx) in formData.galleryUrls" :key="idx" class="gallery-uploaded-box">
                    <img :src="img" class="gallery-uploaded-img" @error="handleImageError">
                    <button type="button" class="gallery-delete-badge" @click="deleteGalleryImage(idx)">×</button>
                  </div>
                  <div 
                    v-if="!formData.galleryUrls || formData.galleryUrls.length < 9" 
                    class="gallery-placeholder" 
                    @click="galleryImageInputRef?.click()"
                  >
                    <AppIcon name="plus" size="20" style="color: #9CA3AF;" />
                    <span style="font-size: 11px; color: #9CA3AF; margin-top: 4px;">添加图片</span>
                  </div>
                  <input 
                    ref="galleryImageInputRef" 
                    type="file" 
                    accept="image/*" 
                    class="hidden-input" 
                    @change="handleGalleryImageUpload"
                  >
                </div>
              </div>
            </div>
          </div>

          <!-- Card 3: Markdown Details -->
          <div class="edit-card">
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
              <span>详情图文描述 (Markdown 编辑器)</span>
              <div class="editor-tabs">
                <span class="editor-tab" :class="{ active: editorMode === 'edit' }" @click="editorMode = 'edit'">编辑内容</span>
                <span class="editor-tab" :class="{ active: editorMode === 'preview' }" @click="editorMode = 'preview'">查看预览</span>
              </div>
            </div>
            <div class="card-body" style="padding: 10px;">
              <MdEditor
                v-if="editorMode === 'edit'"
                v-model="formData.desc"
                placeholder="用 Markdown 编写您的商品详情描述（支持插图和文字混合排版）..."
                style="height: 460px;"
                :preview="false"
                :toolbars="['bold', 'underline', 'italic', '-', 'title', 'strikeThrough', 'sub', 'sup', 'quote', 'unorderedList', 'orderedList', 'task', '-', 'codeRow', 'code', 'link', 'image', 'table', 'mermaid', 'katex', '-', 'revoke', 'next']"
                @onUploadImg="handleDescImageUpload"
              />
              <MdPreview
                v-else
                v-model="formData.desc"
                style="height: 460px; overflow-y: auto;"
              />
            </div>
          </div>
        </div>

        <!-- Right Column: Settings, pricing, stock and commissions -->
        <div class="edit-col-right">
          <!-- Card 4: Price & Stock -->
          <div class="edit-card">
            <div class="card-header">售价与库存</div>
            <div class="card-body" style="display: flex; flex-direction: column; gap: 14px;">
              <div class="form-group">
                <label class="form-label">销售价格 (元) <span class="required">*</span></label>
                <input type="number" class="form-control" v-model.number="formData.price" placeholder="请输入销售价格">
              </div>
              <div class="form-group">
                <label class="form-label">划线原价 (元)</label>
                <input type="number" class="form-control" v-model.number="formData.originalPrice" placeholder="请输入划线原价（可选）">
              </div>
              <div class="form-group">
                <label class="form-label">初始库存</label>
                <input type="number" class="form-control" v-model.number="formData.stock" min="0" placeholder="请输入库存">
              </div>
              <div class="form-group">
                <label class="form-label">上架状态</label>
                <select class="form-control" v-model="formData.status">
                  <option value="on">立即上架 (小程序商城可见)</option>
                  <option value="off">下架暂存</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Card 5: Promotion & Distribution -->
          <div class="edit-card">
            <div class="card-header" style="display: flex; align-items: center; justify-content: space-between;">
              <span>分销推广</span>
              <label class="checkbox-row" style="margin: 0;">
                <input type="checkbox" v-model="formData.isDistribution">
                <span>设为分销商品</span>
              </label>
            </div>
            <div class="card-body">
              <div v-if="formData.isDistribution" style="display: flex; flex-direction: column; gap: 14px; animation: fadeIn 0.2s ease;">
                <div class="form-group">
                  <label class="form-label">一级推广佣金比例 (%)</label>
                  <input type="number" class="form-control" v-model.number="formData.commission1" min="1" max="100" placeholder="如 15">
                </div>
                <div class="form-group">
                  <label class="form-label">二级推广佣金比例 (%)</label>
                  <input type="number" class="form-control" v-model.number="formData.commission2" min="1" max="100" placeholder="如 5">
                </div>
                <div class="form-help">开启分销后，分销员推广售出该商品，将按以上设定的百分比获得提成返佣。</div>
              </div>
              <div v-else style="color: #9CA3AF; font-size: 13px; text-align: center; padding: 12px 0;">
                开启分销推广后，可以具体设置一级与二级推广的分销返利佣金比例。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Single Image Uploader */
.image-uploader-single {
  width: 120px;
  height: 120px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px dashed #D1D5DB;
  background: #F9FAFB;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
}
.image-uploader-single:hover {
  border-color: #3B6BF5;
  background: #EFF6FF;
}
.upload-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.upload-text {
  font-size: 12px;
  color: #6B7280;
  font-weight: 500;
}
.uploaded-box {
  width: 100%;
  height: 100%;
  position: relative;
}
.uploaded-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.uploader-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}
.uploaded-box:hover .uploader-overlay {
  opacity: 1;
}
.action-btn {
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}
.action-btn.delete {
  background: #DC2626;
}
.action-btn.delete:hover {
  background: #B91C1C;
}
.action-btn.replace {
  background: #3B6BF5;
}
.action-btn.replace:hover {
  background: #2563EB;
}

/* Gallery Horizontal Grid */
.image-uploader-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.gallery-uploaded-box {
  width: 90px;
  height: 90px;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  border: 1px solid #E5E7EB;
}
.gallery-uploaded-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gallery-delete-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  border: none;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gallery-delete-badge:hover {
  background: #DC2626;
}
.gallery-placeholder {
  width: 90px;
  height: 90px;
  border-radius: 8px;
  border: 1px dashed #D1D5DB;
  background: #F9FAFB;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}
.gallery-placeholder:hover {
  border-color: #3B6BF5;
  background: #EFF6FF;
}

.hidden-input {
  display: none;
}

/* Full page edit workspace */
.edit-page-workspace {
  animation: fadeIn 0.18s ease-out;
}

.back-link {
  transition: color 0.15s;
}
.back-link:hover {
  color: #3B6BF5;
}

.edit-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 20px;
  align-items: flex-start;
  margin-top: 10px;
}

@media (max-width: 1024px) {
  .edit-grid {
    grid-template-columns: 1fr;
  }
}

.edit-col-left, .edit-col-right {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.edit-card {
  background: #ffffff;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
  overflow: hidden;
}

.edit-card .card-header {
  padding: 14px 20px;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  border-bottom: 1px solid #F3F4F6;
  background: #FAFAFA;
}

.edit-card .card-body {
  padding: 20px;
}

.required {
  color: #EF4444;
  margin-left: 2px;
}

/* Editor Tabs */
.editor-tabs {
  display: flex;
  gap: 6px;
  background: #F3F4F6;
  padding: 3px;
  border-radius: 6px;
}
.editor-tab {
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}
.editor-tab.active {
  background: #ffffff;
  color: #3B6BF5;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

/* Distribution panel animations */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

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
  transition: all 0.15s;
}
.form-control:focus {
  border-color: #3B6BF5;
  box-shadow: 0 0 0 3px rgba(59, 107, 245, 0.1);
}
select.form-control {
  height: 38px;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 16px;
  padding-right: 36px;
}

.checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
}
.checkbox-row input {
  width: 15px;
  height: 15px;
  accent-color: #3B6BF5;
}
.form-help {
  color: #9CA3AF;
  font-size: 12px;
  line-height: 1.5;
}
</style>
