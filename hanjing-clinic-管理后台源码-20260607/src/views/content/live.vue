<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import ImageUploadField from '@/components/ImageUploadField.vue'

type LiveStatus = 'upcoming' | 'live' | 'replay'

interface LiveRoom {
  id: string
  title: string
  coverUrl: string
  wechatRoomId: string
  wechatAnchorWechat: string
  wechatCoverMediaId: string
  wechatShareMediaId: string
  anchorName: string
  status: LiveStatus
  startTime: string
  endTime: string
  replayUrl: string
  productIds: number[]
  viewerCount: number
}

interface ProductOption {
  id: number
  name: string
  price: number
  status: string
}

const rooms = ref<LiveRoom[]>([])
const products = ref<ProductOption[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(20)
const activeTab = ref<'all' | LiveStatus>('all')
const searchKeyword = ref('')
const showEdit = ref(false)
const isEdit = ref(false)
const syncingId = ref('')
const editingId = ref('')

const defaultCover = ''

const formData = ref({
  title: '',
  coverUrl: defaultCover,
  wechatRoomId: '',
  wechatAnchorWechat: '',
  wechatCoverMediaId: '',
  wechatShareMediaId: '',
  anchorName: '',
  status: 'upcoming' as LiveStatus,
  startTime: '',
  endTime: '',
  replayUrl: '',
  productIds: [] as number[]
})

const statusOptions: Array<{ value: LiveStatus; label: string }> = [
  { value: 'upcoming', label: '预告中' },
  { value: 'live', label: '直播中' },
  { value: 'replay', label: '回放中' }
]

const filteredRooms = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return rooms.value.filter((room) => {
    const matchStatus = activeTab.value === 'all' || room.status === activeTab.value
    const matchKeyword = !keyword ||
      room.title.toLowerCase().includes(keyword) ||
      room.anchorName.toLowerCase().includes(keyword) ||
      room.wechatRoomId.toLowerCase().includes(keyword)
    return matchStatus && matchKeyword
  })
})

const paginatedRooms = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRooms.value.slice(start, start + pageSize.value)
})

const stats = computed(() => ({
  total: rooms.value.length,
  bindWechat: rooms.value.filter((room) => !!room.wechatRoomId).length,
  live: rooms.value.filter((room) => room.status === 'live').length,
  replay: rooms.value.filter((room) => room.status === 'replay').length
}))

watch([activeTab, searchKeyword], () => {
  currentPage.value = 1
})

function normalizeProductIds(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return normalizeProductIds(parsed)
    } catch (error) {
      return []
    }
  }
  return []
}

function mapRoom(row: any): LiveRoom {
  return {
    id: String(row.id),
    title: row.title || '',
    coverUrl: row.cover_url || defaultCover,
    wechatRoomId: row.wechat_room_id ? String(row.wechat_room_id) : '',
    wechatAnchorWechat: row.wechat_anchor_wechat || '',
    wechatCoverMediaId: row.wechat_cover_media_id || '',
    wechatShareMediaId: row.wechat_share_media_id || '',
    anchorName: row.anchor_name || '',
    status: ['upcoming', 'live', 'replay'].includes(row.status) ? row.status : 'upcoming',
    startTime: row.start_time || '',
    endTime: row.end_time || '',
    replayUrl: row.replay_url || '',
    productIds: normalizeProductIds(row.product_ids),
    viewerCount: Number(row.viewer_count || 0)
  }
}

function mapProduct(row: any): ProductOption {
  return {
    id: Number(row.id),
    name: row.name || '',
    price: Number(row.price || 0),
    status: row.status || 'off'
  }
}

function createEmptyForm() {
  return {
    title: '',
    coverUrl: defaultCover,
    wechatRoomId: '',
    wechatAnchorWechat: '',
    wechatCoverMediaId: '',
    wechatShareMediaId: '',
    anchorName: '',
    status: 'upcoming' as LiveStatus,
    startTime: '',
    endTime: '',
    replayUrl: '',
    productIds: [] as number[]
  }
}

function toInputDateTime(value: string) {
  if (!value) return ''
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  return normalized.slice(0, 16)
}

function fromInputDateTime(value: string) {
  return value ? value.replace('T', ' ') + ':00' : ''
}

