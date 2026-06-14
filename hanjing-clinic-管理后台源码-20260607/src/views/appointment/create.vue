<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import PatientCreateDialog from '@/components/PatientCreateDialog.vue'

const router = useRouter()
const route = useRoute()

const isReschedule = ref(route.query.reschedule === '1')
const rescheduleId = ref(route.query.id as string || '')

/* ---- State Management ---- */
const searchQuery = ref('')
const selectedPatient = ref<any>(null)
const selectedStore = ref('🏥 鼾静健康·龙岗总店')
const selectedDoctor = ref('古堪民 · 主任医师 · 睡眠呼吸科')
const selectedDate = ref('5月29日 周四')
const selectedSlot = ref('09:30')
const visitType = ref('复诊')
const fee = ref('¥200.00')
const remarks = ref('患者上次就诊后睡眠监测数据需复查，建议安排PSG监测')

// Modal/Form States for registering new patient
const createVisible = ref(false)

const selectedPromoterId = ref<string | null>(null)
const promoterOptions = ref<Array<{ label: string; value: string }>>([])

const fetchPromoters = async () => {
  try {
    const res: any = await request.get('/api/admin/distribution/promoters')
    if (res.code === 200 && res.data) {
      promoterOptions.value = res.data.map((p: any) => ({
        label: `${p.nickname} (${p.user_phone || '无手机号'})`,
        value: p.user_id.toString()
      }))
    }
  } catch (error) {
    console.error('获取推广员列表失败:', error)
  }
}

onMounted(async () => {
  fetchPromoters()
  if (isReschedule.value) {
    try {
      const res: any = await request.get(`/api/admin/appointments`)
      const appt = res.data.find((a: any) => a.id.toString() === rescheduleId.value)
      if (appt) {
        selectedPatient.value = {
          id: appt.patient_id.toString(),
          name: appt.patient_name,
          gender: appt.patient_gender === 1 ? '男' : '女',
          age: appt.patient_age || 30,
          phone: appt.patient_phone,
          no: `P2026${String(appt.patient_id).padStart(4, '0')}`,
          level: '普通',
          avatarColor: appt.patient_gender === 1 ? '#3B6BF5' : '#EC4899'
        }
        selectedStore.value = appt.store_name
        selectedDoctor.value = appt.doctor_name
        selectedDate.value = appt.appointment_date ? (() => {
          const d = new Date(appt.appointment_date);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        })() : ''
        selectedSlot.value = appt.appointment_time
        remarks.value = appt.symptom_desc || ''
      }
    } catch (e) {
      console.error(e)
    }
  }
})

async function handleSearch() {
  const q = searchQuery.value.trim()
  if (!q) {
    MessagePlugin.warning('请输入患者姓名或手机号搜索')
    return
  }
  try {
    const res: any = await request.get(`/api/admin/patients?search=${q}`)
    if (res.data && res.data.length > 0) {
      const found = res.data[0]
      const levelMap: Record<string, string> = {
        normal: '普通',
        silver: 'VIP',
        gold: 'VIP',
        diamond: 'SVIP'
      }
      selectedPatient.value = {
        id: found.id.toString(),
        name: found.name,
        gender: found.gender === 1 ? '男' : '女',
        age: found.age || 30,
        phone: found.phone || found.user_phone,
        no: `P2026${String(found.id).padStart(4, '0')}`,
        level: levelMap[found.member_level] || '普通',
        avatarColor: found.gender === 1 ? '#3B6BF5' : '#EC4899'
      }
      MessagePlugin.success(`已找到并自动选择已有建档患者 [${found.name}]`)
    } else {
      MessagePlugin.info('未找到匹配的已有患者，您可以直接点击下方按钮进行“新患者建档”')
    }
  } catch (error) {
    console.error(error)
  }
}

function handleAddNewPatient() {
  createVisible.value = true
}

function handleCreatePatientSuccess(newP: any) {
  selectedPatient.value = {
    id: newP.id.toString(),
    name: newP.name,
    gender: newP.gender,
    age: newP.age || 30,
    phone: newP.phone,
    no: `P2026${String(newP.id).padStart(4, '0')}`,
    level: newP.level || '普通',
    avatarColor: newP.gender === '男' ? '#3B6BF5' : '#EC4899'
  }
}

function handleRemovePatient() {
  selectedPatient.value = null
  searchQuery.value = ''
}

const timeSlots = [
  { time: '08:30', status: 'full', label: '已满' },
  { time: '09:00', status: 'available', label: '可约' },
  { time: '09:30', status: 'selected', label: '已选' },
  { time: '10:00', status: 'available', label: '可约' },
  { time: '10:30', status: 'available', label: '可约' },
  { time: '11:00', status: 'available', label: '可约' },
  { time: '14:00', status: 'available', label: '可约' },
  { time: '14:30', status: 'available', label: '可约' },
  { time: '15:00', status: 'full', label: '已满' },
  { time: '15:30', status: 'available', label: '可约' },
  { time: '16:00', status: 'available', label: '可约' },
  { time: '16:30', status: 'available', label: '可约' },
]

