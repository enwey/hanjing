<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()
const searchKeyword = ref('')
const filterGender = ref('')
const filterLevel = ref('')
const detailVisible = ref(false)
const detailTab = ref('info')
const selectedPatient = ref<any>(null)

const createVisible = ref(false)
const createForm = ref({
  name: '',
  phone: '',
  gender: '男',
  age: 30,
  level: '普通',
  source: '小程序',
  tagsInput: '',
  medicalHistoryInput: ''
})

const levelSelectOptions = [
  { label: '普通', value: '普通' },
  { label: 'VIP', value: 'VIP' },
  { label: 'SVIP', value: 'SVIP' }
]

const sourceSelectOptions = [
  { label: '小程序', value: '小程序' },
  { label: '分销', value: '分销' },
  { label: '转介绍', value: '转介绍' },
  { label: '门店', value: '门店' },
  { label: '直播', value: '直播' }
]

function openCreate() {
  createForm.value = {
    name: '',
    phone: '',
    gender: '男',
    age: 30,
    level: '普通',
    source: '小程序',
    tagsInput: '',
    medicalHistoryInput: ''
  }
  createVisible.value = true
}

function handleCreate() {
  if (!createForm.value.name.trim()) {
    MessagePlugin.warning('请填写患者姓名')
    return
  }
  if (!createForm.value.phone.trim()) {
    MessagePlugin.warning('请填写患者手机号')
    return
  }
  
  const ageVal = parseInt(createForm.value.age as any) || 0
  const tags = createForm.value.tagsInput
    ? createForm.value.tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean)
    : []
  const medicalHistory = createForm.value.medicalHistoryInput
    ? createForm.value.medicalHistoryInput.split(/[,，]/).map(h => h.trim()).filter(Boolean)
    : []

  const nextId = String(patients.value.length + 1)
  const nextNo = `P2024${String(nextId).padStart(4, '0')}`

  const newPatient: Patient = {
    id: nextId,
    no: nextNo,
    name: createForm.value.name.trim(),
    phone: createForm.value.phone.trim(),
    gender: createForm.value.gender,
    age: ageVal,
    level: createForm.value.level,
    lastVisit: '暂无',
    totalVisits: 0,
    totalSpent: 0,
    source: createForm.value.source,
    status: 'active',
    tags,
    medicalHistory,
    records: []
  }

  patients.value.unshift(newPatient)
  createVisible.value = false
  MessagePlugin.success(`手动建档成功，病历号为 ${nextNo}`)
}

interface Record {
  date: string; doctor: string; type: string; diagnosis: string; treatment: string
}
interface Patient {
  id: string; no: string; name: string; phone: string; gender: string; age: number
  level: string; lastVisit: string; totalVisits: number; totalSpent: number; source: string
  status: string; tags: string[]
  medicalHistory: string[]
  records: Record[]
}

const currentPage = ref(1)
const pageSize = ref(30)

