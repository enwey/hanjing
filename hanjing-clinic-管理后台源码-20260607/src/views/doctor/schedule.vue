<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'

const route = useRoute()
const router = useRouter()
const doctorId = ref(route.params.id as string || '1')

/* ---- Doctor Info ---- */
const doctor = ref({
  id: doctorId.value,
  name: '古堪民',
  title: '主任医师',
  specialty: '睡眠呼吸科',
  stores: '龙岗总店/南山分院'
})

/* ---- Schedule Data ---- */
interface PeriodData {
  store: string; // "龙岗总店", "南山分院", "休息"
  slots: number;
}
interface DaySchedule {
  dateLabel: string;
  morning: PeriodData;
  afternoon: PeriodData;
}

const schedules = ref<DaySchedule[]>([
  { dateLabel: '周一 6/1', morning: { store: '龙岗总店', slots: 4 }, afternoon: { store: '龙岗总店', slots: 4 } },
  { dateLabel: '周二 6/2', morning: { store: '龙岗总店', slots: 4 }, afternoon: { store: '龙岗总店', slots: 4 } },
  { dateLabel: '周三 6/3', morning: { store: '南山分院', slots: 3 }, afternoon: { store: '休息', slots: 0 } },
  { dateLabel: '周四 6/4', morning: { store: '龙岗总店', slots: 4 }, afternoon: { store: '龙岗总店', slots: 4 } },
  { dateLabel: '周五 6/5', morning: { store: '龙岗总店', slots: 4 }, afternoon: { store: '南山分院', slots: 3 } },
  { dateLabel: '周六 6/6', morning: { store: '龙岗总店', slots: 2 }, afternoon: { store: '休息', slots: 0 } },
  { dateLabel: '周日 6/7', morning: { store: '休息', slots: 0 }, afternoon: { store: '休息', slots: 0 } }
])

const showEdit = ref(false)
const editingDayIndex = ref(-1)
const editingPeriod = ref<'morning' | 'afternoon'>('morning')
const editStore = ref('龙岗总店')
const editSlots = ref(4)

function handleBack() {
  router.push('/doctor')
}

function handleSaveAll() {
  MessagePlugin.success('保存排班成功')
  router.push('/doctor')
}

function handleCopyLastMonth() {
  MessagePlugin.success('已成功复制上月排班数据')
}

function handleClear() {
  schedules.value.forEach(day => {
    day.morning = { store: '休息', slots: 0 }
    day.afternoon = { store: '休息', slots: 0 }
  })
  MessagePlugin.info('已清空排班数据')
}

function openEdit(dayIdx: number, period: 'morning' | 'afternoon') {
  editingDayIndex.value = dayIdx
  editingPeriod.value = period
  const data = schedules.value[dayIdx][period]
  editStore.value = data.store === '休息' ? '龙岗总店' : data.store
  editSlots.value = data.slots || 4
  showEdit.value = true
}

function handleSaveEdit() {
  const day = schedules.value[editingDayIndex.value]
  if (day) {
    day[editingPeriod.value] = {
      store: editStore.value,
      slots: editStore.value === '休息' ? 0 : editSlots.value
    }
  }
  showEdit.value = false
  MessagePlugin.success('更新排班成功')
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
        <button class="btn btn-outline" @click="handleBack">取消</button>
        <button class="btn btn-primary" @click="handleSaveAll">保存排班</button>
      </div>
    </div>

    <!-- Calendar Panel -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">6月排班 · 6/1 - 6/30</div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-outline" @click="handleCopyLastMonth">复制上月排班</button>
          <button class="btn btn-sm btn-outline" @click="handleClear">清空</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="grid-table">
          <!-- Header Row -->
          <div class="grid-header"></div>
          <div v-for="(day, index) in schedules" :key="index" class="grid-header-cell">
            {{ day.dateLabel }}
          </div>

          <!-- Morning Row -->
          <div class="grid-row-header">🌅 上午</div>
          <div
            v-for="(day, index) in schedules"
            :key="'m-' + index"
            class="grid-cell"
            :class="{
              'success-bg': day.morning.store !== '休息' && day.morning.slots >= 3,
              'warning-bg': day.morning.store !== '休息' && day.morning.slots < 3,
              'rest-bg': day.morning.store === '休息'
            }"
            @click="openEdit(index, 'morning')"
          >
            <template v-if="day.morning.store !== '休息'">
              <span class="store-name">{{ day.morning.store }}</span>
              <span class="slots-count">{{ day.morning.slots }}个时段</span>
            </template>
            <template v-else>
              <span class="rest-text">休息</span>
            </template>
          </div>

          <!-- Afternoon Row -->
          <div class="grid-row-header">🌇 下午</div>
          <div
            v-for="(day, index) in schedules"
            :key="'a-' + index"
            class="grid-cell"
            :class="{
              'success-bg': day.afternoon.store !== '休息' && day.afternoon.slots >= 3,
              'warning-bg': day.afternoon.store !== '休息' && day.afternoon.slots < 3,
              'rest-bg': day.afternoon.store === '休息'
            }"
            @click="openEdit(index, 'afternoon')"
          >
            <template v-if="day.afternoon.store !== '休息'">
              <span class="store-name">{{ day.afternoon.store }}</span>
              <span class="slots-count">{{ day.afternoon.slots }}个时段</span>
            </template>
            <template v-else>
              <span class="rest-text">休息</span>
            </template>
          </div>
        </div>
      </div>
      
      <!-- Footer Tip -->
      <div class="panel-footer-tip">
        💡 点击格子编辑排班：选择门店、设置时段数，若设为“休息”则清空门店
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
        <div class="form-group">
          <label class="form-label">出诊门店</label>
          <select class="form-control" v-model="editStore">
            <option>龙岗总店</option>
            <option>南山分院</option>
            <option>休息</option>
          </select>
        </div>
        <div class="form-group" v-if="editStore !== '休息'">
          <label class="form-label">可约时段数 (个)</label>
          <input type="number" class="form-control" v-model.number="editSlots" min="1" max="12">
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
  grid-template-columns: 80px repeat(7, 1fr);
  gap: 1px;
  background: #E5E7EB;
  border-radius: 8px;
  overflow: hidden;
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
