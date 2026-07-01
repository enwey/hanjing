<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { navigateToParent } from '@/utils/routeNavigation'

const router = useRouter()
const route = useRoute()
const apptId = route.params.id as string

const loading = ref(true)
const submitting = ref(false)
const savingOnly = ref(false)

// Data states
const appt = ref<any>({})
const essReport = ref<any>(null)
const snoreReport = ref<any>(null)

// EMR Form States
const diagnosis = ref('')
const prescription = ref('')
const doctorAdvice = ref('')
const note = ref('')
const medicalHistory = ref('')
const allergyHistory = ref('')

// Treatment Profile States (for new treatment creation)
const syncTreatment = ref(true)
const deviceProductId = ref('')
const deviceProducts = ref<any[]>([])
const initialAdvancement = ref(4.0)
const startDate = ref(new Date().toISOString().split('T')[0])
const nextAdjustDate = ref(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])

// Device Adjustments States (for existing active treatment adjustment)
const activeTreatment = ref<any>(null)
const syncAdjust = ref(true)
const adjustedAdvancement = ref(4.0)
const patientFeedback = ref('舒适度良好，无明显下颌酸痛或流涎')
const adjustInstructions = ref('')

// Historical EMRs States
const historyRecords = ref<any[]>([])
const historyDialogVisible = ref(false)
const selectedHistoryRecord = ref<any>(null)

const showHistoryDetail = (record: any) => {
  selectedHistoryRecord.value = record
  historyDialogVisible.value = true
}

const computedAvgWear = computed(() => {
  if (!activeTreatment.value || !activeTreatment.value.logs || activeTreatment.value.logs.length === 0) return '0'
  const total = activeTreatment.value.logs.reduce((sum: number, log: any) => sum + (log.wear_duration || 0), 0)
  return (total / activeTreatment.value.logs.length).toFixed(1)
})

