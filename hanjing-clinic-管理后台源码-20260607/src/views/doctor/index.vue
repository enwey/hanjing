<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()

// UI mockup primary doctors
const primaryDoctors = ref<any[]>([])

const fetchDoctors = async () => {
  try {
    const res: any = await request.get('/api/admin/doctors')
    const gradients = [
      'linear-gradient(135deg, #3B6BF5, #2A52D4)',
      'linear-gradient(135deg, #8B5CF6, #6D28D9)',
      'linear-gradient(135deg, #EC4899, #BE185D)',
      'linear-gradient(135deg, #10B981, #047857)'
    ]
    primaryDoctors.value = res.data.map((d: any, index: number) => {
      let tags = []
      if (d.expertise) {
        try {
          tags = typeof d.expertise === 'string' ? JSON.parse(d.expertise) : d.expertise
        } catch (e) {
          console.error('Failed to parse doctor expertise JSON:', e)
        }
      }
      return {
        id: d.id.toString(),
        name: d.name,
        title: d.title,
        specialty: d.specialty,
        store: d.id === 1 ? '龙岗总店 · 南山分院' : (d.id === 2 ? '龙岗总店' : '福田门诊部'),
        avatarChar: d.name.charAt(0),
        avatarBg: gradients[index % gradients.length],
        consults: d.consult_count || 0,
        rating: Number(d.rating) || 5.0,
        positiveRate: d.rating ? Math.round((Number(d.rating) / 5) * 100) + '%' : '100%',
        isOnline: d.status === 1,
        expertise: tags,
        experience: d.experience_years || 0,
        intro: d.intro || '',
        consultFee: d.consult_fee !== undefined ? d.consult_fee / 100 : 0,
        adminUserId: d.admin_user_id ? String(d.admin_user_id) : '',
        adminUsername: d.admin_username || '',
        adminStatus: d.admin_status || ''
      }
    })
    loadWeeklySchedules()
  } catch (error) {
    console.error('Failed to load doctors:', error)
  }
}

onMounted(() => {
  fetchDoctors()
})

const currentWeek = ref('5/25 - 5/31')

const weekDatesMap: Record<string, { label: string; date: string }[]> = {
  '5/18 - 5/24': [
    { label: '周一 5/18', date: '2026-05-18' },
    { label: '周二 5/19', date: '2026-05-19' },
    { label: '周三 5/20', date: '2026-05-20' },
    { label: '周四 5/21', date: '2026-05-21' },
    { label: '周五 5/22', date: '2026-05-22' },
    { label: '周六 5/23', date: '2026-05-23' },
    { label: '周日 5/24', date: '2026-05-24' }
  ],
  '5/25 - 5/31': [
    { label: '周一 5/25', date: '2026-05-25' },
    { label: '周二 5/26', date: '2026-05-26' },
    { label: '周三 5/27', date: '2026-05-27' },
    { label: '周四 5/28', date: '2026-05-28' },
    { label: '周五 5/29', date: '2026-05-29' },
    { label: '周六 5/30', date: '2026-05-30' },
    { label: '周日 5/31', date: '2026-05-31' }
  ],
  '6/1 - 6/7': [
    { label: '周一 6/1', date: '2026-06-01' },
    { label: '周二 6/2', date: '2026-06-02' },
    { label: '周三 6/3', date: '2026-06-03' },
    { label: '周四 6/4', date: '2026-06-04' },
    { label: '周五 6/5', date: '2026-06-05' },
    { label: '周六 6/6', date: '2026-06-06' },
    { label: '周日 6/7', date: '2026-06-07' }
  ]
}

const scheduleWeekDays = computed(() => {
  const dates = weekDatesMap[currentWeek.value] || weekDatesMap['5/25 - 5/31']
  const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  return dates.map((d, index) => ({ label: d.label, key: keys[index] }))
})

const schedules = ref<any[]>([])

