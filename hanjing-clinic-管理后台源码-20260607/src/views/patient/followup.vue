<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const route = useRoute()
const router = useRouter()
const patientId = ref(route.params.id as string || '1')
const patientName = ref('张明华')

interface Task {
  id: string;
  doctorId: string;
  type: string;
  typeTag: string; // blue, green, gold
  dueDate: string;
  executor: string;
  content: string;
  status: string; // gold (待执行), green (已完成)
}

const tasks = ref<Task[]>([])
const doctors = ref<any[]>([])

const showCreate = ref(false)
const newTask = ref({
  type: '电话随访',
  dueDate: '',
  doctorId: '',
  content: ''
})

function typeTag(type: string) {
  if (type.includes('电话')) return 'blue'
  if (type.includes('到店')) return 'green'
  return 'gold'
}

function mapTask(row: any): Task {
  return {
    id: String(row.id),
    doctorId: String(row.doctor_id || ''),
    type: row.title || '随访任务',
    typeTag: typeTag(row.title || ''),
    dueDate: String(row.due_date || '').slice(0, 10),
    executor: row.doctor_name || '未分配',
    content: row.description || '',
    status: row.status === 'completed' ? 'green' : 'gold'
  }
}

async function fetchData() {
  try {
    const [patientRes, followRes, doctorRes]: any[] = await Promise.all([
      request.get(`/api/admin/patients/${patientId.value}`),
      request.get(`/api/admin/patients/${patientId.value}/follow-ups`),
      request.get('/api/admin/doctors')
    ])
    patientName.value = patientRes.data?.name || patientName.value
    doctors.value = doctorRes.data || []
    if (!newTask.value.doctorId && doctors.value.length > 0) {
      newTask.value.doctorId = String(doctors.value[0].id)
    }
    tasks.value = (followRes.data?.tasks || []).map(mapTask)
  } catch (error) {
    MessagePlugin.error('加载随访任务失败')
  }
}

function handleBack() {
  router.push(`/patient/detail/${patientId.value}`)
}

async function handleExecute(task: Task) {
  try {
    await request.post(`/api/admin/patients/${patientId.value}/follow-ups/records`, {
      task_id: task.id,
      doctor_id: task.doctorId || newTask.value.doctorId,
      contact_type: task.type,
      summary: task.content || '后台标记随访已完成'
    })
    task.status = 'green'
    MessagePlugin.success(`成功执行 [${task.type}] 随访任务`)
  } catch (error) {
    MessagePlugin.error('执行随访任务失败')
  }
}

async function handleReschedule(task: Task) {
  const current = task.dueDate || new Date().toISOString().slice(0, 10)
  const nextDate = window.prompt('请输入新的计划执行日期（YYYY-MM-DD）', current)
  if (!nextDate) return
  try {
    await request.put(`/api/admin/patients/${patientId.value}/follow-ups/${task.id}`, {
      due_date: nextDate,
      status: 'pending'
    })
    task.dueDate = nextDate
    MessagePlugin.success(`已改期 [${task.type}] 随访`)
  } catch (error) {
    MessagePlugin.error('随访改期失败')
  }
}

async function handleCancel(index: number) {
  const task = tasks.value[index]
  try {
    await request.put(`/api/admin/patients/${patientId.value}/follow-ups/${task.id}`, {
      status: 'cancelled'
    })
    tasks.value.splice(index, 1)
    MessagePlugin.success('随访计划已取消')
  } catch (error) {
    MessagePlugin.error('取消随访计划失败')
  }
}

function handleView(task: Task) {
  MessagePlugin.info(`查看随访详情: ${task.content}`)
}

async function handleCreate() {
  if (!newTask.value.dueDate || !newTask.value.content || !newTask.value.doctorId) {
    MessagePlugin.warning('请填写计划日期、执行医生和随访内容')
    return
  }

  try {
    await request.post(`/api/admin/patients/${patientId.value}/follow-ups`, {
      doctor_id: newTask.value.doctorId,
      title: newTask.value.type,
      description: newTask.value.content,
      due_date: newTask.value.dueDate
    })
    showCreate.value = false
    newTask.value = { type: '电话随访', dueDate: '', doctorId: newTask.value.doctorId, content: '' }
    MessagePlugin.success('新建随访任务成功')
    fetchData()
  } catch (error) {
    MessagePlugin.error('新建随访任务失败')
  }
}

