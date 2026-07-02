<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import ImageUploadField from '@/components/ImageUploadField.vue'

const router = useRouter()
const currentPage = ref(1)
const pageSize = ref(30)

const editVisible = ref(false)
const editStore = ref<any>(null)

interface Store {
  id: string; name: string; code: string; address: string; city?: string; district?: string; phone: string
  latitude?: string; longitude?: string
  coverUrl?: string; imageUrls?: string[]
  openTime: string; closeTime: string; doctors: number; devices: number
  monthBookings: number; monthRevenue: string; status: string; manager: string; features: string[]
  hours?: Array<{ openTime: string; closeTime: string }>; icon: string; iconBg: string
}

const stores = ref<Store[]>([])
const isEdit = ref(false)
const mapVisible = ref(false)

const handleMapMessage = (event: MessageEvent) => {
  const loc = event.data
  if (loc && loc.module === 'locationPicker') {
    if (editStore.value) {
      editStore.value.latitude = String(loc.latlng.lat)
      editStore.value.longitude = String(loc.latlng.lng)
      if (!editStore.value.address) {
        editStore.value.address = loc.poiaddress + ' (' + loc.poiname + ')'
      }
      if (loc.cityname && !editStore.value.city) {
        editStore.value.city = loc.cityname
      }
    }
    mapVisible.value = false
  }
}

onMounted(() => {
  window.addEventListener('message', handleMapMessage, false)
})

onUnmounted(() => {
  window.removeEventListener('message', handleMapMessage)
})

function openMapPicker() {
  mapVisible.value = true
}

function safeJsonArray(value: any) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const fetchStores = async () => {
  try {
    const res: any = await request.get('/api/admin/stores')
    const icons = ['store', 'store', 'store']
    const iconBgs = [
      'linear-gradient(135deg, #EEF4FF, #D9E6FF)',
      'linear-gradient(135deg, #EDFBF5, #D3F5E3)',
      'linear-gradient(135deg, #FFF7ED, #FFEDD5)'
    ]
    stores.value = res.data.map((s: any, index: number) => ({
	      id: s.id.toString(),
	      name: s.name,
	      code: s.code,
	      address: s.address,
        city: s.city || '',
        district: s.district || '',
	      phone: s.phone,
        latitude: s.latitude || '',
        longitude: s.longitude || '',
        coverUrl: s.cover_url || '',
        imageUrls: safeJsonArray(s.image_urls),
      openTime: s.open_time ? s.open_time.substring(0, 5) : '09:00',
      closeTime: s.close_time ? s.close_time.substring(0, 5) : '18:00',
      hours: s.hours || [{ openTime: s.open_time ? s.open_time.substring(0, 5) : '09:00', closeTime: s.close_time ? s.close_time.substring(0, 5) : '18:00' }],
      doctors: s.doctors,
      devices: s.devices,
      monthBookings: s.monthBookings,
      monthRevenue: s.monthRevenue,
      status: s.status,
	      manager: s.manager,
      features: s.features || [],
      icon: icons[index % icons.length],
      iconBg: iconBgs[index % iconBgs.length]
    }))
  } catch (error) {
    console.error('Failed to load stores:', error)
  }
}

onMounted(() => {
  fetchStores()
})

const paginatedStores = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return stores.value.slice(start, end)
})

function openEdit(store: any) {
  isEdit.value = true
  editStore.value = { 
    ...store,
    featuresStr: store.features ? store.features.join(',') : '',
    hours: store.hours ? JSON.parse(JSON.stringify(store.hours)) : [{ openTime: '09:00', closeTime: '18:00' }]
  }
  editVisible.value = true
}

function openCreate() {
  isEdit.value = false
  editStore.value = {
    id: '',
    name: '',
    code: '',
    address: '',
    city: '',
    district: '',
    phone: '',
    latitude: '',
    longitude: '',
    status: 'open',
    manager: '',
    coverUrl: '',
    imageUrls: [],
    featuresStr: '',
    hours: [{ openTime: '09:00', closeTime: '18:00' }]
  }
  editVisible.value = true
}

async function saveEdit() {
  try {
    const tags = editStore.value.featuresStr
      ? editStore.value.featuresStr.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
      : []
    const payload = {
      name: editStore.value.name,
      code: editStore.value.code,
      address: editStore.value.address,
      city: editStore.value.city,
      district: editStore.value.district,
      latitude: editStore.value.latitude || null,
      longitude: editStore.value.longitude || null,
      cover_url: editStore.value.coverUrl || null,
      image_urls: (editStore.value.imageUrls || []).filter((url: string) => String(url || '').trim()),
      phone: editStore.value.phone,
      status: editStore.value.status,
      features: tags,
      hours: editStore.value.hours
    }
    if (isEdit.value) {
      await request.put(`/api/admin/stores/${editStore.value.id}`, payload)
      MessagePlugin.success('修改门店信息成功')
    } else {
      await request.post('/api/admin/stores', payload)
      MessagePlugin.success('新增门店成功')
    }
    fetchStores()
    editVisible.value = false
  } catch (error) {
    console.error(error)
  }
}

