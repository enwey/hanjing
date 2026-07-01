<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { navigateToParent } from '@/utils/routeNavigation'

const route = useRoute()
const router = useRouter()
const doctorId = ref(route.params.id as string || '1')

/* ---- Doctor Info ---- */
const doctor = ref({
  id: doctorId.value,
  name: '',
  title: '',
  specialty: '',
  stores: ''
})

/* ---- Schedule Data ---- */
interface PeriodData {
  storeId: string;
  store: string;
  slots: number;
  peoplePerSlot?: number;
  booked?: number;
  startTime?: string;
  endTime?: string;
}
interface DaySchedule {
  date: string;
  dateLabel: string;
  morning: PeriodData;
  afternoon: PeriodData;
}

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth()) // 0-indexed

const monthLabel = computed(() => {
  return `${currentYear.value}年${currentMonth.value + 1}月`
})

const scheduleChunks = computed(() => {
  const chunks = []
  for (let i = 0; i < schedules.value.length; i += 10) {
    chunks.push(schedules.value.slice(i, i + 10))
  }
  return chunks
})

const schedules = ref<DaySchedule[]>([])

const generateMonthSchedules = () => {
  const year = currentYear.value
  const month = currentMonth.value
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  
  const list: DaySchedule[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    const dayOfWeek = date.getDay()
    const dateLabel = `${weekdays[dayOfWeek]} ${month + 1}/${d}`
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    
    list.push({
      date: dateStr,
      dateLabel,
      morning: {
        store: '休息',
        storeId: '',
        slots: 0,
        peoplePerSlot: 1,
        booked: 0,
        startTime: '09:00:00',
        endTime: '12:00:00'
      },
      afternoon: {
        store: '休息',
        storeId: '',
        slots: 0,
        peoplePerSlot: 1,
        booked: 0,
        startTime: '14:00:00',
        endTime: '18:00:00'
      }
    })
  }
  schedules.value = list
}

const storesList = ref<any[]>([])
const doctorStoreIds = ref<string[]>([])
const activeStoreOptions = computed(() => {
  if (!doctorStoreIds.value.length) return storesList.value
  return storesList.value.filter(store => doctorStoreIds.value.includes(String(store.id)))
})

const fetchStores = async () => {
  try {
    const res: any = await request.get('/api/admin/stores')
    if (res.code === 200) {
      storesList.value = res.data
    }
  } catch (err) {
    console.error('获取门店列表失败:', err)
  }
}

const fetchDoctorInfo = async () => {
  try {
    const res: any = await request.get('/api/admin/doctors')
    if (res.code === 200) {
      const doc = res.data.find((d: any) => String(d.id) === String(doctorId.value))
      if (doc) {
        doctor.value = {
          id: String(doc.id),
          name: doc.name,
          title: doc.title,
          specialty: doc.specialty,
          stores: Array.isArray(doc.store_names) && doc.store_names.length ? doc.store_names.join(' / ') : '未绑定门店'
        }
        doctorStoreIds.value = Array.isArray(doc.store_ids) ? doc.store_ids.map((id: any) => String(id)) : []
      } else {
        MessagePlugin.error('医生档案不存在或无权访问')
        navigateToParent(router, route, '/doctor')
      }
    }
  } catch (err) {
    console.error('获取医生信息失败:', err)
  }
}

function getStoreName(storeId: string) {
  return storesList.value.find(s => String(s.id) === String(storeId))?.name || '休息'
}

const loadSchedules = async () => {
  if (storesList.value.length === 0) {
    await fetchStores()
  }
  await fetchDoctorInfo()
  generateMonthSchedules()

  try {
    const monthStr = `${currentYear.value}-${String(currentMonth.value + 1).padStart(2, '0')}`
    const res: any = await request.get(`/api/admin/schedules`, {
      params: {
        doctor_id: doctorId.value,
        date: monthStr
      }
    })
    if (res.code === 200 && Array.isArray(res.data)) {
      res.data.forEach((row: any) => {
        const rowDate = String(row.date).slice(0, 10)
        const day = schedules.value.find(d => d.date === rowDate)
        if (day) {
          const period: 'morning' | 'afternoon' = row.period
          if (day[period]) {
            day[period] = {
              storeId: row.store_id ? String(row.store_id) : '',
              store: row.store_name || getStoreName(String(row.store_id || '')),
              slots: row.total_slots || 0,
              peoplePerSlot: row.people_per_slot || 1,
              booked: row.booked_count || 0,
              startTime: row.start_time || (period === 'morning' ? '09:00:00' : '14:00:00'),
              endTime: row.end_time || (period === 'morning' ? '12:00:00' : '18:00:00')
            }
          }
        }
      })
    }
  } catch (err) {
    console.error('加载排班数据失败:', err)
  }
}