function selectSlot(slot: any) {
  if (slot.status === 'full') return
  selectedSlot.value = slot.time
}

function handleCancel() {
  if (isReschedule.value) {
    router.push(`/appointment/detail/${rescheduleId.value}`)
  } else {
    router.push('/appointment')
  }
}

async function handleCreate() {
  if (!selectedPatient.value) {
    MessagePlugin.error('请先选择或新建患者')
    return
  }

  let storeId = 1
  if (selectedStore.value.includes('南山分院')) storeId = 2
  else if (selectedStore.value.includes('福田门诊部')) storeId = 3

  let doctorId = 1
  if (selectedDoctor.value.includes('王志远')) doctorId = 2
  else if (selectedDoctor.value.includes('刘婉清')) doctorId = 3

  let dateStr = '2026-05-29'
  if (selectedDate.value.includes('5月30日')) dateStr = '2026-05-30'
  else if (selectedDate.value.includes('5月31日')) dateStr = '2026-05-31'

  const slotHour = parseInt(selectedSlot.value.split(':')[0])
  const period = slotHour < 12 ? 'morning' : 'afternoon'

  try {
    if (isReschedule.value) {
      await request.put(`/api/admin/appointments/${rescheduleId.value}`, {
        status: 'confirmed'
      })
      MessagePlugin.success(`预约改约成功！已修改就诊时间。`)
      router.push(`/appointment/detail/${rescheduleId.value}`)
    } else {
      await request.post('/api/admin/appointments', {
        patient_id: parseInt(selectedPatient.value.id),
        store_id: storeId,
        doctor_id: doctorId,
        date: dateStr,
        period: period,
        time: selectedSlot.value,
        type: visitType.value === '初诊' ? 'first' : 'followup',
        symptom_desc: remarks.value
      })
      if (selectedPromoterId.value) {
        try {
          await request.post(`/api/admin/patients/${selectedPatient.value.id}/bind-promoter`, {
            promoter_user_id: parseInt(selectedPromoterId.value)
          })
        } catch (bindErr) {
          console.error('绑定推荐人失败:', bindErr)
        }
      }
      MessagePlugin.success(`预约创建成功！已写入门诊就诊记录`)
      router.push('/appointment')
    }
  } catch (error) {
    console.error(error)
  }
}
</script>

