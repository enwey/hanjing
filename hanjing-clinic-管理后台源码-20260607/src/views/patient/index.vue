<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import PatientCreateDialog from '@/components/PatientCreateDialog.vue'

const router = useRouter()

/* ---- Search & Filters State ---- */
const searchKeyword = ref(localStorage.getItem('patient_list_search_keyword') || '')
const filterGender = ref(localStorage.getItem('patient_list_filter_gender') || '')
const filterLevel = ref(localStorage.getItem('patient_list_filter_level') || '')
const filterTag = ref(localStorage.getItem('patient_list_filter_tag') || '')
const filterEssLevel = ref(localStorage.getItem('patient_list_filter_ess_level') || '')
const filterSnoreHasApnea = ref(localStorage.getItem('patient_list_filter_snore_has_apnea') || '')
const filterSnoreNoise = ref(localStorage.getItem('patient_list_filter_snore_noise') || '')
const filterFollower = ref(localStorage.getItem('patient_list_filter_follower') || '')
const filterCrmStage = ref(localStorage.getItem('patient_list_filter_crm_stage') || '')

watch(searchKeyword, (newVal) => { localStorage.setItem('patient_list_search_keyword', newVal) })
watch(filterGender, (newVal) => { localStorage.setItem('patient_list_filter_gender', newVal) })
watch(filterLevel, (newVal) => { localStorage.setItem('patient_list_filter_level', newVal) })
watch(filterTag, (newVal) => { localStorage.setItem('patient_list_filter_tag', newVal) })
watch(filterEssLevel, (newVal) => { localStorage.setItem('patient_list_filter_ess_level', newVal) })
watch(filterSnoreHasApnea, (newVal) => { localStorage.setItem('patient_list_filter_snore_has_apnea', newVal) })
watch(filterSnoreNoise, (newVal) => { localStorage.setItem('patient_list_filter_snore_noise', newVal) })
watch(filterFollower, (newVal) => { localStorage.setItem('patient_list_filter_follower', newVal) })
watch(filterCrmStage, (newVal) => { localStorage.setItem('patient_list_filter_crm_stage', newVal) })

const createVisible = ref(false)

function openCreate() {
  createVisible.value = true
}

function handleCreateSuccess() {
  fetchPatients()
}

/* ---- Types ---- */
interface Patient {
  id: string
  no: string
  name: string
  phone: string
  gender: string
  age: number | null
  ageText: string
  level: string
  lastVisit: string
  totalVisits: number
  totalSpent: number
  source: string
  status: string
  tags: string[]
  familyCount: number
  essText: string
  essAbnormal: boolean
  essResult: any
  snoreText: string
  snoreAbnormal: boolean
  snoreResult: any
  followerId: string
  followerName: string
  crmStage: string
}

const currentPage = ref(1)
const pageSize = ref(30)
const patients = ref<Patient[]>([])
const totalPatients = ref(0)

/* ---- Source Resolver ---- */
const sourceMap: Record<string, string> = {
  mini_app: '小程序',
  mini_program: '小程序',
  wechat: '小程序',
  distribution: '分销',
  promoter: '分销',
  referral: '转介绍',
  referred: '转介绍',
  walk_in: '门店',
  store: '门店',
  offline: '门店',
  live: '直播',
  livestream: '直播',
  admin: '后台',
  '小程序': '小程序',
  '分销': '分销',
  '转介绍': '转介绍',
  '门店': '门店',
  '直播': '直播'
}

function getPatientNo(item: any) {
  return item.patient_no || item.no || '未生成'
}

function getPatientSource(item: any) {
  const source = item.resolved_source || item.source || item.patient_source || item.latest_source
  return sourceMap[source] || source || '未知'
}

/* ---- Clinical Normalizers ---- */
const riskLabelMap: Record<string, string> = {
  normal: '正常',
  low: '低风险',
  mild: '轻度',
  moderate: '中度',
  severe: '重度',
  high: '高风险'
}

function normalizeRiskLevel(level: string): string {
  if (!level) return 'normal'
  const val = String(level).toLowerCase()
  if (val.includes('正常') || val.includes('normal') || val.includes('low') || val.includes('低')) return 'normal'
  if (val.includes('轻') || val === 'mild') return 'mild'
  if (val.includes('中') || val === 'moderate' || val === 'medium') return 'moderate'
  if (val.includes('重') || val === 'severe' || val === 'high' || val === 'higher' || val.includes('高')) return 'severe'
  return val
}

function getRiskLabel(level: string) {
  const norm = normalizeRiskLevel(level)
  return riskLabelMap[norm] || level || ''
}

function getEssText(item: any) {
  if (!item.ess_result) return '未评估'
  return `${item.ess_result.total_score}分/${getRiskLabel(item.ess_result.risk_level)}`
}