const computedAvgComfort = computed(() => {
  if (!activeTreatment.value || !activeTreatment.value.logs || activeTreatment.value.logs.length === 0) return '0'
  const total = activeTreatment.value.logs.reduce((sum: number, log: any) => sum + (log.comfort || 0), 0)
  return (total / activeTreatment.value.logs.length).toFixed(1)
})

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
      
      // Load patient's medical history and allergy history from appointment data
      medicalHistory.value = appt.value.patient_medical_history || ''
      allergyHistory.value = appt.value.patient_allergy_history || ''
      
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

      // Fetch historical EMRs
      try {
        const historyRes: any = await request.get(`/api/admin/patients/${appt.value.patient_id}/medical-records`)
        if (historyRes.code === 200) {
          historyRecords.value = historyRes.data
        }
      } catch (e) {
        console.error('获取历史病历失败', e)
      }

      // Fetch active treatment profile
      try {
        const treatmentRes: any = await request.get(`/api/admin/patients/${appt.value.patient_id}/treatment`)
        if (treatmentRes.code === 200 && treatmentRes.data) {
          activeTreatment.value = treatmentRes.data
          // Set default value for adjustments based on the active treatment
          adjustedAdvancement.value = activeTreatment.value.current_advancement
        }
      } catch (e) {
        console.error('获取治疗建档信息失败', e)
      }

      // Fetch on-sale device products for treatment profile binding.
      try {
        const productRes: any = await request.get('/api/admin/products')
        if (productRes.code === 200) {
          deviceProducts.value = productRes.data.filter((item: any) => item.category === 'device' && item.status === 'on')
          if (!deviceProductId.value && deviceProducts.value.length) {
            deviceProductId.value = String(deviceProducts.value[0].id)
          }
        }
      } catch (e) {
        console.error('获取物理阻鼾器设备失败', e)
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

const buildConsultationPayload = (includeTreatment = true) => {
  const payload: any = {
    medical_record: {
      doctor_id: appt.value.doctor_id,
      store_id: appt.value.store_id,
      visit_date: new Date().toISOString().split('T')[0],
      diagnosis: diagnosis.value,
      prescription: prescription.value,
      doctor_advice: doctorAdvice.value,
      note: note.value,
      medical_history: medicalHistory.value,
      allergy_history: allergyHistory.value
    }
  }

  if (!includeTreatment) return payload

  if (activeTreatment.value && syncAdjust.value) {
    payload.treatment = { treatment_id: activeTreatment.value.id }
    payload.adjustment = {
      create: true,
      adjust_date: new Date().toISOString().split('T')[0],
      operator_id: appt.value.doctor_id,
      adjusted_advancement: adjustedAdvancement.value,
      patient_feedback: patientFeedback.value,
      instructions: adjustInstructions.value,
      next_adjust_date: nextAdjustDate.value
    }
    if (nextAdjustDate.value) {
      payload.follow_up = {
        create: true,
        doctor_id: appt.value.doctor_id,
        title: `阻鼾器参数微调 - 复查`,
        description: `已调至 ${adjustedAdvancement.value}mm (反馈: ${patientFeedback.value})，安排门诊复诊。`,
        due_date: nextAdjustDate.value
      }
    }
  } else if (!activeTreatment.value && syncTreatment.value) {
    const selectedDevice = deviceProducts.value.find(item => String(item.id) === String(deviceProductId.value))
    if (!selectedDevice) {
      throw new Error('请选择已上架的物理阻鼾器设备')
    }
    payload.treatment = {
      create: true,
      device_product_id: selectedDevice.id,
      initial_advancement: initialAdvancement.value,
      start_date: startDate.value
    }
    if (nextAdjustDate.value) {
      payload.follow_up = {
        create: true,
        doctor_id: appt.value.doctor_id,
        title: `阻鼾器物理微调 - 2周复查`,
        description: `初次配戴 ${selectedDevice.name} (初始前伸量 ${initialAdvancement.value}mm) 满两周，到店复查微调下颌前伸度。`,
        due_date: nextAdjustDate.value
      }
    }
  }

  return payload
}

const validateConsultationForm = () => {
  if (!diagnosis.value.trim()) {
    MessagePlugin.warning('请输入临床诊断结果')
    return false
  }
  return true
}

const handleSaveOnly = async () => {
  if (!validateConsultationForm()) return

  savingOnly.value = true
  try {
    const payload = buildConsultationPayload(false)
    const saveRes: any = await request.post(`/api/admin/appointments/${appt.value.id}/save-consultation`, {
      medical_record: payload.medical_record
    })

    if (saveRes.code === 200) {
      MessagePlugin.success('诊疗信息已保存，预约未结束')
    } else {
      MessagePlugin.error(saveRes.message || '保存诊疗信息失败')
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error(error instanceof Error ? error.message : '保存诊疗信息失败')
  } finally {
    savingOnly.value = false
  }
}

const handleSubmit = async () => {
  if (!validateConsultationForm()) return

  submitting.value = true
  try {
    const payload = buildConsultationPayload()
    const emrRes: any = await request.post(`/api/admin/appointments/${appt.value.id}/complete-consultation`, payload)

    if (emrRes.code === 200) {
      MessagePlugin.success('诊疗录入成功，患者已就诊完毕并完成建档！')
      navigateToParent(router, route, '/appointment')
    } else {
      MessagePlugin.error(emrRes.message || '诊疗录入失败')
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error(error instanceof Error ? error.message : '提交诊疗数据失败')
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
        <button class="btn btn-outline" @click="navigateToParent(router, route, '/appointment')">取消</button>
        <button class="btn btn-outline" :disabled="savingOnly || submitting" @click="handleSaveOnly">
          {{ savingOnly ? '保存中...' : '仅保存' }}
        </button>
        <button class="btn btn-primary" :disabled="submitting || savingOnly" @click="handleSubmit">
          {{ submitting ? '提交中...' : '保存并结束就诊' }}
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
            <div class="panel-title"><AppIcon name="user" />  就诊患者信息</div>
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
          <div class="symptom-section" style="margin-top: 12px;">
            <div class="symptom-title"><AppIcon name="message" />  患者主诉：</div>
            <div class="symptom-desc" style="margin-bottom: 12px;">{{ appt.symptom_desc || '无主诉描述' }}</div>
            
            <!-- Vitals Grid inside info card -->
            <div v-if="appt.pre_exam" style="border-top: 1px solid #E5E7EB; padding-top: 12px; margin-top: 12px;">
              <div class="symptom-title" style="margin-bottom: 8px;"><AppIcon name="stethoscope" />  预检体征数据：</div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                <div style="background: #FFF; padding: 6px 10px; border-radius: 6px; border: 1px solid #E5E7EB; text-align: center;">
                  <div style="font-size: 11px; color: #9CA3AF;">身高/体重</div>
                  <div style="font-size: 13px; font-weight: 700; color: #374151;">{{ appt.pre_exam.height }}cm / {{ appt.pre_exam.weight }}kg</div>
                </div>
                <div style="background: #FFF; padding: 6px 10px; border-radius: 6px; border: 1px solid #E5E7EB; text-align: center;">
                  <div style="font-size: 11px; color: #9CA3AF;">血压 (高/低)</div>
                  <div style="font-size: 13px; font-weight: 700; color: #374151;">{{ appt.pre_exam.systolic_bp || '--' }}/{{ appt.pre_exam.diastolic_bp || '--' }}</div>
                </div>
                <div style="background: #FFF; padding: 6px 10px; border-radius: 6px; border: 1px solid #E5E7EB; text-align: center;">
                  <div style="font-size: 11px; color: #9CA3AF;">颈围 / BMI</div>
                  <div style="font-size: 13px; font-weight: 700; color: #374151;">{{ appt.pre_exam.neck_circumference || '--' }}cm / <span style="color: var(--primary-600);">{{ appt.pre_exam.bmi || '--' }}</span></div>
                </div>
              </div>
            </div>
            <div v-else style="border-top: 1px dashed #D1D5DB; padding-top: 10px; font-size: 12px; color: #F59E0B;">
              <AppIcon name="alert" />  本次就诊暂无录入的身高、体重等预检体征数据。
            </div>
          </div>
        </div>

        <!-- Diagnostic Reports Card (ESS & Snore) -->
        <div class="panel report-card">
          <div class="panel-header">
            <div class="panel-title"><AppIcon name="chart" />  睡眠筛查与 AI 鼾声监测报告</div>
          </div>
          
          <div class="reports-container">
            <!-- Sleep ESS Score -->
            <div v-if="essReport" class="report-box ess-box">
              <div class="report-box-title">
                <span><AppIcon name="file-text" />  ESS 嗜睡量表结果</span>
                <span class="score-badge" :class="essReport.total_score >= 10 ? 'red' : 'green'">
                  {{ essReport.total_score }}分 ({{ essReport.risk_level }})
                </span>
              </div>
              <div class="report-box-content">
                <p>患者自我评估日间嗜睡度较正常偏高，需重点关注夜间睡眠低氧与憋气情况。</p>
              </div>
            </div>
            <div v-else class="report-empty">
              <span><AppIcon name="file-text" />  暂无本次就诊关联的在线 ESS 嗜睡量表评估结果</span>
            </div>

            <!-- Snore AI Analysis -->
            <div v-if="snoreReport" class="report-box snore-box">
              <div class="report-box-title">
                <span><AppIcon name="volume" />  AI 鼾声录音分析报告</span>
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
              <span><AppIcon name="volume" />  暂无本次就诊关联的 AI 鼾声监测音频分析数据</span>
            </div>
          </div>
        </div>

        <!-- 阻鼾器治疗监测 (已建档患者可见) -->
        <div v-if="activeTreatment" class="panel treatment-monitor-card" style="margin-top: 16px;">
          <div class="panel-header">
            <div class="panel-title"><AppIcon name="settings" />  物理阻鼾治疗监测 (进行中)</div>
          </div>
          <div class="panel-body" style="padding: 14px; font-size: 13px; color: #4B5563;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; background: #EFF6FF; padding: 10px; border-radius: 6px; border: 1px solid #BFDBFE;">
              <div>设备型号: <strong>{{ activeTreatment.device_model }}</strong></div>
              <div>当前前伸量: <strong style="color: var(--primary-600);">{{ activeTreatment.current_advancement }} mm</strong></div>
              <div style="grid-column: span 2;">治疗启动: {{ activeTreatment.start_date.substring(0, 10) }}</div>
            </div>
            
            <!-- Average Wear Compliance -->
            <div v-if="activeTreatment.logs && activeTreatment.logs.length > 0" style="margin-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6B7280; margin-bottom: 4px;">
                <span><AppIcon name="chart" />  近30日平均佩戴时长</span>
                <span style="font-weight: 700; color: #16A34A;">{{ computedAvgWear }} 小时</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6B7280; margin-bottom: 4px;">
                <span><AppIcon name="smile" />  近30日均值舒适评分</span>
                <span style="font-weight: 700; color: #F59E0B;">{{ computedAvgComfort }} / 5 分</span>
              </div>
            </div>
            
            <!-- Previous Adjustments Timeline -->
            <div v-if="activeTreatment.adjustments && activeTreatment.adjustments.length > 0">
              <div style="font-weight: 600; font-size: 12px; color: #374151; margin-bottom: 6px;"><AppIcon name="clipboard" />  历史微调记录 (近3次)：</div>
              <div style="display: flex; flex-direction: column; gap: 6px; max-height: 120px; overflow-y: auto;">
                <div v-for="adj in activeTreatment.adjustments.slice(0, 3)" :key="adj.id" style="font-size: 11px; background: #F9FAFB; padding: 6px; border: 1px solid #E5E7EB; border-radius: 4px;">
                  <span style="font-weight: 600; color: #1F2937;">{{ adj.adjust_date.substring(0, 10) }}</span> · 调至 <strong>{{ adj.adjusted_advancement }}mm</strong> (反馈: {{ adj.patient_feedback || '无' }})
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 历史就诊病历 Panel -->
        <div class="panel history-card" style="margin-top: 16px;">
          <div class="panel-header">
            <div class="panel-title"><AppIcon name="book" />  历史就诊病历 ({{ historyRecords.length }}次)</div>
          </div>
          <div class="panel-body" style="padding: 12px; max-height: 240px; overflow-y: auto;">
            <div v-for="r in historyRecords" :key="r.id" class="history-item" style="padding: 10px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; margin-bottom: 8px; cursor: pointer;" @click="showHistoryDetail(r)">
              <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6B7280; margin-bottom: 4px;">
                <span><AppIcon name="calendar" />  {{ r.visit_date }}</span>
                <span><AppIcon name="doctor" />  {{ r.doctor_name }}</span>
              </div>
              <div style="font-size: 13px; font-weight: 600; color: #1F2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                诊断: {{ r.diagnosis }}
              </div>
            </div>
            <div v-if="historyRecords.length === 0" style="text-align: center; color: #9CA3AF; padding: 20px; font-size: 12px;">
              暂无历史就诊病历记录
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Medical Record Form & Treatment Profiling -->
      <div class="column-right">
        <!-- Clinic Form Panel -->
        <div class="panel form-panel">
          <div class="panel-header">
            <div class="panel-title"><AppIcon name="pen-square" />  电子病历信息录入</div>
          </div>
          
          <div class="form-body">
            <!-- Patient Archive History -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed #E5E7EB;">
              <div class="form-group">
                <label class="form-label">既往病史 (更新至档案)</label>
                <input 
                  v-model="medicalHistory" 
                  type="text" 
                  class="form-control" 
                  placeholder="如：高血压（5年）、2型糖尿病"
                >
              </div>
              <div class="form-group">
                <label class="form-label">过敏史 (更新至档案)</label>
                <input 
                  v-model="allergyHistory" 
                  type="text" 
                  class="form-control" 
                  placeholder="如：青霉素过敏，或无过敏史"
                >
              </div>
            </div>

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
                <span class="template-label"><AppIcon name="lightbulb" />  快速诊断模板：</span>
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
                <span class="template-label"><AppIcon name="lightbulb" />  方案模板：</span>
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
                <span class="template-label"><AppIcon name="lightbulb" />  常用医嘱：</span>
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

        <!-- Treatment Record Sync (已建档患者微调 / 未建档患者建档) -->
        <div class="panel treatment-panel">
          <!-- CASE 1: Patient already has active treatment. We support parameter adjustment! -->
          <template v-if="activeTreatment">
            <div class="panel-header">
              <div class="panel-title flex-row">
                <input 
                  id="sync-adjust" 
                  v-model="syncAdjust" 
                  type="checkbox" 
                  class="checkbox-ctrl"
                >
                <label for="sync-adjust" class="checkbox-label font-bold">
                  <AppIcon name="tool" />  同步记录物理阻鼾器参数微调 (复诊)
                </label>
              </div>
            </div>

            <div v-show="syncAdjust" class="treatment-form-body" style="padding: 16px;">
              <div class="info-alert" style="margin-bottom: 12px;">
                <AppIcon name="lightbulb" />  记录此复诊微调后，系统将更新患者当前阻鼾器的前伸调节量，并添加微调历史记录。
              </div>

              <div class="card-grid-2">
                <div class="form-group">
                  <label class="form-label">当前下颌前移量</label>
                  <input type="text" class="form-control" :value="activeTreatment.current_advancement + ' mm'" disabled style="background-color: #F3F4F6;">
                </div>

                <div class="form-group">
                  <label class="form-label">微调后下颌前伸量 (mm)</label>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <input 
                      v-model="adjustedAdvancement" 
                      type="range" 
                      min="0" 
                      max="10" 
                      step="0.5" 
                      style="flex: 1;"
                    >
                    <span class="adv-value">{{ adjustedAdvancement }} mm</span>
                  </div>
                </div>

                <div class="form-group" style="grid-column: span 2;">
                  <label class="form-label">本次配戴后患者反馈</label>
                  <select v-model="patientFeedback" class="form-control select-ctrl">
                    <option value="舒适度良好，无明显下颌酸痛或流涎">舒适度良好，无明显下颌酸痛或流涎</option>
                    <option value="轻微流涎与下颌微酸，配戴2小时后缓解">轻微流涎与下颌微酸，配戴2小时后缓解</option>
                    <option value="关节酸痛明显，早晨醒来无法完全咬合">关节酸痛明显，早晨醒来无法完全咬合</option>
                    <option value="舒适，睡眠呼吸改善，晨起无不适">舒适，睡眠呼吸改善，晨起无不适</option>
                    <option value="自定义反馈（手动填写）">自定义反馈（见下方微调说明）</option>
                  </select>
                </div>

                <div class="form-group" style="grid-column: span 2;">
                  <label class="form-label">微调操作建议/说明 (选填)</label>
                  <textarea 
                    v-model="adjustInstructions" 
                    class="form-control text-area" 
                    placeholder="请输入微调建议或操作指令，例如：增加0.5mm以改善打鼾症状..."
                    rows="2"
                  ></textarea>
                </div>

                <div class="form-group" style="grid-column: span 2;">
                  <label class="form-label">计划下一次复查/微调日期</label>
                  <input 
                    v-model="nextAdjustDate" 
                    type="date" 
                    class="form-control"
                  >
                </div>
              </div>
            </div>
          </template>

          <!-- CASE 2: Patient has NO active treatment. We support initial profiling! -->
          <template v-else>
            <div class="panel-header">
              <div class="panel-title flex-row">
                <input 
                  id="sync-treatment" 
                  v-model="syncTreatment" 
                  type="checkbox" 
                  class="checkbox-ctrl"
                >
                <label for="sync-treatment" class="checkbox-label font-bold">
                  <AppIcon name="tool" /> 同步建立/更新物理阻鼾治疗档案
                </label>
              </div>
            </div>

            <div v-show="syncTreatment" class="treatment-form-body" style="padding: 16px;">
              <div class="info-alert" style="margin-bottom: 12px;">
                <AppIcon name="lightbulb" /> 开启此项后，系统将自动为该患者建立物理阻鼾随访档案，以记录设备的日常佩戴打卡日志与物理调节量。
              </div>

              <div class="card-grid-2">
	                <div class="form-group">
	                  <label class="form-label">绑定物理阻鼾器设备</label>
	                  <select v-model="deviceProductId" class="form-control select-ctrl">
	                    <option value="" disabled>请选择商品管理中的上架设备</option>
	                    <option v-for="device in deviceProducts" :key="device.id" :value="String(device.id)">
	                      {{ device.name }}
	                    </option>
	                  </select>
	                  <div v-if="!deviceProducts.length" class="form-hint danger">商品管理中暂无已上架的物理阻鼾器设备，请先到商品管理新增或上架设备。</div>
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
          </template>
        </div>
      </div>
    </div>

    <!-- 历史电子病历详情查看弹窗 -->
    <t-dialog
      v-model:visible="historyDialogVisible"
      header="历史门诊病历详情"
      width="600px"
      :footer="null"
    >
      <div v-if="selectedHistoryRecord" class="record-detail-modal" style="padding: 10px 0; font-size: 14px; color: #374151; line-height: 1.6;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #E5E7EB;">
          <div><strong>就诊时间:</strong> {{ selectedHistoryRecord.visit_date }}</div>
          <div><strong>就诊门店:</strong> {{ selectedHistoryRecord.store_name }}</div>
          <div><strong>接诊医生:</strong> {{ selectedHistoryRecord.doctor_name }} ({{ selectedHistoryRecord.doctor_title || '主任医师' }})</div>
          <div><strong>就诊科室:</strong> 睡眠呼吸科</div>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;"><AppIcon name="stethoscope" /> 临床诊断：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; border-left: 4px solid var(--primary-500); white-space: pre-wrap;">
            {{ selectedHistoryRecord.diagnosis }}
          </div>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;"><AppIcon name="pill" /> 治疗方案 / 处方：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; border-left: 4px solid var(--success-500); white-space: pre-wrap;">
            {{ selectedHistoryRecord.prescription || '未开具处方' }}
          </div>
        </div>
        <div style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;"><AppIcon name="megaphone" /> 医嘱建议：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; border-left: 4px solid #F59E0B; white-space: pre-wrap;">
            {{ selectedHistoryRecord.doctor_advice || '无' }}
          </div>
        </div>
        <div v-if="selectedHistoryRecord.note" style="margin-bottom: 16px;">
          <div style="font-weight: 700; color: #111827; margin-bottom: 6px;"><AppIcon name="file-text" /> 备注：</div>
          <div style="background: #F9FAFB; padding: 12px; border-radius: 8px; color: #6B7280; white-space: pre-wrap;">
            {{ selectedHistoryRecord.note }}
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
          <t-button theme="default" @click="historyDialogVisible = false">关闭</t-button>
        </div>
      </div>
    </t-dialog>
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

.form-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: #6B7280;
}
.form-hint.danger {
  color: #DC2626;
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