const loadWeeklySchedules = async () => {
  try {
    const dates = weekDatesMap[currentWeek.value] || weekDatesMap['5/25 - 5/31']
    const res: any = await request.get('/api/admin/schedules')
    const allSchedules = res.data || []
    
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    const newSchedules = primaryDoctors.value.map(doc => {
      const row: any = { doctorName: doc.name }
      
      dates.forEach((dObj, idx) => {
        const key = dayKeys[idx]
        const daySchedules = allSchedules.filter((s: any) => 
          String(s.doctor_id) === String(doc.id) && String(s.date).slice(0, 10) === dObj.date
        )
        
        let label = '休息'
        let tagColor = 'gray'
        
        if (daySchedules.length > 0) {
          const hasMorning = daySchedules.some((s: any) => s.period === 'morning')
          const hasAfternoon = daySchedules.some((s: any) => s.period === 'afternoon')
          if (hasMorning && hasAfternoon) {
            label = '全天'
            tagColor = 'green'
          } else if (hasMorning) {
            label = '上午'
            tagColor = 'gold'
          } else if (hasAfternoon) {
            label = '下午'
            tagColor = 'blue'
          }
        }
        
        row[key] = { label, tagColor }
      })
      
      return row
    })
    
    schedules.value = newSchedules
  } catch (error) {
    console.error('Failed to load weekly schedules:', error)
  }
}

const showEdit = ref(false)
const isEdit = ref(false)
const editIndex = ref(-1)
const formData = ref({
  name: '',
  title: '主任医师',
  specialty: '',
  store: '',
  isOnline: true,
  expertiseStr: '',
  experience: 0,
  intro: '',
  consultFee: 0
})

function openSchedule(doctorId: string) {
  router.push(`/doctor/schedule/${doctorId}`)
}

function handleAddDoctor() {
  isEdit.value = false
  formData.value = {
    name: '',
    title: '主任医师',
    specialty: '',
    store: '',
    isOnline: true,
    expertiseStr: '',
    experience: 0,
    intro: '',
    consultFee: 0
  }
  showEdit.value = true
}

function handleEditDoctor(id: string) {
  const idx = primaryDoctors.value.findIndex(d => d.id === id)
  if (idx === -1) return
  isEdit.value = true
  editIndex.value = idx
  const d = primaryDoctors.value[idx]
  formData.value = {
    name: d.name,
    title: d.title,
    specialty: d.specialty,
    store: d.store,
    isOnline: d.isOnline,
    expertiseStr: d.expertise ? d.expertise.join(',') : '',
    experience: d.experience || 0,
    intro: d.intro || '',
    consultFee: d.consultFee || 0
  }
  showEdit.value = true
}

async function handleSave() {
  if (!formData.value.name || !formData.value.specialty || !formData.value.store || formData.value.consultFee === undefined || formData.value.consultFee === null || formData.value.consultFee === '') {
    MessagePlugin.warning('请填写所有必填信息')
    return
  }
  
  const tags = formData.value.expertiseStr
    ? formData.value.expertiseStr.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    : []

  try {
    if (isEdit.value) {
      const d = primaryDoctors.value[editIndex.value]
      await request.put(`/api/admin/doctors/${d.id}`, {
        name: formData.value.name,
        title: formData.value.title,
        specialty: formData.value.specialty,
        hospital: '鼾静门诊部',
        intro: formData.value.intro,
        status: formData.value.isOnline ? 1 : 0,
        expertise: tags.length > 0 ? tags : null,
        experience_years: Number(formData.value.experience),
        consult_fee: Math.round(Number(formData.value.consultFee) * 100)
      })
      MessagePlugin.success('保存医生档案成功')
    } else {
      await request.post('/api/admin/doctors', {
        name: formData.value.name,
        title: formData.value.title,
        specialty: formData.value.specialty,
        hospital: '鼾静门诊部',
        intro: formData.value.intro,
        status: formData.value.isOnline ? 1 : 0,
        expertise: tags.length > 0 ? tags : null,
        experience_years: Number(formData.value.experience),
        consult_fee: Math.round(Number(formData.value.consultFee) * 100)
      })
      MessagePlugin.success('新增医生档案成功')
    }
    fetchDoctors()
    showEdit.value = false
  } catch (error) {
    console.error(error)
  }
}

function handleViewData(name: string) {
  router.push('/store/report')
}

function openAdminAccounts() {
  router.push('/settings/admin')
}

function handlePrevWeek() {
  currentWeek.value = '5/18 - 5/24'
  loadWeeklySchedules()
}

function handleCurrentWeek() {
  currentWeek.value = '5/25 - 5/31'
  loadWeeklySchedules()
}

