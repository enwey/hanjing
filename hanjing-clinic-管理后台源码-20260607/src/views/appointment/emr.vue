<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()
const route = useRoute()
const apptId = route.params.id as string

const loading = ref(true)
const submitting = ref(false)

// Data states
const appt = ref<any>({})
const essReport = ref<any>(null)
const snoreReport = ref<any>(null)

// EMR Form States
const diagnosis = ref('')
const prescription = ref('')
const doctorAdvice = ref('')
const note = ref('')

// Treatment Profile States
const syncTreatment = ref(true)
const deviceModel = ref('HJ-MAD-03')
const initialAdvancement = ref(4.0)
const startDate = ref(new Date().toISOString().split('T')[0])
const nextAdjustDate = ref(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

// Templates
const diagnosisTemplates = [
  '轻度阻塞性睡眠呼吸暂停低通气综合征 (OSAHS)，伴单纯性鼾症。',
  '中度阻塞性睡眠呼吸暂停低通气综合征 (OSAHS)，AHI 18次/小时，伴中度日间嗜睡。',
  '重度阻塞性睡眠呼吸暂停低通气综合征 (OSAHS)，AHI 32次/小时，伴夜间低氧血症。',
  '习惯性单纯打鼾（鼾症），无明显呼吸暂停与缺氧。'
]

const prescriptionTemplates = [
  '定制式下颌前移阻鼾器 HJ-MAD-03',
  '定制式下颌前移阻鼾器 HJ-MAD-02 (轻量版)',
  '家庭睡眠监测 (HSAT) 复查',
  '阻鼾器专用清洁泡腾片 + 阻鼾舒眠记忆枕'
]

const adviceTemplates = [
  '建议每晚配戴阻鼾器不低于 6 小时。初戴 1-2 周内可能有关节微酸或流涎反应，属正常现象。',
  '配戴治疗期间注意保持口腔卫生，每日晨起后使用清水及泡腾片清洁设备。',
  '避开侧卧或俯卧，尽量保持平卧，有助于减轻气道阻塞。两周后门诊复查微调下颌前伸度。',
  '建议控制体重，戒烟限酒，避免在睡前服用镇静催眠类药物。'
]

// Fetch Appointment and Assessment data
const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await request.get(`/api/admin/appointments/${apptId}`)
    if (res.code === 200 && res.data) {
      appt.value = res.data
      
      // Pre-fill prescription if symptoms suggest it
      prescription.value = '定制式下颌前移阻鼾器 HJ-MAD-03'
      diagnosis.value = appt.value.symptom_desc ? `初步诊断：${appt.value.symptom_desc}。建议配戴阻鼾器治疗。` : ''
      doctorAdvice.value = '建议每晚配戴阻鼾器不低于 6 小时。两周后门诊复查微调下颌前伸度。'

      // Fetch ESS report if linked
      if (appt.value.ess_assessment_id) {
        try {
          const essRes: any = await request.get(`/api/admin/assessments/ess/${appt.value.ess_assessment_id}`)
          if (essRes.code === 200) {
            essReport.value = essRes.data
          }
        } catch (e) {
          console.error('获取ESS报告失败', e)
        }
      }

      // Fetch Snore report if linked
      if (appt.value.snore_assessment_id) {
        try {
          const snoreRes: any = await request.get(`/api/admin/assessments/snore/${appt.value.snore_assessment_id}`)
          if (snoreRes.code === 200) {
            snoreReport.value = snoreRes.data
          }
        } catch (e) {
          console.error('获取鼾声报告失败', e)
        }
      }
    } else {
      MessagePlugin.error('预约记录加载失败')
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('获取门诊接诊数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchData()
})

const applyTemplate = (type: 'diagnosis' | 'prescription' | 'advice', text: string) => {
  if (type === 'diagnosis') diagnosis.value = text
  else if (type === 'prescription') {
    prescription.value = text
    // Automatically toggle treatment profiling if HJ-MAD is prescribed
    if (text.toLowerCase().includes('hj-mad')) {
      syncTreatment.value = true
    }
  }
  else if (type === 'advice') doctorAdvice.value = text
}

const formatDuration = (seconds: number) => {
  if (!seconds) return '0分钟'
  const mins = Math.floor(seconds / 60)
  return `${mins}分钟`
}

const handleSubmit = async () => {
  if (!diagnosis.value.trim()) {
    MessagePlugin.warning('请输入临床诊断结果')
    return
  }

  submitting.value = true
  try {
    // 1. Submit Medical Record
    const emrPayload = {
      doctor_id: appt.value.doctor_id,
      store_id: appt.value.store_id,
      appointment_id: appt.value.id,
      visit_date: new Date().toISOString().split('T')[0],
      diagnosis: diagnosis.value,
      prescription: prescription.value,
      doctor_advice: doctorAdvice.value,
      note: note.value
    }

    const emrRes: any = await request.post(`/api/admin/patients/${appt.value.patient_id}/medical-records`, emrPayload)
    
    if (emrRes.code === 200) {
      // 2. Submit Treatment Profiling if toggled
      if (syncTreatment.value) {
        const treatmentPayload = {
          doctor_id: appt.value.doctor_id,
          device_model: deviceModel.value,
          initial_advancement: initialAdvancement.value,
          start_date: startDate.value
        }
        await request.post(`/api/admin/patients/${appt.value.patient_id}/treatment`, treatmentPayload)
        
        // Also check if we need to schedule a follow-up task
        if (nextAdjustDate.value) {
          const followUpPayload = {
            doctor_id: appt.value.doctor_id,
            title: `阻鼾器物理微调 - 2周复查`,
            description: `初次配戴 ${deviceModel.value} (初始前伸量 ${initialAdvancement.value}mm) 满两周，到店复查微调下颌前伸度。`,
            due_date: nextAdjustDate.value
          }
          await request.post(`/api/admin/patients/${appt.value.patient_id}/follow-ups`, followUpPayload)
        }
      }
      
      MessagePlugin.success('诊疗录入成功，患者已就诊完毕并完成建档！')
      router.push('/queue')
    } else {
      MessagePlugin.error(emrRes.message || '诊疗录入失败')
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('提交诊疗数据失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">门诊诊疗与病历建档</div>
        <div class="page-title-sub">录入患者电子病历、处方方案及同步建档睡眠治疗</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-outline" @click="router.push('/queue')">取消</button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : '💾 保存并结束就诊' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>正在加载就诊患者信息及睡眠分析报告...</p>
    </div>

    <div v-else class="workspace-body card-grid-2">
      <!-- Left Column: Patient Info & Diagnostic Reports -->
      <div class="column-left">
        <!-- Patient Info Card -->
        <div class="panel patient-card">
          <div class="panel-header">
            <div class="panel-title">👤 就诊患者信息</div>
            <span class="tag tag-blue">接诊中</span>
          </div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">姓名</div>
              <div class="info-value font-bold">{{ appt.patient_name }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">性别/年龄</div>
              <div class="info-value">{{ appt.patient_gender === 1 ? '男' : '女' }} / {{ appt.patient_age }}岁</div>
            </div>
            <div class="info-item">
              <div class="info-label">联系电话</div>
              <div class="info-value">{{ appt.patient_phone }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">接诊医生</div>
              <div class="info-value">{{ appt.doctor_name }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">就诊科室</div>
              <div class="info-value">睡眠呼吸科</div>
            </div>
            <div class="info-item">
              <div class="info-label">挂号时间</div>
              <div class="info-value">{{ appt.appointment_date }} · {{ appt.appointment_time }}</div>
            </div>
          </div>
          <div class="symptom-section">
            <div class="symptom-title">💬 患者主诉：</div>
            <div class="symptom-desc">{{ appt.symptom_desc || '无主诉描述' }}</div>
          </div>
        </div>

        <!-- Diagnostic Reports Card (ESS & Snore) -->
        <div class="panel report-card">
          <div class="panel-header">
            <div class="panel-title">📊 睡眠筛查与 AI 鼾声监测报告</div>
          </div>
          
          <div class="reports-container">
            <!-- Sleep ESS Score -->
            <div v-if="essReport" class="report-box ess-box">
              <div class="report-box-title">
                <span>📝 ESS 嗜睡量表结果</span>
                <span class="score-badge" :class="essReport.total_score >= 10 ? 'red' : 'green'">
                  {{ essReport.total_score }}分 ({{ essReport.risk_level }})
                </span>
              </div>
              <div class="report-box-content">
                <p>患者自我评估日间嗜睡度较正常偏高，需重点关注夜间睡眠低氧与憋气情况。</p>
              </div>
            </div>
            <div v-else class="report-empty">
              <span>📝 暂无本次就诊关联的在线 ESS 嗜睡量表评估结果</span>
            </div>

            <!-- Snore AI Analysis -->
            <div v-if="snoreReport" class="report-box snore-box">
              <div class="report-box-title">
                <span>🔊 AI 鼾声录音分析报告</span>
                <span class="risk-badge" :class="snoreReport.risk_level">
                  {{ snoreReport.risk_level === 'high' ? '高风险' : (snoreReport.risk_level === 'medium' ? '中风险' : '低风险') }}
                </span>
              </div>
              <div class="report-box-content">
                <div class="metric-grid">
                  <div class="metric-item">
                    <span class="metric-lbl">录音时长</span>
                    <span class="metric-val">{{ formatDuration(snoreReport.duration) }}</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-lbl">平均分贝</span>
                    <span class="metric-val">{{ snoreReport.avg_decibel }} dB</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-lbl">峰值分贝</span>
                    <span class="metric-val">{{ snoreReport.peak_decibel }} dB</span>
                  </div>
                  <div class="metric-item">
                    <span class="metric-lbl">呼吸暂停 (次数)</span>
                    <span class="metric-val font-error">{{ snoreReport.apnea_events }} 次</span>
                  </div>
                </div>
                <div class="metric-desc">
                  鼾声占比 {{ snoreReport.snore_rate }}%，夜间监测过程中记录到 {{ snoreReport.apnea_events }} 次疑似呼吸暂停事件，提示气道塌陷风险。
                </div>
              </div>
            </div>
            <div v-else class="report-empty">
              <span>🔊 暂无本次就诊关联的 AI 鼾声监测音频分析数据</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Medical Record Form & Treatment Profiling -->
      <div class="column-right">
        <!-- Clinic Form Panel -->
        <div class="panel form-panel">
          <div class="panel-header">
            <div class="panel-title">✍️ 电子病历信息录入</div>
          </div>
          
          <div class="form-body">
            <!-- Diagnosis -->
            <div class="form-group">
              <label class="form-label">
                临床诊断 <span class="required">*</span>
              </label>
              <textarea 
                v-model="diagnosis" 
                class="form-control text-area" 
                placeholder="请输入医生的临床诊断诊断结果，如 AHI 指标、严重程度等..."
                rows="4"
              ></textarea>
              <div class="template-selector">
                <span class="template-label">💡 快速诊断模板：</span>
                <div class="template-chips">
                  <span 
                    v-for="(t, i) in diagnosisTemplates" 
                    :key="i" 
                    class="template-chip" 
                    @click="applyTemplate('diagnosis', t)"
                  >
                    模板{{ i + 1 }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Prescription -->
            <div class="form-group">
              <label class="form-label">
                治疗处方 / 方案
              </label>
              <input 
                v-model="prescription" 
                type="text" 
                class="form-control" 
                placeholder="请输入治疗方案或开具处方，例如：配戴阻鼾器 HJ-MAD-03"
              >
              <div class="template-selector">
                <span class="template-label">💡 方案模板：</span>
                <div class="template-chips">
                  <span 
                    v-for="(t, i) in prescriptionTemplates" 
                    :key="i" 
                    class="template-chip" 
                    @click="applyTemplate('prescription', t)"
                  >
                    {{ t.split(' ')[0] }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Advice -->
            <div class="form-group">
              <label class="form-label">
                医嘱建议
              </label>
              <textarea 
                v-model="doctorAdvice" 
                class="form-control text-area" 
                placeholder="请输入向患者交待的日常注意事项、配戴要求和复诊建议..."
                rows="3"
              ></textarea>
              <div class="template-selector">
                <span class="template-label">💡 常用医嘱：</span>
                <div class="template-chips">
                  <span 
                    v-for="(t, i) in adviceTemplates" 
                    :key="i" 
                    class="template-chip" 
                    @click="applyTemplate('advice', t)"
                  >
                    模板{{ i + 1 }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <div class="form-group">
              <label class="form-label">
                备注 (选填)
              </label>
              <input 
                v-model="note" 
                type="text" 
                class="form-control" 
                placeholder="后台备注信息，不对患者公开"
              >
            </div>
          </div>
        </div>

        <!-- Treatment Record Sync (阻鼾器建档专用) -->
        <div class="panel treatment-panel">
          <div class="panel-header">
            <div class="panel-title flex-row">
              <input 
                id="sync-treatment" 
                v-model="syncTreatment" 
                type="checkbox" 
                class="checkbox-ctrl"
              >
              <label for="sync-treatment" class="checkbox-label font-bold">
                🛠️ 同步建立/更新物理阻鼾治疗档案
              </label>
            </div>
          </div>

          <div v-show="syncTreatment" class="treatment-form-body">
            <div class="info-alert">
              💡 开启此项后，系统将自动为该患者建立物理阻鼾随访档案，以记录设备的日常佩戴打卡日志与物理调节量。
            </div>

            <div class="card-grid-2">
              <div class="form-group">
                <label class="form-label">物理阻鼾器型号</label>
                <select v-model="deviceModel" class="form-control select-ctrl">
                  <option value="HJ-MAD-03">HJ-MAD-03 (可调舌型旗舰款)</option>
                  <option value="HJ-MAD-02">HJ-MAD-02 (经典可调式)</option>
                  <option value="HJ-MAD-01">HJ-MAD-01 (标准固定式)</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">初始下颌前移量 (mm)</label>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <input 
                    v-model="initialAdvancement" 
                    type="range" 
                    min="0" 
                    max="10" 
                    step="0.5" 
                    style="flex: 1;"
                  >
                  <span class="adv-value">{{ initialAdvancement }} mm</span>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">初配戴/治疗启动日期</label>
                <input 
                  v-model="startDate" 
                  type="date" 
                  class="form-control"
                >
              </div>

              <div class="form-group">
                <label class="form-label">计划下次微调复诊日期</label>
                <input 
                  v-model="nextAdjustDate" 
                  type="date" 
                  class="form-control"
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: #6B7280;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #E5E7EB;
  border-top-color: var(--primary-500);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.workspace-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.column-left, .column-right {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel {
  background: #FFF;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 20px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #F3F4F6;
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #1F2937;
}

.flex-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-ctrl {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.checkbox-label {
  cursor: pointer;
  user-select: none;
  font-size: 15px;
}

.font-bold {
  font-weight: 600;
}

.font-error {
  color: #EF4444;
  font-weight: 600;
}

.tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}
.tag-blue {
  background-color: #EFF6FF;
  color: #2563EB;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.info-item {
  border-bottom: 1px dashed #F3F4F6;
  padding-bottom: 8px;
}

.info-label {
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 4px;
}

.info-value {
  font-size: 14px;
  color: #374151;
}

.symptom-section {
  background: #F9FAFB;
  border-radius: 8px;
  padding: 12px;
  margin-top: 16px;
  border-left: 4px solid var(--primary-400);
}

.symptom-title {
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
  margin-bottom: 4px;
}

.symptom-desc {
  font-size: 13px;
  color: #6B7280;
  line-height: 1.5;
}

.reports-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.report-box {
  border-radius: 10px;
  padding: 16px;
  border: 1px solid #E5E7EB;
}

.ess-box {
  background: #F0Fdf4;
  border-color: #Bbf7d0;
}

.snore-box {
  background: #F7fee7;
  border-color: #E2fec7;
}

.report-box-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: #1F2937;
  margin-bottom: 12px;
}

.score-badge {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.score-badge.red {
  background: #FEE2E2;
  color: #EF4444;
}

.score-badge.green {
  background: #D1FAE5;
  color: #059669;
}

.risk-badge {
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.risk-badge.high {
  background: #FFE4E6;
  color: #E11D48;
}

.risk-badge.medium {
  background: #FEF3C7;
  color: #D97706;
}

.risk-badge.low {
  background: #D1FAE5;
  color: #059669;
}

.report-box-content {
  font-size: 13px;
  color: #4B5563;
  line-height: 1.6;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  background: rgba(255, 255, 255, 0.6);
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 10px;
}

.metric-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.metric-lbl {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 2px;
}

.metric-val {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.metric-desc {
  font-size: 12px;
  color: #6B7280;
}

.report-empty {
  padding: 14px;
  background: #F9FAFB;
  border: 1px dashed #D1D5DB;
  border-radius: 8px;
  text-align: center;
  font-size: 12px;
  color: #9CA3AF;
}

.form-body {
  display: flex;
  flex-direction: column;
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

.required {
  color: #EF4444;
}

.form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  box-sizing: border-box;
  font-size: 14px;
  color: #1F2937;
  outline: none;
  background-color: #FFF;
  transition: border-color 0.15s ease-in-out;
}
.form-control:focus {
  border-color: var(--primary-500);
}

.text-area {
  font-family: inherit;
  resize: vertical;
}

.select-ctrl {
  height: 38px;
  cursor: pointer;
}

.template-selector {
  margin-top: 4px;
}

.template-label {
  font-size: 11px;
  color: #6B7280;
}

.template-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.template-chip {
  background: #E5E7EB;
  color: #4B5563;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}
.template-chip:hover {
  background: var(--primary-100);
  color: var(--primary-600);
}

.info-alert {
  background-color: #EFF6FF;
  border-left: 4px solid var(--primary-500);
  color: #1E40AF;
  padding: 10px;
  font-size: 12px;
  border-radius: 0 6px 6px 0;
  margin-bottom: 16px;
  line-height: 1.5;
}

.adv-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--primary-600);
  min-width: 50px;
  text-align: right;
}

.card-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  border: 1px solid transparent;
  outline: none;
}

.btn-primary {
  background: var(--primary-500);
  color: #FFF;
}
.btn-primary:hover {
  background: var(--primary-600);
}
.btn-primary:disabled {
  background: var(--primary-200);
  cursor: not-allowed;
}

.btn-outline {
  background: transparent;
  border-color: #D1D5DB;
  color: #374151;
}
.btn-outline:hover {
  background: #F3F4F6;
  border-color: #9CA3AF;
}
</style>
