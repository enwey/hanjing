<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateOnly } from '@/utils/dateTime'

const router = useRouter()
const keyword = ref('')
const progress = ref('全部')
const gender = ref('全部')
const level = ref('全部')
const rows = ref<any[]>([])

const genderOptions = ['全部', '男', '女', '未知']
const levelOptions = ['全部', 'SVIP', 'VIP', '普通']
const progressOptions = [
  { label: '全部进度', value: '全部' },
  { label: '已登记', value: 'registered' },
  { label: '已购买', value: 'purchased' },
  { label: '已预约', value: 'appointed' },
  { label: '已到诊', value: 'visited' },
  { label: '治疗中', value: 'treating' },
  { label: '暂停治疗', value: 'paused' },
  { label: '治疗完成', value: 'completed' }
]

const filteredRows = computed(() => {
  return rows.value.filter((item) => {
    const progressMatch = progress.value === '全部' || item.progressCode === progress.value
    const genderMatch = gender.value === '全部' || item.gender === gender.value
    const levelMatch = level.value === '全部' || item.memberLevelLabel === level.value
    const keywordMatch = !keyword.value || [
      item.name,
      item.patientNo,
      item.phoneMasked,
      item.latestStoreName,
      item.latestDoctorName,
      item.deviceName
    ].some((field) => String(field || '').includes(keyword.value))
    return progressMatch && genderMatch && levelMatch && keywordMatch
  })
})

const stats = computed(() => {
  const total = rows.value.length
  const appointed = rows.value.filter((item) => ['appointed', 'visited', 'treating', 'paused', 'completed'].includes(item.progressCode)).length
  const treating = rows.value.filter((item) => item.progressCode === 'treating').length
  const completed = rows.value.filter((item) => item.progressCode === 'completed').length
  return { total, appointed, treating, completed }
})

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function appointmentText(item: any) {
  if (!item.latestAppointmentDate) return '暂无预约'
  const time = item.latestAppointmentTime ? ` ${item.latestAppointmentTime}` : ''
  return `${formatShanghaiDateOnly(item.latestAppointmentDate)}${time}`
}

function sourceLabel(value: string) {
  const map: Record<string, string> = {
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
    admin: '后台'
  }
  return map[value] || value || '未知'
}

function levelClass(value: string) {
  if (value === 'SVIP') return 'level-svip'
  if (value === 'VIP') return 'level-vip'
  return 'level-normal'
}

function treatmentText(item: any) {
  if (!item.treatmentStatus) return '未开始治疗'
  if (item.nextAdjustDate) return `下次调整 ${formatShanghaiDateOnly(item.nextAdjustDate)}`
  if (item.treatmentStartDate) return `开始于 ${formatShanghaiDateOnly(item.treatmentStartDate)}`
  return item.progressLabel || '已建治疗'
}

