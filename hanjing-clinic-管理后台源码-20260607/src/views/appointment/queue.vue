<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

interface QueueItem {
  id: string;
  no: string;
  patientName: string;
  phone: string;
  doctorName: string;
  doctorId: string;
  storeName: string;
  timeSlot: string;
  symptom: string;
  status: string;
}

const appointments = ref<QueueItem[]>([])
const loading = ref(false)

const fetchAppointments = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/api/admin/appointments')
    appointments.value = res.data.map((item: any) => ({
      id: item.id.toString(),
      no: item.appointment_no,
      patientName: item.patient_name,
      phone: item.patient_phone,
      doctorName: item.doctor_name,
      doctorId: item.doctor_id.toString(),
      storeName: item.store_name,
      timeSlot: item.appointment_time,
      symptom: item.symptom_desc || '无主诉描述',
      status: item.status // pending, confirmed (waiting), completed (arrived)
    }))
  } catch (error) {
    console.error(error)
    MessagePlugin.error('获取排队数据失败')
  } finally {
    loading.value = false
  }
}

// Group appointments by doctor
const doctorQueues = computed(() => {
  const queues: Record<string, { doctorName: string; storeName: string; waitingList: QueueItem[]; current: QueueItem | null }> = {}
  
  appointments.value.forEach(item => {
    // Only show today's or pending/confirmed in the queue
    if (item.status === 'completed') return // Completed is already finished
    
    if (!queues[item.doctorId]) {
      queues[item.doctorId] = {
        doctorName: item.doctorName,
        storeName: item.storeName,
        waitingList: [],
        current: null
      }
    }
    
    if (item.status === 'confirmed') {
      // Treat first confirmed as currently treating
      if (!queues[item.doctorId].current) {
        queues[item.doctorId].current = item
      } else {
        queues[item.doctorId].waitingList.push(item)
      }
    } else if (item.status === 'pending') {
      queues[item.doctorId].waitingList.push(item)
    }
  })
  
  return Object.entries(queues).map(([id, queue]) => ({
    doctorId: id,
    ...queue
  }))
})

// Call patient voice broadcast
const callPatient = (patientName: string, doctorName: string) => {
  if ('speechSynthesis' in window) {
    const text = `请患者 ${patientName}，到 ${doctorName} 医生诊室就诊。`
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.9
    window.speechSynthesis.speak(utterance)
    MessagePlugin.success(`呼叫广播成功: "${text}"`)
  } else {
    MessagePlugin.warning('浏览器不支持语音播报，已通过系统弹窗提示')
  }
}

// Start treatment (sign-in triage)
const startTreatment = async (item: QueueItem) => {
  try {
    await request.put(`/api/admin/appointments/${item.id}`, { status: 'confirmed' })
    MessagePlugin.success(`患者 ${item.patientName} 已签到进入候诊状态`)
    fetchAppointments()
  } catch (error) {
    console.error(error)
  }
}

// Complete treatment
const completeTreatment = async (item: QueueItem) => {
  try {
    await request.put(`/api/admin/appointments/${item.id}`, { status: 'completed' })
    MessagePlugin.success(`患者 ${item.patientName} 就诊诊断已完成，请引导至收银台结算。`)
    fetchAppointments()
  } catch (error) {
    console.error(error)
  }
}

// Move patient down the queue (顺延)
const delayPatient = (item: QueueItem) => {
  // Local swap for simulation
  const index = appointments.value.findIndex(a => a.id === item.id)
  if (index !== -1) {
    const [moved] = appointments.value.splice(index, 1)
    appointments.value.push(moved) // move to end
    MessagePlugin.success(`已将 ${item.patientName} 的顺序往后顺延`)
  }
}

