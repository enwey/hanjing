<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
        intro: d.intro || ''
      }
    })
  } catch (error) {
    console.error('Failed to load doctors:', error)
  }
}

onMounted(() => {
  fetchDoctors()
})

// Weekly schedule mock data matching mockup
const currentWeek = ref('5/25 - 5/31')
const scheduleWeekDays = [
  { label: '周一 5/25', key: 'mon' },
  { label: '周二 5/26', key: 'tue' },
  { label: '周三 5/27', key: 'wed' },
  { label: '周四 5/28', key: 'thu' },
  { label: '周五 5/29', key: 'fri' },
  { label: '周六 5/30', key: 'sat' },
  { label: '周日 5/31', key: 'sun' }
]

const schedules = ref([
  {
    doctorName: '古堪民',
    mon: { label: '全天', tagColor: 'green' },
    tue: { label: '全天', tagColor: 'green' },
    wed: { label: '上午', tagColor: 'gold' },
    thu: { label: '全天', tagColor: 'green' },
    fri: { label: '全天', tagColor: 'green' },
    sat: { label: '上午', tagColor: 'gold' },
    sun: { label: '休息', tagColor: 'gray' }
  },
  {
    doctorName: '王志远',
    mon: { label: '下午', tagColor: 'gold' },
    tue: { label: '全天', tagColor: 'green' },
    wed: { label: '全天', tagColor: 'green' },
    thu: { label: '上午', tagColor: 'gold' },
    fri: { label: '全天', tagColor: 'green' },
    sat: { label: '休息', tagColor: 'gray' },
    sun: { label: '休息', tagColor: 'gray' }
  },
  {
    doctorName: '刘婉清',
    mon: { label: '休息', tagColor: 'gray' },
    tue: { label: '下午', tagColor: 'gold' },
    wed: { label: '全天', tagColor: 'green' },
    thu: { label: '全天', tagColor: 'green' },
    fri: { label: '上午', tagColor: 'gold' },
    sat: { label: '全天', tagColor: 'green' },
    sun: { label: '上午', tagColor: 'gold' }
  }
])

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
  intro: ''
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
    intro: ''
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
    intro: d.intro || ''
  }
  showEdit.value = true
}

async function handleSave() {
  if (!formData.value.name || !formData.value.specialty || !formData.value.store) {
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
        experience_years: Number(formData.value.experience)
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
        experience_years: Number(formData.value.experience)
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

function handlePrevWeek() {
  currentWeek.value = '5/18 - 5/24'
  MessagePlugin.info('加载上周排班数据')
}

function handleCurrentWeek() {
  currentWeek.value = '5/25 - 5/31'
  MessagePlugin.info('已回到本周排班')
}

function handleNextWeek() {
  currentWeek.value = '6/1 - 6/7'
  MessagePlugin.info('加载下周排班数据')
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
      <button class="btn btn-primary" @click="handleAddDoctor">➕ 添加医生</button>
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
            <button class="btn btn-sm btn-outline" style="flex: 1;" @click="handleViewData(dr.name)">数据</button>
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