// Initialize
onMounted(() => {
  loadSchedules()
})

function prevMonth() {
  if (currentMonth.value === 0) {
    currentYear.value--
    currentMonth.value = 11
  } else {
    currentMonth.value--
  }
  loadSchedules()
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentYear.value++
    currentMonth.value = 0
  } else {
    currentMonth.value++
  }
  loadSchedules()
}

const showEdit = ref(false)
const editingDayIndex = ref(-1)
const editingPeriod = ref<'morning' | 'afternoon'>('morning')
const editStoreId = ref('')
const editSlots = ref(4)
const editPeoplePerSlot = ref(1)
const editStartTime = ref('09:00')
const editEndTime = ref('12:00')

// Batch mode variables
const isBatchMode = ref(false)
const selectedDays = ref<number[]>([])
const batchPeriod = ref<('morning' | 'afternoon')[]>(['morning', 'afternoon'])

function toggleDaySelection(dayIdx: number) {
  const idx = selectedDays.value.indexOf(dayIdx)
  if (idx > -1) {
    selectedDays.value.splice(idx, 1)
  } else {
    selectedDays.value.push(dayIdx)
  }
}

function selectAllDays() {
  selectedDays.value = Array.from({ length: schedules.value.length }, (_, i) => i)
}

function deselectAllDays() {
  selectedDays.value = []
}

function enterBatchMode() {
  isBatchMode.value = true
  selectedDays.value = []
}

function exitBatchMode() {
  isBatchMode.value = false
  selectedDays.value = []
}

function openBatchEdit() {
  if (selectedDays.value.length === 0) {
    MessagePlugin.warning('请先选择需要排班的日期')
    return
  }
  editStoreId.value = activeStoreOptions.value[0] ? String(activeStoreOptions.value[0].id) : ''
  editSlots.value = 4
  editPeoplePerSlot.value = 1
  editStartTime.value = '09:00'
  editEndTime.value = '12:00'
  batchPeriod.value = ['morning', 'afternoon']
  showEdit.value = true
}

function handleBack() {
  navigateToParent(router, route, '/doctor')
}

const isSaving = ref(false)

async function handleSaveAll() {
  if (isSaving.value) return
  isSaving.value = true
  
  try {
    const saveList: any[] = []
    
    schedules.value.forEach(day => {
      saveList.push({
        date: day.date,
        period: 'morning',
        is_rest: !day.morning.storeId,
        store_id: day.morning.storeId ? Number(day.morning.storeId) : null,
        start_time: day.morning.startTime || '09:00:00',
        end_time: day.morning.endTime || '12:00:00',
        total_slots: day.morning.slots,
        people_per_slot: day.morning.peoplePerSlot || 1
      })
      
      saveList.push({
        date: day.date,
        period: 'afternoon',
        is_rest: !day.afternoon.storeId,
        store_id: day.afternoon.storeId ? Number(day.afternoon.storeId) : null,
        start_time: day.afternoon.startTime || '14:00:00',
        end_time: day.afternoon.endTime || '18:00:00',
        total_slots: day.afternoon.slots,
        people_per_slot: day.afternoon.peoplePerSlot || 1
      })
    })

    const res: any = await request.post('/api/admin/schedules/batch', {
      doctor_id: doctorId.value,
      list: saveList
    })

    if (res.code === 200) {
      MessagePlugin.success('保存排班成功')
      navigateToParent(router, route, '/doctor')
    } else {
      MessagePlugin.error(res.message || '保存排班失败')
    }
  } catch (err: any) {
    console.error('保存排班失败:', err)
  } finally {
    isSaving.value = false
  }
}