<template>
  <div class="page-container">
    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">{{ isReschedule ? '预约改约' : '新建预约' }}</div>
        <div class="page-title-sub">{{ isReschedule ? '调整已有预约的时间及就诊规则' : '手动为患者创建预约' }}</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <t-button variant="outline" theme="default" @click="handleCancel">取消</t-button>
        <t-button theme="primary" @click="handleCreate">{{ isReschedule ? '确认改约' : '确认创建' }}</t-button>
      </div>
    </div>

    <!-- Step 1: Select Patient -->
    <div class="panel">
      <div class="panel-header"><div class="panel-title">① {{ isReschedule ? '就诊患者' : '选择患者' }}</div></div>
      <div class="panel-body">
        <!-- Search bar (hidden during reschedule) -->
        <div v-if="!isReschedule" style="display: flex; gap: 12px; align-items: center;">
          <t-input
            v-model="searchQuery"
            placeholder="输入姓名/手机号搜索已有患者"
            style="flex: 1;"
            @enter="handleSearch"
            clearable
          />
          <t-button variant="outline" theme="default" @click="handleSearch">搜索</t-button>
          <t-button variant="outline" theme="primary" @click="handleAddNewPatient">
            ➕ 新患者建档
          </t-button>
        </div>

        <!-- Selected Patient details (visible only when selectedPatient is not null) -->
        <div
          v-if="selectedPatient"
          style="margin-top: 12px; padding: 12px 16px; background: #EEF4FF; border-radius: 6px; border: 1px solid #BCCFFF; display: flex; align-items: center; gap: 12px;"
        >
          <t-avatar size="36px" :style="{ background: selectedPatient.avatarColor }">
            {{ selectedPatient.name.charAt(0) }}
          </t-avatar>
          <div style="flex: 1; font-size: 13px; color: #1F2937;">
            <strong>{{ selectedPatient.name }}</strong> · {{ selectedPatient.gender }} · {{ selectedPatient.age }}岁 · {{ selectedPatient.phone }} · {{ selectedPatient.no }}
          </div>
          <span class="tag tag-gold" v-if="selectedPatient.level === 'VIP'">VIP</span>
          <t-button v-if="!isReschedule" size="small" variant="outline" theme="danger" @click="handleRemovePatient">
            移除
          </t-button>
        </div>
      </div>
    </div>

    <!-- Step 2: Choose Store & Doctor -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">② 选择门店 & 医生</div></div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">就诊门店<span class="required">*</span></label>
            <t-select v-model="selectedStore" placeholder="请选择门店">
              <t-option value="🏥 鼾静健康·龙岗总店" label="🏥 鼾静健康·龙岗总店" />
              <t-option value="🏡 鼾静健康·南山分院" label="🏡 鼾静健康·南山分院" />
              <t-option value="🏬 鼾静健康·福田门诊部" label="🏬 鼾静健康·福田门诊部" />
            </t-select>
          </div>
          <div class="form-group">
            <label class="form-label">就诊医生<span class="required">*</span></label>
            <t-select v-model="selectedDoctor" placeholder="请选择医生">
              <t-option value="古堪民 · 主任医师 · 睡眠呼吸科" label="古堪民 · 主任医师 · 睡眠呼吸科" />
              <t-option value="王志远 · 副主任医师 · 耳鼻喉科" label="王志远 · 副主任医师 · 耳鼻喉科" />
              <t-option value="刘婉清 · 主治医师 · 心理科" label="刘婉清 · 主治医师 · 心理科" />
            </t-select>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 3: Select Date & Time Slot -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">③ 选择时间段</div></div>
      <div class="panel-body">
        <div style="display: flex; gap: 12px; margin-bottom: 16px; align-items: center;">
          <t-select v-model="selectedDate" style="width: 200px;" placeholder="选择日期">
            <t-option value="5月29日 周四" label="5月29日 周四" />
            <t-option value="5月30日 周五" label="5月30日 周五" />
            <t-option value="5月31日 周六" label="5月31日 周六" />
          </t-select>
          <div class="legend-container">
            <span class="legend-item"><span class="dot green">●</span> 可约</span>
            <span class="legend-item"><span class="dot gray">●</span> 已满</span>
            <span class="legend-item"><span class="dot blue">●</span> 已选</span>
          </div>
        </div>
        
        <div class="slots-grid">
          <div
            v-for="slot in timeSlots"
            :key="slot.time"
            class="slot-item"
            :class="{
              'full': slot.status === 'full',
              'available': slot.status === 'available' || (slot.status === 'selected' && selectedSlot !== slot.time),
              'selected': selectedSlot === slot.time
            }"
            @click="selectSlot(slot)"
          >
            <div class="slot-time">{{ slot.time }}</div>
            <div class="slot-status-label">{{ selectedSlot === slot.time ? '已选' : slot.status === 'full' ? '已满' : '可约' }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 4: Supplemental Information -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">④ 补充信息</div></div>
      <div class="panel-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">初诊/复诊</label>
            <t-select v-model="visitType" placeholder="初诊/复诊">
              <t-option value="初诊" label="初诊" />
              <t-option value="复诊" label="复诊" />
            </t-select>
          </div>
          <div class="form-group">
            <label class="form-label">挂号费</label>
            <t-input :value="fee" readonly disabled style="background: #F9FAFB;" />
          </div>
          <div class="form-group">
            <label class="form-label">分销推荐人</label>
            <t-select v-model="selectedPromoterId" clearable filterable placeholder="选择分销推荐人（可选）" :options="promoterOptions" />
          </div>
          <div class="form-group full">
            <label class="form-label">备注</label>
            <t-textarea v-model="remarks" placeholder="填写症状描述或其他备注信息" :autosize="{ minRows: 3, maxRows: 6 }" />
          </div>
        </div>
      </div>
    </div>
    
    <!-- 统一共用新患者建档弹窗 -->
    <PatientCreateDialog
      v-model:visible="createVisible"
      :default-name="searchQuery"
      @success="handleCreatePatientSuccess"
    />
  </div>
</template>

<style scoped>


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
.form-group.full {
  grid-column: span 2;
}
.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}
.form-label .required {
  color: var(--error-500);
  margin-left: 2px;
}

/* Date & Legends */
.legend-container {
  font-size: 13px;
  color: #9CA3AF;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.legend-item .dot {
  font-size: 10px;
}
.legend-item .dot.green { color: #10B981; }
.legend-item .dot.gray { color: #9CA3AF; }
.legend-item .dot.blue { color: var(--primary-500); }

/* Slots Grid */
.slots-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}
.slot-item {
  padding: 10px;
  text-align: center;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 150ms;
}
.slot-item.full {
  background: #F9FAFB;
  color: #D1D5DB;
  cursor: not-allowed;
}
.slot-item.available {
  background: #ECFDF5;
  color: #16A34A;
  border: 1px solid #BBF7D0;
}
.slot-item.available:hover {
  background: #D3F5E3;
}
.slot-item.selected {
  background: var(--primary-500);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(59, 107, 245, 0.3);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.tag-gold {
  background: #FFF9E6;
  color: #D4930A;
}
</style>