function toPayload() {
  return {
    title: formData.value.title.trim(),
    cover_url: formData.value.coverUrl.trim(),
    wechat_room_id: formData.value.wechatRoomId.trim(),
    wechat_anchor_wechat: formData.value.wechatAnchorWechat.trim(),
    wechat_cover_media_id: formData.value.wechatCoverMediaId.trim(),
    wechat_share_media_id: formData.value.wechatShareMediaId.trim(),
    anchor_name: formData.value.anchorName.trim(),
    status: formData.value.status,
    start_time: fromInputDateTime(formData.value.startTime),
    end_time: fromInputDateTime(formData.value.endTime),
    replay_url: formData.value.replayUrl.trim(),
    product_ids: formData.value.productIds
  }
}

function getStatusLabel(status: LiveStatus) {
  return statusOptions.find((item) => item.value === status)?.label || '预告中'
}

function getStatusClass(status: LiveStatus) {
  if (status === 'live') return 'red'
  if (status === 'replay') return 'blue'
  return 'gold'
}

function formatTime(value: string) {
  if (!value) return '--'
  const normalized = value.replace('T', ' ')
  return normalized.length >= 16 ? normalized.slice(0, 16) : normalized
}

function getProductNames(productIds: number[]) {
  if (!productIds.length) return '未关联商品'
  const names = productIds
    .map((id) => products.value.find((item) => item.id === id)?.name)
    .filter(Boolean)
  return names.length ? names.join('、') : '未关联商品'
}

async function fetchRooms() {
  loading.value = true
  try {
    const res: any = await request.get('/api/admin/content/live-rooms')
    rooms.value = (res.data || []).map(mapRoom)
  } catch (error) {
    MessagePlugin.error('加载直播列表失败')
  } finally {
    loading.value = false
  }
}

async function fetchProducts() {
  try {
    const res: any = await request.get('/api/admin/distribution/products')
    products.value = (res.data || [])
      .map(mapProduct)
      .filter((item) => item.id && item.status === 'on')
  } catch (error) {
    MessagePlugin.error('加载关联商品失败')
  }
}

function handleAdd() {
  isEdit.value = false
  editingId.value = ''
  formData.value = createEmptyForm()
  showEdit.value = true
}

function handleEdit(id: string) {
  const target = rooms.value.find((room) => room.id === id)
  if (!target) return
  isEdit.value = true
  editingId.value = id
  formData.value = {
    title: target.title,
    coverUrl: target.coverUrl || defaultCover,
    wechatRoomId: target.wechatRoomId,
    wechatAnchorWechat: target.wechatAnchorWechat,
    wechatCoverMediaId: target.wechatCoverMediaId,
    wechatShareMediaId: target.wechatShareMediaId,
    anchorName: target.anchorName,
    status: target.status,
    startTime: toInputDateTime(target.startTime),
    endTime: toInputDateTime(target.endTime),
    replayUrl: target.replayUrl,
    productIds: [...target.productIds]
  }
  showEdit.value = true
}

async function handleSyncWechat(id: string) {
  syncingId.value = id
  try {
    await request.post(`/api/admin/content/live-rooms/${id}/sync-wechat`)
    MessagePlugin.success('已同步微信直播间信息')
    await fetchRooms()
  } catch (error: any) {
    MessagePlugin.error(error?.message || '同步微信直播间失败')
  } finally {
    syncingId.value = ''
  }
}

async function handleDelete(id: string) {
  try {
    await request.delete(`/api/admin/content/live-rooms/${id}`)
    MessagePlugin.success('直播已删除')
    await fetchRooms()
  } catch (error) {
    MessagePlugin.error('删除直播失败')
  }
}

async function handleSave() {
  if (!formData.value.title.trim() || !formData.value.anchorName.trim() || !formData.value.wechatAnchorWechat.trim()) {
    MessagePlugin.warning('请填写直播标题、主播和主播微信号')
    return
  }
  if (!formData.value.startTime || !formData.value.endTime) {
    MessagePlugin.warning('请填写直播开始和结束时间')
    return
  }
  if (formData.value.wechatRoomId.trim() && !/^\d+$/.test(formData.value.wechatRoomId.trim())) {
    MessagePlugin.warning('微信直播间ID必须为纯数字')
    return
  }
  if (!formData.value.coverUrl.trim() || !/^https?:\/\//i.test(formData.value.coverUrl.trim())) {
    MessagePlugin.warning('请上传直播封面')
    return
  }

  try {
    const payload = toPayload()
    if (isEdit.value && editingId.value) {
      await request.put(`/api/admin/content/live-rooms/${editingId.value}`, payload)
      MessagePlugin.success('直播信息已保存')
    } else {
      await request.post('/api/admin/content/live-rooms', payload)
      MessagePlugin.success('直播已创建')
    }
    showEdit.value = false
    await fetchRooms()
  } catch (error) {
    MessagePlugin.error(isEdit.value ? '保存直播失败' : '创建直播失败')
  }
}