async function handleCopyLastMonth() {
  try {
    const res: any = await request.post('/api/admin/schedules/copy-last-month', {
      doctor_id: doctorId.value,
      year: currentYear.value,
      month: currentMonth.value + 1
    })
    MessagePlugin.success(res.message || '已成功复制上月排班数据')
    loadSchedules()
  } catch (err: any) {
    MessagePlugin.error(err?.message || '复制上月排班失败')
  }
}

function handleClear() {
  schedules.value.forEach(day => {
    day.morning = { store: '休息', storeId: '', slots: 0, peoplePerSlot: 1, booked: day.morning.booked || 0, startTime: '09:00:00', endTime: '12:00:00' }
    day.afternoon = { store: '休息', storeId: '', slots: 0, peoplePerSlot: 1, booked: day.afternoon.booked || 0, startTime: '14:00:00', endTime: '18:00:00' }
  })
  MessagePlugin.info('已清空页面排班，请点击“保存排班”后生效')
}

function openEdit(dayIdx: number, period: 'morning' | 'afternoon') {
  editingDayIndex.value = dayIdx
  editingPeriod.value = period
  const data = schedules.value[dayIdx][period]
  editStoreId.value = data.storeId || (activeStoreOptions.value[0] ? String(activeStoreOptions.value[0].id) : '')
  editSlots.value = data.slots || 4
  editPeoplePerSlot.value = data.peoplePerSlot || 1
  editStartTime.value = String(data.startTime || (period === 'morning' ? '09:00:00' : '14:00:00')).slice(0, 5)
  editEndTime.value = String(data.endTime || (period === 'morning' ? '12:00:00' : '18:00:00')).slice(0, 5)
  showEdit.value = true
}

function handleSaveEdit() {
  if (editStoreId.value && editStartTime.value >= editEndTime.value) {
    MessagePlugin.warning('结束时间必须晚于开始时间')
    return
  }
  const nextStoreName = editStoreId.value ? getStoreName(editStoreId.value) : '休息'
  const nextPeriodData = {
    storeId: editStoreId.value,
    store: nextStoreName,
    slots: editStoreId.value ? editSlots.value : 0,
    peoplePerSlot: editStoreId.value ? editPeoplePerSlot.value : 1,
    startTime: `${editStartTime.value}:00`,
    endTime: `${editEndTime.value}:00`
  }
  if (isBatchMode.value) {
    selectedDays.value.forEach(dayIdx => {
      const day = schedules.value[dayIdx]
      if (day) {
        if (batchPeriod.value.includes('morning')) {
          day.morning = {
            ...nextPeriodData,
            booked: day.morning.booked || 0
          }
        }
        if (batchPeriod.value.includes('afternoon')) {
          day.afternoon = {
            ...nextPeriodData,
            booked: day.afternoon.booked || 0
          }
        }
      }
    })
    isBatchMode.value = false
    selectedDays.value = []
  } else {
    const day = schedules.value[editingDayIndex.value]
    if (day) {
      day[editingPeriod.value] = {
        ...nextPeriodData,
        booked: day[editingPeriod.value].booked || 0
      }
    }
  }
  showEdit.value = false
  MessagePlugin.info('排班已更新到页面，请点击“保存排班”后生效')
}
</script>

