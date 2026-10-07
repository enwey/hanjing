<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ data: any }>()
const patient = computed(() => props.data.patient || {})
const visit = computed(() => props.data.appointment || {})
const record = computed(() => props.data.medical_record || {})
const date = (v: any) => v ? String(v).slice(0, 10) : '未记录'
const gender = (v: any) => ({ '1': '男', '2': '女', male: '男', female: '女', 男: '男', 女: '女' } as any)[v] || '未记录'
const show = (v: any) => v === null || v === undefined || v === '' ? '未记录' : String(v)
const avg = (logs: any[], key: string) => logs?.length ? (logs.reduce((s, r) => s + Number(r[key] || 0), 0) / logs.length).toFixed(1) : '未记录'
function attachments(value: any) {
  try { const result = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(result) ? result : [] } catch { return [] }
}
function attachmentUrl(item: any) {
  const url = typeof item === 'string' ? item : item.url || item.file_url || ''
  return /^(https?:\/\/|\/(?!\/))/.test(url) ? url : ''
}
</script>

<template>
  <div class="clinical-details">
    <div v-if="!data.medical_record" class="missing">此履约单尚未明确关联看诊记录。下方历史病历供查阅，不作为本单治疗方案。</div>
    <div class="clinical-grid">
      <div>
        <section class="card">
          <h3>就诊患者信息</h3>
          <dl class="fields">
            <div><dt>姓名 / 病历号</dt><dd>{{ show(patient.name) }} / {{ show(patient.patient_no) }}</dd></div>
            <div><dt>性别 / 年龄</dt><dd>{{ gender(patient.gender) }} / {{ show(patient.age) }} 岁</dd></div>
            <div><dt>联系电话</dt><dd>{{ show(patient.phone) }}</dd></div>
            <div><dt>接诊医生</dt><dd>{{ show(record.doctor_name) }} {{ record.doctor_title || '' }}</dd></div>
            <div><dt>就诊科室</dt><dd>睡眠呼吸科</dd></div>
            <div><dt>就诊门店</dt><dd>{{ show(record.store_name) }}</dd></div>
            <div><dt>就诊日期</dt><dd>{{ date(record.visit_date) }}</dd></div>
            <div><dt>预约编号</dt><dd>{{ show(visit.appointment_no) }}</dd></div>
            <div><dt>挂号时间</dt><dd>{{ date(visit.appointment_date) }} {{ visit.appointment_time || '' }}</dd></div>
          </dl>
          <h4>患者主诉</h4><p>{{ show(visit.symptom_desc) }}</p>
          <h4>预检体征数据</h4>
          <dl v-if="data.pre_exam" class="fields">
            <div><dt>身高 / 体重</dt><dd>{{ show(data.pre_exam.height) }} cm / {{ show(data.pre_exam.weight) }} kg</dd></div>
            <div><dt>血压（高 / 低）</dt><dd>{{ show(data.pre_exam.systolic_bp) }} / {{ show(data.pre_exam.diastolic_bp) }} mmHg</dd></div>
            <div><dt>颈围</dt><dd>{{ show(data.pre_exam.neck_circumference) }} cm</dd></div>
            <div><dt>BMI</dt><dd>{{ show(data.pre_exam.bmi) }}</dd></div>
          </dl><p v-else class="muted">本次就诊未记录预检体征</p>
        </section>
        <section class="card">
          <h3>睡眠筛查与 AI 鼾声监测报告</h3>
          <h4>ESS 嗜睡量表</h4>
          <p v-if="data.ess_report">{{ data.ess_report.total_score }} 分 · {{ data.ess_report.risk_level }} · {{ date(data.ess_report.created_at) }}</p>
          <p v-else class="muted">本次就诊未关联 ESS 评估</p>
          <h4>AI 鼾声分析</h4>
          <dl v-if="data.snore_report" class="fields">
            <div><dt>风险等级</dt><dd>{{ ({high:'高风险',medium:'中风险',low:'低风险'} as any)[data.snore_report.risk_level] || show(data.snore_report.risk_level) }}</dd></div>
            <div><dt>录音时长</dt><dd>{{ (data.snore_report.duration / 60).toFixed(1) }} 分钟</dd></div>
            <div><dt>平均 / 峰值分贝</dt><dd>{{ data.snore_report.avg_decibel }} / {{ data.snore_report.peak_decibel }} dB</dd></div>
            <div><dt>鼾声占比</dt><dd>{{ data.snore_report.snore_rate }}%</dd></div>
            <div><dt>疑似呼吸暂停</dt><dd>{{ data.snore_report.apnea_events }} 次</dd></div>
          </dl><p v-else class="muted">本次就诊未关联鼾声分析</p>
        </section>
        <section class="card">
          <h3>历史就诊病历</h3>
          <details v-for="r in data.history_records" :key="r.id">
            <summary>{{ date(r.visit_date) }} · {{ r.doctor_name }} · {{ r.store_name }}</summary>
            <h4>临床诊断</h4><p>{{ show(r.diagnosis) }}</p>
            <h4>治疗处方 / 方案</h4><p>{{ show(r.prescription) }}</p>
            <h4>医嘱与日常健康指导</h4><p>{{ show(r.doctor_advice) }}</p>
            <h4>病历备注</h4><p>{{ show(r.note) }}</p>
          </details><p v-if="!data.history_records?.length" class="muted">暂无历史病历</p>
        </section>
      </div>
      <div>
        <section class="card">
          <h3>电子病历信息</h3>
          <h4>既往史</h4><p>{{ show(patient.medical_history) }}</p>
          <h4>过敏史</h4><p>{{ show(patient.allergy_history) }}</p>
          <h4>临床诊断</h4><p>{{ show(record.diagnosis) }}</p>
          <h4>治疗处方 / 方案</h4><p class="prescription">{{ show(record.prescription) }}</p>
          <h4>医嘱与日常健康指导</h4><p>{{ show(record.doctor_advice) }}</p>
          <h4>病历备注</h4><p>{{ show(record.note) }}</p>
          <h4>病历附件</h4>
          <template v-for="(file, i) in attachments(record.attachments)" :key="i"><a v-if="attachmentUrl(file)" :href="attachmentUrl(file)" target="_blank" rel="noopener noreferrer">{{ file.name || file.file_name || '附件 ' + (i + 1) }}</a></template>
          <p v-if="!attachments(record.attachments).length" class="muted">无附件</p>
        </section>
        <section class="card">
          <h3>物理阻鼾治疗档案</h3>
          <div v-for="t in data.treatments" :key="t.id" class="treatment">
            <h4>绑定物理阻鼾器设备</h4>
            <p class="device-name">{{ t.device_product_name || t.device_model || '未绑定' }}</p>
            <dl class="fields">
              <div><dt>患者设备档案编号</dt><dd>{{ show(t.patient_device_id) }}</dd></div>
              <div><dt>初始下颌前移量</dt><dd class="parameter">{{ show(t.initial_advancement) }} mm</dd></div>
              <div><dt>当前下颌前移量</dt><dd>{{ show(t.current_advancement) }} mm</dd></div>
              <div><dt>初配戴 / 治疗启动日期</dt><dd>{{ date(t.start_date) }}</dd></div>
              <div><dt>计划下次微调复诊日期</dt><dd>{{ date(t.next_adjust_date || t.patient_device?.next_adjust_date) }}</dd></div>
              <div><dt>设备绑定日期</dt><dd>{{ date(t.patient_device?.bound_at) }}</dd></div>
              <div><dt>近 30 条平均佩戴时长</dt><dd>{{ avg(t.logs, 'wear_duration') }} 小时</dd></div>
              <div><dt>平均舒适评分</dt><dd>{{ avg(t.logs, 'comfort') }} / 5</dd></div>
            </dl>
            <h4>物理阻鼾器参数微调</h4>
            <div v-for="a in t.adjustments" :key="a.id" class="adjustment">
              <b>{{ date(a.adjust_date) }} · {{ a.operator_name || '未记录医生' }}<span v-if="a.medical_record_id === record.id"> · 本次看诊</span></b>
              <p>微调后下颌前伸量：{{ show(a.adjusted_advancement) }} mm</p>
              <p>本次配戴后患者反馈：{{ show(a.patient_feedback) }}</p>
              <p>微调操作建议 / 说明：{{ show(a.instructions) }}</p>
            </div><p v-if="!t.adjustments?.length" class="muted">暂无微调记录</p>
          </div><p v-if="!data.treatments?.length" class="muted">本次看诊没有关联的物理阻鼾治疗档案</p>
        </section>
        <section class="card">
          <h3>患者复查 / 随访计划</h3>
          <div v-for="(f, i) in data.follow_ups" :key="i" class="adjustment"><b>{{ date(f.due_date) }} · {{ f.title }}</b><p>{{ show(f.description) }}</p></div>
          <p v-if="!data.follow_ups?.length" class="muted">暂无复查 / 随访计划</p>
        </section>
      </div>
    </div>
    <section class="card">
      <h3>本单收费商品清单</h3>
      <div class="table-scroll"><table><thead><tr><th>商品名称</th><th>数量</th><th>单价</th></tr></thead><tbody>
        <tr v-for="(item, i) in data.items" :key="i"><td>{{ item.product_name }}</td><td>{{ item.quantity }}</td><td>¥{{ (item.price / 100).toFixed(2) }}</td></tr>
      </tbody></table></div>
    </section>
  </div>