onMounted(() => {
  fetchAppointments()
})
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">排队分诊控制台</div>
        <div class="page-title-sub">实时呼叫、就诊安排与队列顺延管理</div>
      </div>
      <div>
        <t-button theme="primary" variant="outline" @click="fetchAppointments" :loading="loading">
          🔄 刷新队列
        </t-button>
      </div>
    </div>

    <div v-if="doctorQueues.length === 0" class="empty-state">
      <div style="font-size: 48px; margin-bottom: 16px;">👥</div>
      <div style="font-size: 16px; color: #4B5563; font-weight: 500;">今日暂无排队候诊中的患者</div>
      <div style="font-size: 12px; color: #9CA3AF; margin-top: 8px;">小程序端预约确认或前台登记后，数据将在此同步。</div>
    </div>

    <div v-else class="queue-grid">
      <div v-for="q in doctorQueues" :key="q.doctorId" class="doctor-card">
        <div class="doctor-header">
          <div>
            <div class="doc-name">{{ q.doctorName }}</div>
            <div class="doc-sub">{{ q.storeName }} · 睡眠门诊</div>
          </div>
          <t-tag theme="primary" size="small">就诊室</t-tag>
        </div>

        <!-- Current Patient -->
        <div class="current-section">
          <div class="section-title">🔊 当前就诊中</div>
          <div v-if="q.current" class="current-patient-card">
            <div class="patient-info">
              <div class="pat-name">{{ q.current.patientName }}</div>
              <div class="pat-time">预约时段: {{ q.current.timeSlot }}</div>
            </div>
            <div class="action-row">
              <t-button size="small" theme="primary" @click="callPatient(q.current.patientName, q.doctorName)">
                📢 重新呼叫
              </t-button>
              <t-button size="small" theme="success" @click="completeTreatment(q.current)">
                ✅ 诊疗完成
              </t-button>
            </div>
          </div>
          <div v-else class="no-patient">
            当前无就诊中患者，请呼叫下一位
          </div>
        </div>

        <!-- Waiting List -->
        <div class="waiting-section">
          <div class="section-title">⏳ 候诊队列 ({{ q.waitingList.length }}人)</div>
          <div class="waiting-list">
            <div v-for="(item, idx) in q.waitingList" :key="item.id" class="waiting-item">
              <div class="wait-left">
                <span class="wait-idx">{{ idx + 1 }}</span>
                <div>
                  <div class="wait-name">{{ item.patientName }}</div>
                  <div class="wait-time">{{ item.timeSlot }} · {{ item.status === 'pending' ? '待报到' : '候诊中' }}</div>
                </div>
              </div>
              <div class="wait-right">
                <t-button v-if="item.status === 'pending'" size="extra-small" theme="warning" variant="outline" @click="startTreatment(item)">
                  签到报到
                </t-button>
                <t-button v-else size="extra-small" theme="primary" variant="outline" @click="callPatient(item.patientName, q.doctorName)">
                  叫号
                </t-button>
                <t-button size="extra-small" theme="default" variant="text" @click="delayPatient(item)">
                  顺延
                </t-button>
              </div>
            </div>
            <div v-if="q.waitingList.length === 0" class="no-waiting">
              队列为空
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
}
.page-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1F2937;
}
.page-title-sub {
  font-size: 13px;
  color: #6B7280;
  margin-top: 4px;
}
.empty-state {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 60px 20px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  margin-top: 20px;
}
.queue-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 20px;
  margin-top: 20px;
}
.doctor-card {
  background: #FFFFFF;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  border: 1px solid #E5E7EB;
  display: flex;
  flex-direction: column;
}
.doctor-header {
  padding: 16px;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.doc-name {
  font-size: 16px;
  font-weight: 700;
  color: #1F2937;
}
.doc-sub {
  font-size: 12px;
  color: #6B7280;
  margin-top: 2px;
}
.current-section {
  padding: 16px;
  border-bottom: 1px solid #E5E7EB;
  background: #EEF4FF;
}
.section-title {
  font-size: 12px;
  font-weight: 600;
  color: #4B5563;
  margin-bottom: 10px;
  text-transform: uppercase;
}
.current-patient-card {
  background: #FFFFFF;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #BFDBFE;
  box-shadow: 0 2px 4px rgba(59, 107, 245, 0.05);
}
.patient-info {
  margin-bottom: 10px;
}
.pat-name {
  font-size: 16px;
  font-weight: 700;
  color: #1F2937;
}
.pat-time {
  font-size: 12px;
  color: #4B5563;
  margin-top: 2px;
}
.action-row {
  display: flex;
  gap: 8px;
}
.no-patient {
  background: #FFFFFF;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  color: #9CA3AF;
  font-size: 12px;
  border: 1px dashed #D1D5DB;
}
.waiting-section {
  padding: 16px;
  flex: 1;
}
.waiting-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
}
.waiting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #F9FAFB;
  border-radius: 6px;
  border: 1px solid #E5E7EB;
}
.wait-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.wait-idx {
  font-size: 14px;
  font-weight: 700;
  color: #9CA3AF;
  background: #E5E7EB;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wait-name {
  font-size: 14px;
  font-weight: 600;
  color: #1F2937;
}
.wait-time {
  font-size: 11px;
  color: #6B7280;
}
.wait-right {
  display: flex;
  gap: 4px;
  align-items: center;
}
.no-waiting {
  text-align: center;
  color: #9CA3AF;
  font-size: 12px;
  padding: 20px 0;
}
</style>