async function updateStatus(id: string, status: LiveStatus) {
  const target = rooms.value.find((room) => room.id === id)
  if (!target) return
  try {
    await request.put(`/api/admin/content/live-rooms/${id}`, {
      title: target.title,
      cover_url: target.coverUrl,
      wechat_room_id: target.wechatRoomId,
      wechat_anchor_wechat: target.wechatAnchorWechat,
      wechat_cover_media_id: target.wechatCoverMediaId,
      wechat_share_media_id: target.wechatShareMediaId,
      anchor_name: target.anchorName,
      status,
      start_time: target.startTime,
      end_time: target.endTime || null,
      replay_url: target.replayUrl,
      product_ids: target.productIds
    })
    MessagePlugin.success(`已更新为${getStatusLabel(status)}`)
    await fetchRooms()
  } catch (error) {
    MessagePlugin.error('更新直播状态失败')
  }
}

onMounted(async () => {
  await Promise.all([fetchRooms(), fetchProducts()])
})
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">直播管理</div>
        <div class="page-title-sub">后台直接创建微信直播间，小程序进入官方直播页播放</div>
      </div>
      <button class="btn btn-primary" @click="handleAdd"><AppIcon name="plus" /> 添加直播</button>
    </div>

    <div class="tip-card">
      <div class="tip-title">微信直播</div>
      <div class="tip-text">保存新直播时会自动创建微信直播间，创建成功后直播间ID会自动写入系统。</div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">全部场次</div>
        <div class="stat-value">{{ stats.total }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已绑定微信房间</div>
        <div class="stat-value green">{{ stats.bindWechat }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">直播中</div>
        <div class="stat-value red">{{ stats.live }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">回放中</div>
        <div class="stat-value blue">{{ stats.replay }}</div>
      </div>
    </div>

    <div class="panel">
      <div class="filter-bar">
        <div class="filter-tabs">
          <div :class="['filter-tab', activeTab === 'all' ? 'active' : '']" @click="activeTab = 'all'">全部</div>
          <div :class="['filter-tab', activeTab === 'upcoming' ? 'active' : '']" @click="activeTab = 'upcoming'">预告中</div>
          <div :class="['filter-tab', activeTab === 'live' ? 'active' : '']" @click="activeTab = 'live'">直播中</div>
          <div :class="['filter-tab', activeTab === 'replay' ? 'active' : '']" @click="activeTab = 'replay'">回放中</div>
        </div>
        <input
          v-model="searchKeyword"
          type="text"
          class="filter-input"
          placeholder="搜索标题/主播/直播间ID"
          style="width: 240px;"
        >
      </div>

      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>直播封面</th>
              <th>直播信息</th>
              <th>微信直播间ID</th>
              <th>主播微信号</th>
              <th>主播</th>
              <th>开播时间</th>
              <th>状态</th>
              <th>关联商品</th>
              <th>观看人数</th>
              <th style="width: 1%; white-space: nowrap; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="room in paginatedRooms" :key="room.id">
              <td>
                <img :src="room.coverUrl || defaultCover" class="cover-image" alt="直播封面">
              </td>
              <td>
                <div class="live-title">{{ room.title }}</div>
                <div class="sub-text">业务ID: {{ room.id }}</div>
              </td>
              <td>
                <div class="room-id-text">{{ room.wechatRoomId || '--' }}</div>
              </td>
              <td>{{ room.wechatAnchorWechat || '--' }}</td>
              <td>{{ room.anchorName || '--' }}</td>
              <td>{{ formatTime(room.startTime) }}</td>
              <td>
                <span class="status-tag" :class="getStatusClass(room.status)">
                  {{ getStatusLabel(room.status) }}
                </span>
              </td>
              <td>
                <div class="product-text">{{ getProductNames(room.productIds) }}</div>
              </td>
              <td>{{ room.viewerCount }}</td>
              <td>
                <div class="action-row">
                  <button class="btn btn-xs btn-outline" @click="handleEdit(room.id)">编辑</button>
                  <button
                    class="btn btn-xs btn-outline"
                    :disabled="!room.wechatRoomId || syncingId === room.id"
                    @click="handleSyncWechat(room.id)"
                  >
                    {{ syncingId === room.id ? '同步中...' : '同步微信信息' }}
                  </button>
                  <button v-if="room.status !== 'upcoming'" class="btn btn-xs btn-outline" @click="updateStatus(room.id, 'upcoming')">设为预告</button>
                  <button v-if="room.status !== 'live'" class="btn btn-xs btn-success" @click="updateStatus(room.id, 'live')">设为直播中</button>
                  <button v-if="room.status !== 'replay'" class="btn btn-xs btn-outline" @click="updateStatus(room.id, 'replay')">设为回放</button>
                  <button class="btn btn-xs btn-danger" @click="handleDelete(room.id)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!loading && paginatedRooms.length === 0">
              <td colspan="10" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无直播数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredRooms.length"
          :pageSizeOptions="[20, 50, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>

    <t-dialog
      v-model:visible="showEdit"
      :header="isEdit ? '编辑直播' : '添加直播'"
      :cancelBtn="null"
      @confirm="handleSave"
    >
      <div class="dialog-body-form">
        <div class="form-group">
          <label class="form-label">直播标题</label>
          <input v-model="formData.title" type="text" class="form-control" placeholder="请输入直播标题">
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">主播名称</label>
            <input v-model="formData.anchorName" type="text" class="form-control" placeholder="请输入主播名称">
          </div>
          <div class="form-group">
            <label class="form-label">主播微信号</label>
            <input v-model="formData.wechatAnchorWechat" type="text" class="form-control" placeholder="请输入已绑定的主播微信号">
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">开播时间</label>
            <input v-model="formData.startTime" type="datetime-local" class="form-control">
          </div>
          <div class="form-group">
            <label class="form-label">结束时间</label>
            <input v-model="formData.endTime" type="datetime-local" class="form-control">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">直播封面</label>
          <ImageUploadField
            v-model="formData.coverUrl"
            label="直播封面"
            context="live-cover"
            :accept="['image/jpeg', 'image/png']"
            :max-size-mb="1"
            :ratio="9 / 16"
            ratio-label="9:16 竖图"
            :min-width="720"
            :min-height="1280"
            preview-ratio="9 / 16"
          />
        </div>
        <div class="form-group" v-if="isEdit">
          <label class="form-label">直播状态</label>
          <select v-model="formData.status" class="form-control">
            <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>
        <div class="form-group" v-if="isEdit">
          <label class="form-label">关联推广商品</label>
          <div class="product-picker">
            <label v-for="item in products" :key="item.id" class="product-option">
              <input v-model="formData.productIds" type="checkbox" :value="item.id">
              <span>{{ item.name }} · ¥{{ (item.price / 100).toFixed(2) }}</span>
            </label>
            <div v-if="products.length === 0" class="sub-text">暂无可关联的推广商品</div>
          </div>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
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
  color: #9ca3af;
  margin-top: 4px;
}

.tip-card {
  margin-bottom: 20px;
  padding: 16px 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #eff6ff, #f8fbff);
  border: 1px solid #dbeafe;
}

.tip-title {
  font-size: 14px;
  font-weight: 700;
  color: #1d4ed8;
  margin-bottom: 8px;
}

.tip-text {
  font-size: 13px;
  color: #475569;
  line-height: 1.7;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 18px 20px;
}

.stat-label {
  font-size: 13px;
  color: #6b7280;
}

.stat-value {
  margin-top: 10px;
  font-size: 28px;
  line-height: 1;
  font-weight: 700;
  color: #111827;
}

.stat-value.green {
  color: #16a34a;
}

.stat-value.red {
  color: #dc2626;
}

.stat-value.blue {
  color: #2563eb;
}

.cover-image {
  width: 96px;
  height: 54px;
  object-fit: cover;
  border-radius: 8px;
  background: #f3f4f6;
}

.live-title {
  font-weight: 600;
  color: #111827;
}

.sub-text {
  margin-top: 4px;
  font-size: 12px;
  color: #9ca3af;
}

.room-id-text {
  font-weight: 600;
  color: #2563eb;
}

.product-text {
  max-width: 220px;
  line-height: 1.6;
  color: #374151;
}

.action-row {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  white-space: nowrap;
}

.dialog-body-form {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
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
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  color: #1f2937;
  outline: none;
}

select.form-control {
  appearance: auto;
}

.product-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}

.product-option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #374151;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
}

.status-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-tag.gold {
  background: #fff7ed;
  color: #d97706;
}

.status-tag.gold::before {
  background: #f59e0b;
}

.status-tag.red {
  background: #fef2f2;
  color: #dc2626;
}

.status-tag.red::before {
  background: #ef4444;
}

.status-tag.blue {
  background: #eff6ff;
  color: #2563eb;
}

.status-tag.blue::before {
  background: #3b82f6;
}

@media (max-width: 1200px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