onMounted(fetchData)
</script>

<template>
  <div class="page-container">


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">随访任务 — {{ patientName }}</div>
        <div class="page-title-sub">
          {{ tasks.filter(t => t.status === 'gold').length }}个待完成 · {{ tasks.filter(t => t.status === 'green').length }}个已完成
        </div>
      </div>
      <button class="btn btn-primary" @click="showCreate = true">➕ 新建随访</button>
    </div>

    <!-- Unified Tasks Table -->
    <div class="panel">
      <table class="data-table" v-resizable>
        <thead>
          <tr>
            <th style="width: 120px;">随访类型</th>
            <th style="width: 140px;">计划时间</th>
            <th style="width: 120px;">执行人</th>
            <th style="min-width: 250px;">内容</th>
            <th style="width: 100px;">状态</th>
            <th style="width: 150px; text-align: right;">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(task, idx) in tasks" :key="idx">
            <td>
              <span class="tag tag-blue" v-if="task.typeTag === 'blue'">{{ task.type }}</span>
              <span class="tag tag-green" v-else-if="task.typeTag === 'green'">{{ task.type }}</span>
              <span class="tag tag-gold" v-else-if="task.typeTag === 'gold'">{{ task.type }}</span>
            </td>
            <td :style="{ fontWeight: task.status === 'gold' ? '600' : '400' }">{{ task.dueDate }}</td>
            <td>{{ task.executor }}</td>
            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" :title="task.content">{{ task.content }}</td>
            <td>
              <span class="status-tag gold" v-if="task.status === 'gold'">待执行</span>
              <span class="status-tag green" v-else-if="task.status === 'green'">已完成</span>
            </td>
            <td style="text-align: right;">
              <template v-if="task.status === 'gold'">
                <div style="display: flex; gap: 4px; justify-content: flex-end;">
                  <button class="btn btn-xs btn-primary" @click="handleExecute(task)">执行</button>
                  <button class="btn btn-xs btn-outline" @click="handleReschedule(task)">改期</button>
                  <button class="btn btn-xs btn-danger" @click="handleCancel(idx)">取消</button>
                </div>
              </template>
              <template v-else>
                <div style="display: flex; justify-content: flex-end;">
                  <button class="btn btn-xs btn-outline" @click="handleView(task)">查看</button>
                </div>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Dialog -->
    <t-dialog
      v-model:visible="showCreate"
      header="新建随访任务"
      @confirm="handleCreate"
      :cancelBtn="null"
    >
      <div class="dialog-body-form" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label class="form-label">随访类型</label>
          <select class="form-control" v-model="newTask.type">
            <option>电话随访</option>
            <option>到店复查</option>
            <option>微信随访</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">计划执行日期</label>
          <input type="text" class="form-control" placeholder="如: 6/15" v-model="newTask.dueDate">
        </div>
        <div class="form-group">
          <label class="form-label">执行人</label>
          <select class="form-control" v-model="newTask.doctorId">
            <option v-for="doctor in doctors" :key="doctor.id" :value="String(doctor.id)">{{ doctor.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">随访内容要点</label>
          <textarea class="form-control" placeholder="输入随访要点描述" v-model="newTask.content"></textarea>
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
.btn-danger {
  background: #FEF2F2;
  color: #DC2626;
  border: 1px solid #FECACA;
}
.btn-danger:hover {
  background: #FEE2E2;
}
.btn-xs {
  padding: 3px 8px;
  font-size: 11px;
}

/* Data Table */
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

/* Form Styles */
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
textarea.form-control {
  resize: vertical;
  min-height: 80px;
}
select.form-control {
  appearance: auto;
}

/* Tags */
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
.tag-blue {
  background: #EEF4FF;
  color: #2A52D4;
}
.tag-green {
  background: #ECFDF5;
  color: #16A34A;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.status-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status-tag.green {
  background: #ECFDF5;
  color: #16A34A;
}
.status-tag.green::before {
  background: #22C55E;
}
.status-tag.gold {
  background: #FFF9E6;
  color: #D97706;
}
.status-tag.gold::before {
  background: #F59E0B;
}
</style>