function getSnoreText(item: any) {
  if (!item.snore_result) return '未分析'
  return `${getRiskLabel(item.snore_result.risk_level)} · ${item.snore_result.apnea_events || 0}次`
}

/* ---- Backend Data Loader ---- */
const fetchPatients = async () => {
  try {
    const res: any = await request.get('/api/admin/patients')
    const list = Array.isArray(res.data) ? res.data : res.data?.list || []
    totalPatients.value = Array.isArray(res.data) ? list.length : Number(res.data?.pagination?.total || list.length)
    patients.value = list.map((item: any) => {
      const levelMap: Record<string, string> = {
        normal: '普通',
        silver: 'VIP',
        gold: 'VIP',
        diamond: 'SVIP'
      }
      return {
        id: item.id.toString(),
        no: getPatientNo(item),
        name: item.name,
        phone: item.phone || item.user_phone || '',
        gender: item.gender === 1 ? '男' : item.gender === 2 ? '女' : '未知',
        age: item.age ?? null,
        ageText: item.age === null || item.age === undefined ? '未知' : `${item.age}岁`,
        level: levelMap[item.member_level] || '普通',
        lastVisit: item.last_visit || '暂无',
        totalVisits: item.visit_count || 0,
        totalSpent: (item.total_spent || 0) / 100,
        source: getPatientSource(item),
        status: item.status,
        tags: item.tags || [],
        familyCount: item.family_count || 0,
        essText: getEssText(item),
        essAbnormal: Boolean(item.ess_has_abnormal),
        essResult: item.ess_result,
        snoreText: getSnoreText(item),
        snoreAbnormal: Boolean(item.snore_has_abnormal),
        snoreResult: item.snore_result,
        followerId: item.follower_id ? item.follower_id.toString() : '',
        followerName: item.follower_name || '未分配',
        crmStage: item.crm_stage || '未跟进'
      }
    })
  } catch (error) {
    console.error('Failed to load patients:', error)
  }
}

const followers = ref<any[]>([])
const fetchFollowers = async () => {
  try {
    const res: any = await request.get('/api/admin/admin-users')
    followers.value = res.data || []
  } catch (error) {
    console.error('Failed to load followers:', error)
  }
}

/* ---- Filter Dropdowns ---- */
const genderOptions = [
  { label: '全部性别', value: '' },
  { label: '男', value: '男' },
  { label: '女', value: '女' }
]

const levelOptions = [
  { label: '全部等级', value: '' },
  { label: 'SVIP', value: 'SVIP' },
  { label: 'VIP', value: 'VIP' },
  { label: '普通', value: '普通' }
]

const tagOptions = computed(() => {
  const allTags = new Set<string>()
  patients.value.forEach(p => {
    if (Array.isArray(p.tags)) {
      p.tags.forEach(t => allTags.add(t))
    }
  })
  return [{ label: '全部标签', value: '' }, ...Array.from(allTags).map(t => ({ label: t, value: t }))]
})

const essLevelOptions = [
  { label: '全部ESS状态', value: '' },
  { label: '未评估', value: 'none' },
  { label: '已评估 (全部)', value: 'completed' },
  { label: '正常 (0-6分)', value: 'normal' },
  { label: '轻度嗜睡', value: 'mild' },
  { label: '中度嗜睡', value: 'moderate' },
  { label: '重度嗜睡', value: 'severe' }
]

const snoreApneaOptions = [
  { label: '全部呼吸暂停', value: '' },
  { label: '未进行录音', value: 'none' },
  { label: '有疑似暂停', value: 'yes' },
  { label: '无疑似暂停', value: 'no' }
]

const snoreNoiseOptions = [
  { label: '全部鼾声级别', value: '' },
  { label: '未评估', value: 'none' },
  { label: '低风险/正常', value: 'normal' },
  { label: '轻度打鼾', value: 'mild' },
  { label: '中度打鼾', value: 'moderate' },
  { label: '重度打鼾', value: 'severe' }
]

const followerOptions = computed(() => {
  const opts = [{ label: '全部跟进人', value: '' }, { label: '未分配', value: 'unassigned' }]
  followers.value.forEach(f => {
    opts.push({ label: f.name, value: f.id.toString() })
  })
  return opts
})

const crmStageOptions = [
  { label: '全部跟进阶段', value: '' },
  { label: '未跟进', value: '未跟进' },
  { label: '意向中', value: '意向中' },
  { label: '考虑中', value: '考虑中' },
  { label: '已成单', value: '已成单' },
  { label: '已放弃', value: '已放弃' }
]

onMounted(() => {
  fetchPatients()
  fetchFollowers()
})