</template>

<style scoped>
.clinical-details{max-height:75vh;overflow:auto;padding:4px 8px;color:#374151;font-size:13px}
.clinical-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px}
.card{border:1px solid #e5e7eb;border-radius:8px;margin-bottom:16px;padding:16px;background:#fff}
h3{font-size:15px;color:#111827;margin:0 0 14px;padding-bottom:10px;border-bottom:1px solid #eef2f7}
h4{font-size:12px;margin:14px 0 6px;color:#6b7280}
p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}
.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0}
dt{color:#9ca3af;font-size:11px;margin-bottom:4px}dd{margin:0;overflow-wrap:anywhere}
.prescription,.device-name{background:#eff6ff;border-radius:6px;padding:10px;color:#1e40af}
.parameter{font-size:20px;color:#2563eb;font-weight:700}.muted{color:#9ca3af}
.adjustment,details{background:#f9fafb;border:1px solid #eef2f7;border-radius:6px;padding:10px;margin-top:8px}
summary{cursor:pointer;font-weight:600}a{display:block;margin:6px 0;color:#2563eb}
.missing{padding:12px;border-radius:6px;background:#fffbeb;color:#92400e;margin-bottom:14px}
.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;text-align:left;border-bottom:1px solid #eef2f7}th{background:#f9fafb}
.treatment+.treatment{border-top:1px solid #e5e7eb;margin-top:16px}
@media(max-width:800px){.clinical-grid{grid-template-columns:1fr}}
</style>