const initialPatients: Patient[] = [
  {
    id: '1', no: 'P20240001', name: '张建国', phone: '138****8888', gender: '男', age: 52,
    level: 'VIP', lastVisit: '2026-06-04', totalVisits: 12, totalSpent: 48500, source: '小程序',
    status: 'active', tags: ['重度打鼾', 'OSA确诊'],
    medicalHistory: ['高血压（5年）', '2型糖尿病', '阻塞性睡眠呼吸暂停（中重度 AHI 38）'],
    records: [
      { date: '2026-06-04', doctor: '李明辉', type: '复诊', diagnosis: '佩戴3个月，AHI降至12', treatment: '继续使用定制阻鼾器·舒适型' },
      { date: '2026-03-01', doctor: '李明辉', type: '复诊', diagnosis: '初戴适应良好，AHI降至22', treatment: '调整阻鼾器微调' },
      { date: '2025-12-15', doctor: '李明辉', type: '初诊', diagnosis: 'OSA中重度，AHI 38，建议定制阻鼾器', treatment: '定制阻鼾器·舒适型' },
    ]
  },
  {
    id: '2', no: 'P20240002', name: '李美玲', phone: '139****9999', gender: '女', age: 38,
    level: '普通', lastVisit: '2026-06-03', totalVisits: 5, totalSpent: 15800, source: '分销',
    status: 'active', tags: ['轻度打鼾', '孕期'],
    medicalHistory: ['轻度打鼾（孕期加重）', '无其他基础疾病'],
    records: [
      { date: '2026-06-03', doctor: '王芳', type: '复诊', diagnosis: '佩戴1个月，鼾声明显减轻', treatment: '继续使用定制阻鼾器·标准型' },
      { date: '2026-05-02', doctor: '王芳', type: '初诊', diagnosis: '轻度打鼾，AHI 12', treatment: '定制阻鼾器·标准型' },
    ]
  },
  {
    id: '3', no: 'P20240003', name: '王强', phone: '136****7777', gender: '男', age: 45,
    level: 'SVIP', lastVisit: '2026-06-02', totalVisits: 18, totalSpent: 73200, source: '门店',
    status: 'active', tags: ['重度打鼾', 'CPAP不耐受'],
    medicalHistory: ['重度OSA（AHI 52）', 'CPAP不耐受', '高血脂'],
    records: [
      { date: '2026-06-02', doctor: '张伟', type: '复诊', diagnosis: 'AHI降至15，耐受良好', treatment: '维持当前治疗方案' },
      { date: '2026-01-10', doctor: '张伟', type: '复诊', diagnosis: '更换至舒适型，适应期2周', treatment: '定制阻鼾器·舒适型' },
      { date: '2025-08-20', doctor: '张伟', type: '初诊', diagnosis: '重度OSA，CPAP不耐受', treatment: '定制阻鼾器·标准型' },
    ]
  },
  {
    id: '4', no: 'P20240004', name: '赵敏', phone: '137****6666', gender: '女', age: 29,
    level: '普通', lastVisit: '2026-05-28', totalVisits: 3, totalSpent: 4980, source: '小程序',
    status: 'active', tags: ['偶发打鼾', '睡眠监测'],
    medicalHistory: ['偶发打鼾', '失眠（轻度）'],
    records: [
      { date: '2026-05-28', doctor: '陈思雨', type: '初诊', diagnosis: '偶发打鼾，AHI 8，不属于OSA', treatment: '睡眠监测服务 + 行为干预指导' },
    ]
  },
  {
    id: '5', no: 'P20240005', name: '陈大明', phone: '135****5555', gender: '男', age: 61,
    level: 'VIP', lastVisit: '2026-04-15', totalVisits: 8, totalSpent: 29600, source: '转介绍',
    status: 'inactive', tags: ['OSA术后', '随访'],
    medicalHistory: ['OSA（术后）', '冠心病', '高血压'],
    records: [
      { date: '2026-04-15', doctor: '李明辉', type: '复诊', diagnosis: '术后3个月复查，AHI 6', treatment: '定期随访，暂时无需干预' },
      { date: '2025-11-20', doctor: '李明辉', type: '术后随访', diagnosis: '悬雍垂腭咽成形术后1个月', treatment: '术后恢复指导' },
    ]
  },
  {
    id: '6', no: 'P20240006', name: '刘芳芳', phone: '133****4444', gender: '女', age: 42,
    level: '普通', lastVisit: '2026-06-05', totalVisits: 2, totalSpent: 3980, source: '直播',
    status: 'active', tags: ['新患者', '鼾声评估'],
    medicalHistory: ['自述鼾声影响伴侣', '无确诊'],
    records: [
      { date: '2026-06-05', doctor: '王芳', type: '初诊', diagnosis: '等待睡眠监测结果', treatment: 'AI鼾声分析 + 睡眠监测预约' },
    ]
  },
]

const patients = ref<Patient[]>([])