/* ---- Advanced Multi-Filter Logic ---- */
const filteredPatients = computed(() => {
  let list = patients.value
  if (filterGender.value) list = list.filter(p => p.gender === filterGender.value)
  if (filterLevel.value) list = list.filter(p => p.level === filterLevel.value)
  
  if (filterTag.value) {
    list = list.filter(p => Array.isArray(p.tags) && p.tags.includes(filterTag.value))
  }

  if (filterEssLevel.value) {
    if (filterEssLevel.value === 'none') {
      list = list.filter(p => !p.essResult)
    } else if (filterEssLevel.value === 'completed') {
      list = list.filter(p => !!p.essResult)
    } else {
      list = list.filter(p => p.essResult && normalizeRiskLevel(p.essResult.risk_level) === filterEssLevel.value)
    }
  }

  if (filterSnoreHasApnea.value) {
    if (filterSnoreHasApnea.value === 'yes') {
      list = list.filter(p => p.snoreResult && p.snoreResult.apnea_events > 0)
    } else if (filterSnoreHasApnea.value === 'no') {
      list = list.filter(p => p.snoreResult && p.snoreResult.apnea_events === 0)
    } else if (filterSnoreHasApnea.value === 'none') {
      list = list.filter(p => !p.snoreResult)
    }
  }

  if (filterSnoreNoise.value) {
    if (filterSnoreNoise.value === 'none') {
      list = list.filter(p => !p.snoreResult)
    } else {
      list = list.filter(p => p.snoreResult && normalizeRiskLevel(p.snoreResult.risk_level) === filterSnoreNoise.value)
    }
  }

  if (filterFollower.value) {
    if (filterFollower.value === 'unassigned') {
      list = list.filter(p => !p.followerId)
    } else {
      list = list.filter(p => p.followerId === filterFollower.value)
    }
  }
  if (filterCrmStage.value) {
    list = list.filter(p => p.crmStage === filterCrmStage.value)
  }

  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(p => p.name.includes(kw) || p.no.toLowerCase().includes(kw) || p.phone.includes(kw))
  }
  return list
})