async function handleDisable(store: Store) {
  try {
    await request.delete(`/api/admin/stores/${store.id}`)
    MessagePlugin.success('门店已停用')
    fetchStores()
  } catch (error) {
    console.error(error)
  }
}

function openStoreSchedule(store: Store) {
  router.push({ path: '/doctor', query: { store_id: store.id } })
}

function openStoreAccounts(store: Store) {
  router.push({ path: '/settings/admin', query: { store_id: store.id } })
}
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">门店管理</div>
        <div class="page-title-sub">管理所有门店/诊所信息</div>
      </div>
      <button class="btn btn-primary" @click="openCreate"><AppIcon name="plus" />  新增门店</button>
    </div>

    <!-- 门店卡片 -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px;">
      <div v-for="store in paginatedStores" :key="store.id" class="panel" style="margin-bottom:0;">
        <div class="panel-body" style="padding: 20px;">
          <!-- 上半部分：图标 + 基本信息 -->
          <div style="display:flex;gap:16px;">
            <div :style="{
              width: '80px',
              height: '80px',
              borderRadius: '8px',
              background: store.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '36px',
              flexShrink: 0
            }"><AppIcon :name="store.icon" size="36" /></div>
            <div style="flex:1; min-width: 0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="font-size:16px;font-weight:700;color:#111827;">{{ store.name }}</span>
                <span :class="['status-tag', store.status === 'open' ? 'green' : (store.status === 'closed' ? 'gray' : 'gold')]">
                  {{ store.status === 'open' ? '营业中' : (store.status === 'closed' ? '已停用' : '筹备中') }}
                </span>
              </div>
              <div style="font-size:12px;color:#6B7280;line-height:1.6;" :title="store.address">{{ store.address }}</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:4px;">
                <AppIcon name="phone" /> {{ store.phone || '未填写电话' }} · <AppIcon name="clock" /> {{ store.status === 'prepare' ? '待定' : (store.hours || []).map(h => `${h.openTime}-${h.closeTime}`).join(' ') }}
              </div>
              <!-- Tags / Features -->
              <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">
                <span v-for="tag in store.features" :key="tag" style="font-size: 11px; background: #ECFDF5; color: #16A34A; padding: 2.5px 6px; border-radius: 4px; font-weight: 500;">
                  {{ tag }}
                </span>
                <span v-if="!store.features || store.features.length === 0" style="font-size: 11px; background: #F3F4F6; color: #9CA3AF; padding: 2.5px 6px; border-radius: 4px;">
                  暂无特色标签
                </span>
              </div>
            </div>
          </div>

          <!-- 中间：4列统计指标 -->
          <div style="display:flex;gap:0;margin-top:16px;padding-top:16px;border-top:1px solid #F3F4F6;">
            <div style="flex:1;text-align:center;border-right:1px solid #F3F4F6;">
              <div style="font-size:20px;font-weight:800;color:#3B6BF5;">{{ store.doctors }}</div>
              <div style="font-size:11px;color:#9CA3AF;">坐诊医生</div>
            </div>
            <div style="flex:1;text-align:center;border-right:1px solid #F3F4F6;">
              <div style="font-size:20px;font-weight:800;color:#22C55E;">{{ store.devices }}</div>
              <div style="font-size:11px;color:#9CA3AF;">监测设备</div>
            </div>
            <div style="flex:1;text-align:center;border-right:1px solid #F3F4F6;">
              <div style="font-size:20px;font-weight:800;color:#F59E0B;">{{ store.monthBookings }}</div>
              <div style="font-size:11px;color:#9CA3AF;">本月预约</div>
            </div>
            <div style="flex:1;text-align:center;">
              <div style="font-size:20px;font-weight:800;color:#374151;">{{ store.monthRevenue }}</div>
              <div style="font-size:11px;color:#9CA3AF;">本月营收</div>
            </div>
          </div>

          <!-- 底部操作按钮 -->
          <div style="display:flex;gap:8px;margin-top:16px;">
            <button class="btn btn-sm btn-outline" style="flex:1;" @click="openEdit(store)">编辑信息</button>
            <button class="btn btn-sm btn-outline" style="flex:1;" @click="openStoreSchedule(store)">排班管理</button>
            <button class="btn btn-sm btn-outline" style="flex:1;" @click="openStoreAccounts(store)">人员配置</button>
            <button class="btn btn-sm btn-outline" style="flex:1;" @click="router.push('/store/report/' + store.id)">数据报表</button>
            <button v-if="store.status !== 'closed'" class="btn btn-sm btn-outline" style="flex:1;" @click="handleDisable(store)">停用</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <t-pagination
      v-model:current="currentPage"
      v-model:pageSize="pageSize"
      :total="stores.length"
      :pageSizeOptions="[30, 60, 100]"
      style="margin-top: 16px; justify-content: flex-end;"
    />

    <!-- 编辑弹窗 -->
    <t-dialog
      v-model:visible="editVisible"
      :header="isEdit ? '编辑门店信息' : '新增门店'"
      width="520px"
      @confirm="saveEdit"
    >
      <t-form v-if="editStore" label-width="80px">
        <t-form-item label="门店名称">
          <t-input v-model="editStore.name" />
        </t-form-item>
        <t-form-item label="门店编号">
          <t-input v-model="editStore.code" :disabled="isEdit" placeholder="例如：SZ-LG" />
        </t-form-item>
        <t-form-item label="城市">
          <t-input v-model="editStore.city" placeholder="请输入城市" />
        </t-form-item>
        <t-form-item label="区域">
          <t-input v-model="editStore.district" placeholder="请输入区域" />
        </t-form-item>
        <t-form-item label="详细地址">
          <t-textarea v-model="editStore.address" :autosize="{ minRows: 2 }" />
        </t-form-item>
        <t-form-item label="经纬度">
          <div style="display:flex; gap:8px; width:100%;">
            <t-input v-model="editStore.latitude" placeholder="纬度" />
            <t-input v-model="editStore.longitude" placeholder="经度" />
            <t-button variant="outline" @click="openMapPicker">地图选址</t-button>
          </div>
        </t-form-item>
        <t-form-item label="联系电话">
          <t-input v-model="editStore.phone" />
        </t-form-item>
        <t-form-item label="门店封面">
          <ImageUploadField
            v-model="editStore.coverUrl"
            label="门店封面"
            context="store-cover"
            :max-size-mb="3"
            ratio-label="16:9"
            :ratio="16 / 9"
            :min-width="960"
            :min-height="540"
          />
        </t-form-item>
        <t-form-item label="环境图片">
          <div style="display:flex; flex-direction:column; gap:12px; width:100%;">
            <ImageUploadField
              v-for="(_, idx) in editStore.imageUrls"
              :key="idx"
              v-model="editStore.imageUrls[idx]"
              :label="`环境图${idx + 1}`"
              context="store-gallery"
              :max-size-mb="3"
              ratio-label="4:3"
              :ratio="4 / 3"
              :min-width="800"
              :min-height="600"
            />
            <t-button variant="dashed" style="width:100%;" @click="editStore.imageUrls.push('')">
              + 添加环境图
            </t-button>
          </div>
        </t-form-item>
        <t-form-item label="营业时间">
          <div style="width: 100%;">
            <div v-for="(h, idx) in editStore.hours" :key="idx" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; width: 100%;">
              <t-time-picker v-model="h.openTime" format="HH:mm" style="flex: 1;" />
              <span style="color: #9CA3AF;">至</span>
              <t-time-picker v-model="h.closeTime" format="HH:mm" style="flex: 1;" />
              <t-button v-if="editStore.hours.length > 1" theme="danger" variant="text" style="padding: 0 4px;" @click="editStore.hours.splice(idx, 1)">
                删除
              </t-button>
            </div>
            <t-button variant="dashed" style="width:100%;" @click="editStore.hours.push({ openTime: '09:00', closeTime: '18:00' })">
              + 添加时间段
            </t-button>
          </div>
        </t-form-item>
        <t-form-item label="负责人">
          <t-input v-model="editStore.manager" disabled placeholder="请在账号管理中设置门店管理员" />
        </t-form-item>
        <t-form-item label="特色标签">
          <t-input v-model="editStore.featuresStr" placeholder="请输入特色标签，用中/英文逗号隔开" />
        </t-form-item>
        <t-form-item label="状态">
	          <t-radio-group v-model="editStore.status">
	            <t-radio value="open">运营中</t-radio>
	            <t-radio value="prepare">筹备中</t-radio>
              <t-radio value="closed">已停用</t-radio>
	          </t-radio-group>
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 地图选址弹窗 -->
    <t-dialog
      v-model:visible="mapVisible"
      header="地图选址"
      width="820px"
      :footer="false"
      destroy-on-close
    >
      <iframe
        src="https://apis.map.qq.com/tools/locpicker?search=1&type=1&key=OB4BZ-D4W3U-B7VVO-4PJWW-6TKDJ-WPB77&referer=myapp"
        style="width:100%; height:550px; border:none;"
      ></iframe>
    </t-dialog>
  </div>
</template>

<style scoped>
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

/* Button styles matching mockup global CSS rules */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  border-radius: 6px;
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
.status-tag.gold {
  background: #fff9e6;
  color: #d4930a;
}
.status-tag.gold::before {
  background: #f59e0b;
}
.status-tag.gray {
  background: #f3f4f6;
  color: #6b7280;
}
.status-tag.gray::before {
  background: #9ca3af;
}
</style>