const fetchPatients = async () => {
  try {
    const res: any = await request.get('/api/admin/patients')
    patients.value = res.data.map((item: any) => {
      const levelMap: Record<string, string> = {
        normal: '普通',
        silver: 'VIP',
        gold: 'VIP',
        diamond: 'SVIP'
      }
      return {
        id: item.id.toString(),
        no: `P2026${String(item.id).padStart(4, '0')}`,
        name: item.name,
        phone: item.phone || item.user_phone || '未绑定',
        gender: item.gender === 1 ? '男' : '女',
        age: item.age || 30,
        level: levelMap[item.member_level] || '普通',
        lastVisit: item.visit_count > 0 ? '2026-05-29' : '暂无',
        totalVisits: item.visit_count || 0,
        totalSpent: (item.total_spent || 0) / 100, // Format to yuan
        source: item.source === 'walk_in' ? '门店' : '小程序',
        status: 'active',
        tags: item.has_snore === 1 ? ['有鼾症记录'] : [],
        medicalHistory: item.has_snore === 1 ? ['自建档鼾症历史'] : [],
        records: []
      }
    })
  } catch (error) {
    console.error('Failed to load patients:', error)
  }
}

onMounted(() => {
  fetchPatients()
})

const genderOptions = [
  { label: '全部性别', value: '' },
  { label: '男', value: '男' },
  { label: '女', value: '女' },
]
const levelOptions = [
  { label: '全部等级', value: '' },
  { label: 'SVIP', value: 'SVIP' },
  { label: 'VIP', value: 'VIP' },
  { label: '普通', value: '普通' },
]

const filteredPatients = computed(() => {
  let list = patients.value
  if (filterGender.value) list = list.filter(p => p.gender === filterGender.value)
  if (filterLevel.value) list = list.filter(p => p.level === filterLevel.value)
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(p => p.name.includes(kw) || p.no.toLowerCase().includes(kw) || p.phone.includes(kw))
  }
  return list
})

watch([searchKeyword, filterGender, filterLevel], () => {
  currentPage.value = 1
})

const paginatedPatients = computed(() => {
  const filtered = filteredPatients.value
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
})

function openDetail(patient: Patient) {
  router.push(`/patient/detail/${patient.id}`)
}