function handleNextWeek() {
  currentWeek.value = '6/1 - 6/7'
  loadWeeklySchedules()
}
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">医生管理</div>
        <div class="page-title-sub">管理坐诊医生信息与排班</div>
      </div>
      <button class="btn btn-primary" @click="handleAddDoctor"><AppIcon name="plus" />  添加医生</button>
    </div>

    <!-- Doctor Cards Grid -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
      <div v-for="dr in primaryDoctors" :key="dr.id" class="panel" style="margin-bottom: 0;">
        <div class="panel-body" style="text-align: center; padding: 24px;">
          <!-- Doctor Avatar -->
          <div :style="{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: dr.avatarBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            color: '#fff',
            margin: '0 auto 12px',
            fontWeight: '700'
          }">
            {{ dr.avatarChar }}
          </div>
          <!-- Doctor Name -->
          <div style="font-size: 16px; font-weight: 700; color: #111827;">{{ dr.name }}</div>
          <!-- Title & Specialty -->
          <div style="font-size: 12px; color: #3B6BF5; margin-top: 2px;">{{ dr.title }} · {{ dr.specialty }} · {{ dr.experience }}年经验</div>
          <!-- Store -->
          <div style="font-size: 12px; color: #9CA3AF; margin-top: 4px;">{{ dr.store }}</div>
          <!-- Registration Fee -->
          <div style="font-size: 12px; color: #374151; margin-top: 4px; font-weight: 500;">
            挂号费：<span style="color: #EC4899; font-weight: bold;">¥{{ dr.consultFee !== undefined ? dr.consultFee.toFixed(2) : '0.00' }}</span>
          </div>
          <div style="margin-top: 8px;">
            <span v-if="dr.adminUserId" class="status-tag green">后台账号：{{ dr.adminUsername }}</span>
            <span v-else class="status-tag gray">未开通后台账号</span>
          </div>
          <!-- Tags / Expertise -->
          <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 8px; min-height: 20px;">
            <span v-for="tag in dr.expertise" :key="tag" style="font-size: 10px; background: #EBF2FF; color: #3B6BF5; padding: 2px 6px; border-radius: 4px; font-weight: 500;">
              {{ tag }}
            </span>
            <span v-if="!dr.expertise || dr.expertise.length === 0" style="font-size: 10px; background: #F3F4F6; color: #9CA3AF; padding: 2px 6px; border-radius: 4px; border: 1px dashed #D1D5DB;">
              默认科室标签
            </span>
          </div>
          
          <!-- Statistics Row -->
          <div style="display: flex; justify-content: center; gap: 16px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #F3F4F6;">
            <div style="flex: 1;">
              <div style="font-size: 18px; font-weight: 700; color: #3B6BF5;">{{ dr.consults }}</div>
              <div style="font-size: 10px; color: #9CA3AF;">累计接诊</div>
            </div>
            <div style="flex: 1;">
              <div style="font-size: 18px; font-weight: 700; color: #10B981;">{{ dr.rating }}</div>
              <div style="font-size: 10px; color: #9CA3AF;">评分</div>
            </div>
            <div style="flex: 1;">
              <div style="font-size: 18px; font-weight: 700; color: #F59E0B;">{{ dr.positiveRate }}</div>
              <div style="font-size: 10px; color: #9CA3AF;">好评率</div>
            </div>
          </div>

          <!-- Actions button bar -->
          <div style="display: flex; gap: 8px; margin-top: 16px; justify-content: center;">
            <button class="btn btn-sm btn-outline" style="flex: 1;" @click="handleEditDoctor(dr.id)">编辑</button>
            <button class="btn btn-sm btn-outline" style="flex: 1;" @click="openSchedule(dr.id)">排班</button>
            <button class="btn btn-sm btn-outline" style="flex: 1;" @click="dr.adminUserId ? handleViewData(dr.name) : openAdminAccounts()">{{ dr.adminUserId ? '数据' : '开通账号' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Schedule Weekly Calendar Panel -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header">
        <div class="panel-title">本周排班 · {{ currentWeek }}</div>
        <div class="panel-actions">
          <button class="btn btn-sm btn-outline" @click="handlePrevWeek">‹ 上周</button>
          <button class="btn btn-sm btn-primary" @click="handleCurrentWeek">本周</button>
          <button class="btn btn-sm btn-outline" @click="handleNextWeek">下周 ›</button>
        </div>
      </div>
      <div class="panel-body" style="overflow-x: auto; padding: 0;">
        <table class="data-table" style="min-width: 800px;" v-resizable>
          <thead>
            <tr>
              <th>医生</th>
              <th v-for="day in scheduleWeekDays" :key="day.key">{{ day.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sch in schedules" :key="sch.doctorName">
              <td style="font-weight: 600; color: #1F2937;">{{ sch.doctorName }}</td>
              <td><span :class="['status-tag', sch.mon.tagColor]">{{ sch.mon.label }}</span></td>
              <td><span :class="['status-tag', sch.tue.tagColor]">{{ sch.tue.label }}</span></td>
              <td><span :class="['status-tag', sch.wed.tagColor]">{{ sch.wed.label }}</span></td>
              <td><span :class="['status-tag', sch.thu.tagColor]">{{ sch.thu.label }}</span></td>
              <td><span :class="['status-tag', sch.fri.tagColor]">{{ sch.fri.label }}</span></td>
              <td><span :class="['status-tag', sch.sat.tagColor]">{{ sch.sat.label }}</span></td>
              <td><span :class="['status-tag', sch.sun.tagColor]">{{ sch.sun.label }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add/Edit Doctor Dialog -->
    <t-dialog
      v-model:visible="showEdit"
      :header="isEdit ? '编辑医生档案' : '添加医生档案'"
      @confirm="handleSave"
      :cancelBtn="null"
    >
      <div class="dialog-body-form" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label class="form-label">姓名<span class="required">*</span></label>
          <input type="text" class="form-control" v-model="formData.name" placeholder="请输入姓名">
        </div>
        <div class="form-group">
          <label class="form-label">职称<span class="required">*</span></label>
          <select class="form-control" v-model="formData.title">
            <option value="主任医师">主任医师</option>
            <option value="副主任医师">副主任医师</option>
            <option value="主治医师">主治医师</option>
            <option value="医师">医师</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">科室<span class="required">*</span></label>
          <input type="text" class="form-control" v-model="formData.specialty" placeholder="例如：睡眠呼吸科">
        </div>
        <div class="form-group">
          <label class="form-label">工作经验（年）<span class="required">*</span></label>
          <input type="number" class="form-control" v-model="formData.experience" placeholder="请输入工作经验年限" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">挂号费（元）<span class="required">*</span></label>
          <input type="number" class="form-control" v-model="formData.consultFee" placeholder="请输入挂号费金额" min="0" step="0.01">
        </div>
        <div class="form-group">
          <label class="form-label">就诊门店<span class="required">*</span></label>
          <input type="text" class="form-control" v-model="formData.store" placeholder="例如：龙岗总店 · 南山分院">
        </div>
        <div class="form-group">
          <label class="form-label">擅长标签</label>
          <input type="text" class="form-control" v-model="formData.expertiseStr" placeholder="请输入标签，多个以中/英文逗号隔开">
          <div style="font-size: 11px; color: #9CA3AF; margin-top: 2px;">
            留空时，将自动根据医生科室匹配默认标签（如“睡眠呼吸暂停综合症”等）。
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">个人简介</label>
          <textarea class="form-control" v-model="formData.intro" placeholder="请输入医生个人简介或擅长领域的详细描述..."></textarea>
        </div>
        <div class="form-group" style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-top: 4px;">
          <label class="form-label" style="margin-bottom: 0;">是否在岗/在线</label>
          <t-switch v-model="formData.isOnline" size="medium" />
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
/* Panel Layouts */
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
.panel-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.panel-body {
  padding: 20px;
}

/* Data Table styling */
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  text-align: left;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #9CA3AF;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
}
.data-table td {
  padding: 12px 14px;
  font-size: 13px;
  color: #4B5563;
  border-bottom: 1px solid #F3F4F6;
  vertical-align: middle;
}
.data-table tr:hover td {
  background: #F9FAFB;
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
.status-tag.blue {
  background: #eef4ff;
  color: #3b6bf5;
}
.status-tag.blue::before {
  background: #3b6bf5;
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
.status-tag.red {
  background: #fef2f2;
  color: #dc2626;
}
.status-tag.red::before {
  background: #ef4444;
}

/* === 表单样式 === */
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
textarea.form-control {
  height: auto;
  min-height: 80px;
  resize: vertical;
  line-height: 1.5;
  padding: 8px 12px;
}
select.form-control {
  appearance: auto;
}
.required {
  color: #EF4444;
  margin-left: 2px;
}
</style>