<template>
  <div class="page-container">


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">{{ doctor.name }} · 排班管理</div>
        <div class="page-title-sub">{{ doctor.title }} · {{ doctor.specialty }} · {{ doctor.stores }}</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" :disabled="isSaving" @click="handleBack">取消</button>
        <button class="btn btn-primary" :disabled="isSaving" @click="handleSaveAll">
          {{ isSaving ? '保存中...' : '保存排班' }}
        </button>
      </div>
    </div>

    <!-- Calendar Panel -->
    <div class="panel">
      <div class="panel-header">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div class="panel-title">{{ monthLabel }} 排班</div>
          <div style="display: flex; gap: 4px;">
            <button class="btn btn-sm btn-outline" @click="prevMonth">◀ 上个月</button>
            <button class="btn btn-sm btn-outline" @click="nextMonth">下个月 ▶</button>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <template v-if="!isBatchMode">
            <button class="btn btn-sm btn-primary" @click="enterBatchMode">批量排班</button>
            <button class="btn btn-sm btn-outline" @click="handleCopyLastMonth">复制上月排班</button>
            <button class="btn btn-sm btn-outline" @click="handleClear">清空</button>
          </template>
          <template v-else>
            <span style="font-size: 13px; color: #4B5563; font-weight: 600;">已选中 {{ selectedDays.length }} 天</span>
            <button class="btn btn-sm btn-outline" @click="selectAllDays">全选</button>
            <button class="btn btn-sm btn-outline" @click="deselectAllDays">取消全选</button>
            <button class="btn btn-sm btn-primary" @click="openBatchEdit">统一设置</button>
            <button class="btn btn-sm btn-outline" @click="exitBatchMode">退出批量</button>
          </template>
        </div>
      </div>
      <div class="panel-body">
        <div v-for="(chunk, chunkIdx) in scheduleChunks" :key="chunkIdx" class="grid-table" style="margin-bottom: 24px;">
          <!-- Header Row -->
          <div class="grid-header"></div>
          <div
            v-for="(day, index) in chunk"
            :key="index"
            class="grid-header-cell"
            :class="{ 'selected-column': isBatchMode && selectedDays.includes(chunkIdx * 10 + index) }"
            @click="isBatchMode && toggleDaySelection(chunkIdx * 10 + index)"
            :style="{ cursor: isBatchMode ? 'pointer' : 'default' }"
          >
            <div v-if="isBatchMode" style="margin-bottom: 6px;">
              <input type="checkbox" :checked="selectedDays.includes(chunkIdx * 10 + index)" style="pointer-events: none;">
            </div>
            {{ day.dateLabel }}
          </div>
          <!-- Empty Cells for alignment -->
          <div v-for="n in (10 - chunk.length)" :key="'empty-h-' + n" class="grid-header-cell empty-cell"></div>

          <!-- Morning Row -->
          <div class="grid-row-header"><AppIcon name="sunrise" /> 上午</div>
          <div
            v-for="(day, index) in chunk"
            :key="'m-' + index"
            class="grid-cell"
            :class="{
              'success-bg': day.morning.store !== '休息' && day.morning.slots >= 3,
              'warning-bg': day.morning.store !== '休息' && day.morning.slots < 3,
              'rest-bg': day.morning.store === '休息',
              'selected-column': isBatchMode && selectedDays.includes(chunkIdx * 10 + index)
            }"
            @click="isBatchMode ? toggleDaySelection(chunkIdx * 10 + index) : openEdit(chunkIdx * 10 + index, 'morning')"
          >
            <template v-if="day.morning.store !== '休息'">
              <span class="store-name">{{ day.morning.store }}</span>
              <span class="slots-count">{{ String(day.morning.startTime || '').slice(0, 5) }}-{{ String(day.morning.endTime || '').slice(0, 5) }}</span>
              <span class="slots-count">已约 {{ day.morning.booked || 0 }} / 可容纳 {{ (day.morning.slots || 0) * (day.morning.peoplePerSlot || 1) }} 人</span>
            </template>
            <template v-else>
              <span class="rest-text">休息</span>
            </template>
          </div>
          <div v-for="n in (10 - chunk.length)" :key="'empty-m-' + n" class="grid-cell rest-bg empty-cell"></div>

          <!-- Afternoon Row -->
          <div class="grid-row-header"><AppIcon name="sunset" /> 下午</div>
          <div
            v-for="(day, index) in chunk"
            :key="'a-' + index"
            class="grid-cell"
            :class="{
              'success-bg': day.afternoon.store !== '休息' && day.afternoon.slots >= 3,
              'warning-bg': day.afternoon.store !== '休息' && day.afternoon.slots < 3,
              'rest-bg': day.afternoon.store === '休息',
              'selected-column': isBatchMode && selectedDays.includes(chunkIdx * 10 + index)
            }"
            @click="isBatchMode ? toggleDaySelection(chunkIdx * 10 + index) : openEdit(chunkIdx * 10 + index, 'afternoon')"
          >
            <template v-if="day.afternoon.store !== '休息'">
              <span class="store-name">{{ day.afternoon.store }}</span>
              <span class="slots-count">{{ String(day.afternoon.startTime || '').slice(0, 5) }}-{{ String(day.afternoon.endTime || '').slice(0, 5) }}</span>
              <span class="slots-count">已约 {{ day.afternoon.booked || 0 }} / 可容纳 {{ (day.afternoon.slots || 0) * (day.afternoon.peoplePerSlot || 1) }} 人</span>
            </template>
            <template v-else>
              <span class="rest-text">休息</span>
            </template>
          </div>
          <div v-for="n in (10 - chunk.length)" :key="'empty-a-' + n" class="grid-cell rest-bg empty-cell"></div>
        </div>
      </div>
      
      <!-- Footer Tip -->
      <div class="panel-footer-tip">
        <AppIcon name="lightbulb" /> 点击格子编辑排班：选择门店、设置时段数，若设为“休息”则清空门店
      </div>
    </div>

    <!-- Edit Dialog -->
    <t-dialog
      v-model:visible="showEdit"
      header="编辑医生排班"
      @confirm="handleSaveEdit"
      :cancelBtn="null"
    >
      <div class="form-container" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group" v-if="isBatchMode">
          <label class="form-label">应用时段</label>
          <div style="display: flex; gap: 16px; align-items: center; margin-top: 4px;">
            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="checkbox" value="morning" v-model="batchPeriod"> <AppIcon name="sunrise" /> 上午
            </label>
            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
              <input type="checkbox" value="afternoon" v-model="batchPeriod"> <AppIcon name="sunset" /> 下午
            </label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">出诊门店</label>
          <select class="form-control" v-model="editStoreId">
            <option value="">休息</option>
            <option v-for="store in activeStoreOptions" :key="store.id" :value="String(store.id)">
              {{ store.name }}
            </option>
          </select>
        </div>
        <div class="form-group" v-if="editStoreId">
          <label class="form-label">出诊时间</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <input type="time" class="form-control" v-model="editStartTime">
            <input type="time" class="form-control" v-model="editEndTime">
          </div>
        </div>
        <div class="form-group" v-if="editStoreId">
          <label class="form-label">可约时段数 (个)</label>
          <input type="number" class="form-control" v-model.number="editSlots" min="1" max="12">
        </div>
        <div class="form-group" v-if="editStoreId">
          <label class="form-label">每个时段可约人数 (人)</label>
          <input type="number" class="form-control" v-model.number="editPeoplePerSlot" min="1" max="100">
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
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #F3F4F6;
}
.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.panel-body {
  padding: 20px;
}
.panel-footer-tip {
  padding: 14px 20px;
  font-size: 12px;
  color: #9CA3AF;
  border-top: 1px solid #F3F4F6;
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

/* Grid Week Table */
.grid-table {
  display: grid;
  grid-template-columns: 80px repeat(10, 1fr);
  gap: 1px;
  background: #E5E7EB;
  border-radius: 8px;
  overflow: hidden;
}

.empty-cell {
  pointer-events: none;
  cursor: default;
}

.selected-column {
  background-color: #EFF6FF !important;
  outline: 2px solid #3B82F6 !important;
  outline-offset: -2px;
  z-index: 10;
}

.grid-header {
  background: #F9FAFB;
  padding: 12px 8px;
}
.grid-header-cell {
  background: #F9FAFB;
  padding: 12px 8px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
}
.grid-row-header {
  background: #fff;
  padding: 16px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
  display: flex;
  align-items: center;
  justify-content: center;
}

.grid-cell {
  background: #fff;
  padding: 16px 8px;
  text-align: center;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: all 150ms;
}
.grid-cell:hover {
  filter: brightness(0.96);
}

/* Grid Cell Status Styling */
.grid-cell.success-bg {
  background: #ECFDF5;
  border: 2px solid #10B981;
  border-radius: 6px;
}
.grid-cell.success-bg .store-name {
  color: #16A34A;
  font-size: 12px;
  font-weight: 600;
}
.grid-cell.success-bg .slots-count {
  color: #9CA3AF;
  font-size: 10px;
  margin-top: 4px;
}

.grid-cell.warning-bg {
  background: #FFFBEB;
  border: 2px solid #F59E0B;
  border-radius: 6px;
}
.grid-cell.warning-bg .store-name {
  color: #D97706;
  font-size: 12px;
  font-weight: 600;
}
.grid-cell.warning-bg .slots-count {
  color: #9CA3AF;
  font-size: 10px;
  margin-top: 4px;
}

.grid-cell.rest-bg {
  background: #F9FAFB;
}
.grid-cell.rest-bg .rest-text {
  color: #D1D5DB;
  font-size: 12px;
}

/* Dialog Form */
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
</style>