watch([searchKeyword, filterGender, filterLevel, filterTag, filterEssLevel, filterSnoreHasApnea, filterSnoreNoise, filterFollower, filterCrmStage], () => {
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
const crmStageTheme: Record<string, string> = {
  '未跟进': 'default',
  '意向中': 'primary',
  '考虑中': 'warning',
  '已成单': 'success',
  '已放弃': 'danger'
}
const statusMap: Record<string, { label: string; theme: string }> = {
  active: { label: '活跃', theme: 'success' },
  inactive: { label: '失活', theme: 'default' },
}

const operationColumnWidth = computed(() => {
  if (paginatedPatients.value.length === 0) return '80px'
  return '140px'
})

watch(operationColumnWidth, () => {
  nextTick(() => {
    window.dispatchEvent(new Event('resize'))
  })
})

/* ---- CRM Dialog State and Callbacks ---- */
const crmVisible = ref(false)
const crmForm = ref({
  patientId: '',
  patientName: '',
  followerId: '',
  stage: '意向中',
  content: ''
})
const submittingCrm = ref(false)

function openCrmDialog(row: Patient) {
  crmForm.value = {
    patientId: row.id,
    patientName: row.name,
    followerId: row.followerId || '',
    stage: row.crmStage === '未跟进' ? '意向中' : row.crmStage,
    content: ''
  }
  crmVisible.value = true
}

async function handleSaveCrm() {
  if (!crmForm.value.content.trim()) {
    MessagePlugin.warning('请填写跟进内容描述')
    return
  }
  submittingCrm.value = true
  try {
    await request.put(`/api/admin/patients/${crmForm.value.patientId}/follower`, {
      follower_id: crmForm.value.followerId ? Number(crmForm.value.followerId) : null
    })
    await request.post(`/api/admin/patients/${crmForm.value.patientId}/crm-records`, {
      content: crmForm.value.content.trim(),
      stage: crmForm.value.stage
    })
    MessagePlugin.success('保存跟进成功')
    crmVisible.value = false
    fetchPatients()
  } catch (error) {
    console.error(error)
    MessagePlugin.error('保存跟进失败')
  } finally {
    submittingCrm.value = false
  }
}
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">患者管理</div>
        <div class="page-title-sub">{{ totalPatients.toLocaleString() }} 位注册患者</div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-outline"><AppIcon name="download" />  导出</button>
        <button class="btn btn-primary" @click="openCreate"><AppIcon name="plus" />  手动建档</button>
      </div>
    </div>

    <!-- Panel Wrapper -->
    <div class="panel">
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <t-input v-model="searchKeyword" placeholder="搜索姓名/编号/手机号" clearable style="width:190px" />
          <t-select v-model="filterGender" :options="genderOptions" style="width:105px" />
          <t-select v-model="filterLevel" :options="levelOptions" style="width:105px" />
          <t-select v-model="filterTag" :options="tagOptions" placeholder="患者标签" style="width:115px" />
          <t-select v-model="filterEssLevel" :options="essLevelOptions" style="width:130px" />
          <t-select v-model="filterSnoreHasApnea" :options="snoreApneaOptions" style="width:130px" />
          <t-select v-model="filterSnoreNoise" :options="snoreNoiseOptions" style="width:130px" />
          <t-select v-model="filterFollower" :options="followerOptions" placeholder="跟进人" style="width:120px" />
          <t-select v-model="filterCrmStage" :options="crmStageOptions" style="width:130px" />
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
              <th>病历号</th>
              <th>患者信息</th>
              <th>等级</th>
              <th>标签</th>
              <th>家庭成员</th>
              <th>ESS嗜睡量表</th>
              <th>AI鼾声分析</th>
              <th>就诊次数</th>
              <th>最近就诊</th>
              <th>消费总额</th>
              <th>来源</th>
              <th>跟进人</th>
              <th>跟进阶段</th>
              <th :style="{ width: operationColumnWidth, minWidth: operationColumnWidth, textAlign: 'right' }">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedPatients" :key="row.id">
              <td style="font-family: monospace; font-weight: 600; color: var(--primary-500);">{{ row.no }}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;" @click.stop>
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
                  <div style="min-width: 0; overflow: hidden; display: flex; flex-direction: column;">
                    <div style="font-weight:600;color:#1F2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ row.name }}</div>
                    <div style="font-size:11px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ row.gender }} · {{ row.ageText }} · {{ row.phone }}</div>
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
              <td style="font-weight:600;">{{ row.familyCount }}人</td>
              <td :class="{ 'assessment-danger': row.essAbnormal }">{{ row.essText }}</td>
              <td :class="{ 'assessment-danger': row.snoreAbnormal }">{{ row.snoreText }}</td>
              <td style="font-weight:600;">{{ row.totalVisits }}次</td>
              <td style="font-size:12px;color:#9CA3AF;">{{ row.lastVisit }}</td>
              <td style="font-weight:600;color:#1F2937">¥{{ row.totalSpent.toLocaleString() }}</td>
              <td>
                <span :style="getSourceStyle(row.source)">{{ row.source }}</span>
              </td>
              <td style="font-weight: 500; color: #4B5563;">{{ row.followerName }}</td>
              <td>
                <t-tag :theme="crmStageTheme[row.crmStage] || 'default'" size="small" variant="light">{{ row.crmStage }}</t-tag>
              </td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;" @click.stop>
                  <button class="btn btn-xs btn-outline" @click="openDetail(row)">详情</button>
                  <button class="btn btn-xs btn-outline" @click="openCrmDialog(row)">跟进</button>
                  <button class="btn btn-xs btn-outline" @click="router.push('/patient/followup/' + row.id)">随访</button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedPatients.length === 0">
              <td colspan="14" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无匹配的患者数据</td>
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

    <!-- 手动建档弹窗 -->
    <PatientCreateDialog
      v-model:visible="createVisible"
      @success="handleCreateSuccess"
    />

    <!-- CRM 跟进弹窗 -->
    <t-dialog
      v-model:visible="crmVisible"
      :header="`添加跟进记录 - ${crmForm.patientName}`"
      width="500px"
      :on-confirm="handleSaveCrm"
      :confirm-btn="{ content: '保存跟进', loading: submittingCrm }"
      cancel-btn="取消"
    >
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 10px 0;">
        <div>
          <div style="font-size: 13px; color: #6B7280; margin-bottom: 6px;">分配跟进人：</div>
          <t-select
            v-model="crmForm.followerId"
            placeholder="选择跟进人"
            clearable
            style="width: 100%;"
          >
            <t-option v-for="item in followers" :key="item.id" :label="item.name" :value="item.id.toString()" />
          </t-select>
        </div>
        
        <div>
          <div style="font-size: 13px; color: #6B7280; margin-bottom: 6px;">跟进阶段：</div>
          <t-radio-group v-model="crmForm.stage" variant="default-filled">
            <t-radio-button value="意向中">意向中</t-radio-button>
            <t-radio-button value="考虑中">考虑中</t-radio-button>
            <t-radio-button value="已成单">已成单</t-radio-button>
            <t-radio-button value="已放弃">已放弃</t-radio-button>
          </t-radio-group>
        </div>

        <div>
          <div style="font-size: 13px; color: #6B7280; margin-bottom: 6px;">跟进内容描述：</div>
          <t-textarea
            v-model="crmForm.content"
            placeholder="请输入与患者沟通的详细跟进记录..."
            :autosize="{ minRows: 4, maxRows: 8 }"
          />
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

.assessment-danger {
  color: #EF4444;
  font-weight: 700;
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