function getAvatarColor(name: string) {
  const colors = ['#3B6BF5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function getSourceStyle(source: string) {
  if (source === '小程序') return { fontSize: '11px', color: '#10B981', background: '#ECFDF5', padding: '2px 6px', borderRadius: '4px' }
  if (source === '分销') return { fontSize: '11px', color: '#F59E0B', background: '#FFFBEB', padding: '2px 6px', borderRadius: '4px' }
  if (source === '转介绍') return { fontSize: '11px', color: '#3B6BF5', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px' }
  return { fontSize: '11px', color: '#6B7280', background: '#F3F4F6', padding: '2px 6px', borderRadius: '4px' }
}

const levelTheme: Record<string, string> = { SVIP: 'danger', VIP: 'warning', '普通': 'default' }
const statusMap: Record<string, { label: string; theme: string }> = {
  active: { label: '活跃', theme: 'success' },
  inactive: { label: '失活', theme: 'default' },
}
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">患者管理</div>
        <div class="page-title-sub">2,847 位注册患者</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <t-button variant="outline">📥 导出</t-button>
        <t-button theme="primary" @click="openCreate">➕ 手动建档</t-button>
      </div>
    </div>

    <!-- Panel Wrapper -->
    <div class="panel">
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <t-input v-model="searchKeyword" placeholder="搜索姓名/编号/手机号" clearable style="width:220px" />
          <t-select v-model="filterGender" :options="genderOptions" style="width:120px" />
          <t-select v-model="filterLevel" :options="levelOptions" style="width:120px" />
        </div>
        <div style="font-size:13px;color:#9CA3AF;font-weight:400;">
          共 {{ filteredPatients.length }} 人
        </div>
      </div>

      <!-- 患者表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="width: 120px;">病历号</th>
              <th style="min-width: 220px;">患者信息</th>
              <th style="width: 80px;">等级</th>
              <th style="width: 150px;">标签</th>
              <th style="width: 100px;">就诊次数</th>
              <th style="width: 110px;">最近就诊</th>
              <th style="width: 120px;">消费总额</th>
              <th style="width: 100px;">来源</th>
              <th style="width: 150px; min-width: 150px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedPatients" :key="row.id" @click="openDetail(row)" style="cursor: pointer;">
              <td style="font-family: monospace; font-weight: 600; color: var(--primary-500);">{{ row.no }}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;" @click.stop>
                  <div :style="{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: getAvatarColor(row.name),
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    flexShrink: 0
                  }">{{ row.name.substring(0, 1) }}</div>
                  <div>
                    <div style="font-weight:600;color:#1F2937;">{{ row.name }}</div>
                    <div style="font-size:11px;color:#9CA3AF;">{{ row.gender }} · {{ row.age }}岁 · {{ row.phone }}</div>
                  </div>
                </div>
              </td>
              <td>
                <t-tag :theme="levelTheme[row.level] || 'default'" size="small" variant="light">{{ row.level }}</t-tag>
              </td>
              <td>
                <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                  <t-tag v-for="tag in row.tags" :key="tag" size="small" variant="outline">{{ tag }}</t-tag>
                </div>
              </td>
              <td style="font-weight:600;">{{ row.totalVisits }}次</td>
              <td style="font-size:12px;color:#9CA3AF;">{{ row.lastVisit }}</td>
              <td style="font-weight:600;color:#1F2937">¥{{ row.totalSpent.toLocaleString() }}</td>
              <td>
                <span :style="getSourceStyle(row.source)">{{ row.source }}</span>
              </td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;" @click.stop>
                  <button class="btn btn-xs btn-outline" @click="openDetail(row)">详情</button>
                  <button class="btn btn-xs btn-outline" @click="router.push('/patient/followup/' + row.id)">随访</button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedPatients.length === 0">
              <td colspan="9" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无匹配的患者数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredPatients.length"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>

    <!-- 详情抽屉 -->
    <t-drawer
      v-model:visible="detailVisible"
      :header="selectedPatient?.name + ' - 患者详情'"
      size="560px"
      :footer="false"
    >
      <div v-if="selectedPatient">
        <!-- 基本信息 -->
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #F3F4F6">
          <t-avatar size="64px" :style="{ background: 'linear-gradient(135deg, #3B6BF5, #8EAFFF)', fontSize:'24px' }">
            {{ selectedPatient.name.slice(0, 1) }}
          </t-avatar>
          <div>
            <div style="font-size:18px;font-weight:700">{{ selectedPatient.name }}</div>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 4px;">
              <t-tag :theme="levelTheme[selectedPatient.level]" size="small" variant="light">{{ selectedPatient.level }}</t-tag>
              <t-tag v-for="tag in selectedPatient.tags" :key="tag" size="small" variant="outline">{{ tag }}</t-tag>
            </div>
          </div>
        </div>

        <t-tabs v-model="detailTab">
          <t-tab-panel value="info" label="基本信息">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="info-item">
                <div class="info-label">患者编号</div>
                <div class="info-val">{{ selectedPatient.no }}</div>
              </div>
              <div class="info-item">
                <div class="info-label">性别</div>
                <div class="info-val">{{ selectedPatient.gender }}</div>
              </div>
              <div class="info-item">
                <div class="info-label">年龄</div>
                <div class="info-val">{{ selectedPatient.age }} 岁</div>
              </div>
              <div class="info-item">
                <div class="info-label">手机号</div>
                <div class="info-val">{{ selectedPatient.phone }}</div>
              </div>
              <div class="info-item">
                <div class="info-label">来源渠道</div>
                <div class="info-val">{{ selectedPatient.source }}</div>
              </div>
              <div class="info-item">
                <div class="info-label">末次到诊</div>
                <div class="info-val">{{ selectedPatient.lastVisit }}</div>
              </div>
              <div class="info-item">
                <div class="info-label">累计到诊</div>
                <div class="info-val">{{ selectedPatient.totalVisits }} 次</div>
              </div>
              <div class="info-item">
                <div class="info-label">累计消费</div>
                <div class="info-val" style="color:#3B6BF5;font-weight:700">¥{{ selectedPatient.totalSpent.toLocaleString() }}</div>
              </div>
            </div>
          </t-tab-panel>

          <t-tab-panel value="history" label="病史">
            <div v-if="selectedPatient.medicalHistory.length" style="margin-bottom:16px">
              <div class="info-label" style="margin-bottom:8px">既往病史</div>
              <t-tag v-for="h in selectedPatient.medicalHistory" :key="h" theme="warning" variant="light" style="margin-right:8px;margin-bottom:8px">
                {{ h }}
              </t-tag>
            </div>
            <div v-else style="text-align:center;color:#9CA3AF;padding:40px">暂无病史记录</div>
          </t-tab-panel>

          <t-tab-panel value="records" label="到诊记录">
            <t-timeline v-if="selectedPatient.records.length">
              <t-timeline-item
                v-for="(r, i) in selectedPatient.records"
                :key="i"
                :label="r.date"
              >
                <div style="font-weight:600;margin-bottom:4px">{{ r.type }}·{{ r.doctor }}</div>
                <div style="font-size:13px;color:#6B7280;margin-bottom:2px">诊断：{{ r.diagnosis }}</div>
                <div style="font-size:13px;color:#6B7280">处置：{{ r.treatment }}</div>
              </t-timeline-item>
            </t-timeline>
            <div v-else style="text-align:center;color:#9CA3AF;padding:40px">暂未到诊记录</div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </t-drawer>

    <!-- 手动建档弹窗 -->
    <t-dialog
      v-model:visible="createVisible"
      header="手动建档"
      width="520px"
      @confirm="handleCreate"
      :cancelBtn="null"
    >
      <div class="dialog-body-form" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label class="form-label">姓名<span class="required">*</span></label>
          <input type="text" class="form-control" v-model="createForm.name" placeholder="请输入患者姓名">
        </div>
        <div class="form-group">
          <label class="form-label">手机号<span class="required">*</span></label>
          <input type="text" class="form-control" v-model="createForm.phone" placeholder="请输入手机号">
        </div>
        <div class="form-group">
          <label class="form-label">性别</label>
          <t-radio-group v-model="createForm.gender">
            <t-radio value="男">男</t-radio>
            <t-radio value="女">女</t-radio>
          </t-radio-group>
        </div>
        <div class="form-group">
          <label class="form-label">年龄</label>
          <input type="number" class="form-control" v-model.number="createForm.age" placeholder="请输入年龄">
        </div>
        <div class="form-group">
          <label class="form-label">会员等级</label>
          <select class="form-control" v-model="createForm.level">
            <option value="普通">普通</option>
            <option value="VIP">VIP</option>
            <option value="SVIP">SVIP</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">来源渠道</label>
          <select class="form-control" v-model="createForm.source">
            <option value="小程序">小程序</option>
            <option value="分销">分销</option>
            <option value="转介绍">转介绍</option>
            <option value="门店">门店</option>
            <option value="直播">直播</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">患者标签</label>
          <input type="text" class="form-control" v-model="createForm.tagsInput" placeholder="请输入标签，英文/中文逗号分隔">
        </div>
        <div class="form-group">
          <label class="form-label">既往病史</label>
          <textarea class="form-control" style="height: auto; min-height: 80px;" v-model="createForm.medicalHistoryInput" placeholder="请输入既往病史，英文/中文逗号分隔"></textarea>
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
.info-item {
  background: #F9FAFB;
  border-radius: 8px;
  padding: 12px;
}
.info-label {
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 4px;
}
.info-val {
  font-size: 14px;
  font-weight: 500;
  color: #1F2937;
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
select.form-control {
  appearance: auto;
}
.required {
  color: #EF4444;
  margin-left: 2px;
}
</style>