async function loadData() {
  try {
    const res: any = await request.get('/api/promoter/patients')
    rows.value = res.data?.list || []
  } catch (_error) {
    MessagePlugin.error('加载患者进度失败')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">我的患者</div>
        <div class="page-title-sub">查看推广患者的预约、到诊与治疗进度，不展示病历等隐私信息</div>
      </div>
      <div class="page-count">共 {{ filteredRows.length }} 位</div>
    </div>

    <div class="summary-row">
      <div class="summary-item">
        <div class="summary-label">推广患者</div>
        <div class="summary-value">{{ stats.total }}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">已预约/到诊</div>
        <div class="summary-value">{{ stats.appointed }}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">治疗中</div>
        <div class="summary-value">{{ stats.treating }}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">治疗完成</div>
        <div class="summary-value">{{ stats.completed }}</div>
      </div>
    </div>

    <section class="panel">
      <div class="filter-bar">
        <div class="filter-main">
          <input v-model="keyword" class="filter-input" placeholder="搜索姓名 / 编号 / 脱敏手机号 / 门店 / 医生" />
          <select v-model="gender" class="filter-select">
            <option v-for="item in genderOptions" :key="item" :value="item">{{ item === '全部' ? '全部性别' : item }}</option>
          </select>
          <select v-model="level" class="filter-select">
            <option v-for="item in levelOptions" :key="item" :value="item">{{ item === '全部' ? '全部等级' : item }}</option>
          </select>
          <select v-model="progress" class="filter-select wide">
            <option v-for="item in progressOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </div>
        <div class="filter-count">共 {{ filteredRows.length }} 人</div>
      </div>

      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>病历号</th>
              <th>患者</th>
              <th>等级</th>
              <th>家庭成员</th>
              <th>就诊次数</th>
              <th>最近就诊</th>
              <th>消费总额</th>
              <th>来源</th>
              <th>推广层级</th>
              <th>当前进度</th>
              <th>最近预约</th>
              <th>治疗摘要</th>
              <th>登记时间</th>
              <th style="text-align:right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredRows" :key="item.id">
              <td class="patient-no">{{ item.patientNo }}</td>
              <td>
                <div class="patient-cell">
                  <strong>{{ item.name || '患者' }}</strong>
                  <span>{{ item.gender }} · {{ item.ageText || '未知' }} · {{ item.phoneMasked || '未留手机号' }}</span>
                </div>
              </td>
              <td>
                <span :class="['level-pill', levelClass(item.memberLevelLabel)]">{{ item.memberLevelLabel || '普通' }}</span>
              </td>
              <td>{{ item.familyCount || 0 }} 人</td>
              <td>{{ item.appointmentCount || 0 }} 次</td>
              <td>{{ formatShanghaiDateOnly(item.lastVisit) || '暂无' }}</td>
              <td>¥{{ yuan(item.paidAmount) }}</td>
              <td><span class="source-pill">{{ sourceLabel(item.source) }}</span></td>
              <td>{{ item.relationLevel === 1 ? '一级推广' : '二级推广' }}</td>
              <td>
                <span :class="['progress-pill', item.progressCode]">{{ item.progressLabel }}</span>
              </td>
              <td>
                <div class="sub-cell">
                  <strong>{{ appointmentText(item) }}</strong>
                  <span>{{ item.latestStoreName || '暂无门店' }} · {{ item.latestDoctorName || '暂无医生' }}</span>
                </div>
              </td>
              <td>
                <div class="sub-cell">
                  <strong>{{ item.deviceName || item.progressLabel }}</strong>
                  <span>{{ treatmentText(item) }}</span>
                </div>
              </td>
              <td>{{ formatShanghaiDateOnly(item.createdAt) || '-' }}</td>
              <td style="text-align:right;">
                <button class="btn btn-xs btn-outline" @click="router.push(`/patients/${item.id}`)">详情</button>
              </td>
            </tr>
            <tr v-if="filteredRows.length === 0">
              <td colspan="14" class="empty-cell">暂无符合条件的患者</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page-count {
  font-size: 13px;
  color: #9ca3af;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.summary-item {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.summary-label {
  font-size: 13px;
  color: #64748b;
}

.summary-value {
  margin-top: 8px;
  font-size: 24px;
  line-height: 1;
  font-weight: 700;
  color: #111827;
}

.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
}

.filter-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.filter-tab {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #dbe3ef;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-size: 13px;
}

.filter-tab.active {
  background: #eef4ff;
  color: #2a52d4;
  border-color: #3b6bf5;
}

.filter-input {
  width: 260px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #dbe3ef;
  padding: 0 12px;
  outline: none;
  font-size: 13px;
  flex: 0 0 auto;
}

.filter-select {
  width: 112px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #dbe3ef;
  background: #fff;
  color: #334155;
  padding: 0 10px;
  outline: none;
  font-size: 13px;
}

.filter-select.wide {
  width: 128px;
}

.filter-count {
  flex: 0 0 auto;
  font-size: 13px;
  color: #9ca3af;
}

.patient-no {
  font-family: monospace;
  font-weight: 600;
  color: var(--primary-500);
}

.patient-cell,
.sub-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.patient-cell strong,
.sub-cell strong {
  color: #111827;
}

.patient-cell span,
.sub-cell span {
  font-size: 12px;
  color: #94a3b8;
}

.level-pill,
.source-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 7px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.level-normal {
  background: #f1f5f9;
  color: #64748b;
}

.level-vip {
  background: #eff6ff;
  color: #2563eb;
}

.level-svip {
  background: #fff7ed;
  color: #c05621;
}

.source-pill {
  background: #fffbeb;
  color: #d97706;
}

.progress-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #f1f5f9;
  color: #475569;
}

.progress-pill.appointed,
.progress-pill.visited {
  background: #eef4ff;
  color: #2a52d4;
}

.progress-pill.treating {
  background: #ecfdf5;
  color: #0f8a4b;
}

.progress-pill.paused {
  background: #fff7ed;
  color: #c05621;
}

.progress-pill.completed {
  background: #f0fdf4;
  color: #15803d;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 36px 0;
}

@media (max-width: 1200px) {
  .summary-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .filter-main {
    width: 100%;
  }

  .filter-input {
    width: 100%;
  }

  .filter-select,
  .filter-select.wide {
    flex: 1 1 120px;
  }
}
</style>
