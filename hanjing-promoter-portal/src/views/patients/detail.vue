<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateOnly, formatShanghaiDateTime } from '@/utils/dateTime'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const patient = ref<any>(null)

const patientId = computed(() => String(route.params.id || ''))

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function statusText(value: string) {
  const map: Record<string, string> = {
    pending: '已预约',
    confirmed: '已确认',
    checked_in: '已签到',
    arrived: '已到诊',
    completed: '已完成',
    settled: '已结算',
    cancelled: '已取消',
    no_show: '未到诊',
    paid: '已支付',
    processing: '处理中',
    shipping: '待发货',
    shipped: '已发货',
    delivered: '已送达',
    active: '治疗中',
    paused: '暂停治疗',
    finished: '治疗完成'
  }
  return map[value] || value || '-'
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

function relationText(value: string) {
  const map: Record<string, string> = {
    self: '本人',
    spouse: '配偶',
    parent: '父母',
    child: '子女'
  }
  return map[value] || value || '-'
}

async function loadData() {
  loading.value = true
  try {
    const res: any = await request.get(`/api/promoter/patients/${patientId.value}`)
    patient.value = res.data
  } catch (_error) {
    MessagePlugin.error('加载患者详情失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">患者详情</div>
        <div class="page-title-sub">查看推广患者基础信息、预约、治疗和订单进度</div>
      </div>
      <button class="btn btn-outline" @click="router.push('/patients')">返回列表</button>
    </div>

    <div v-if="loading" class="empty-state">加载中...</div>
    <div v-else-if="!patient" class="empty-state">未找到患者信息</div>
    <template v-else>
      <section class="profile-panel">
        <div class="avatar">{{ patient.name?.slice(0, 1) || '患' }}</div>
        <div class="profile-main">
          <div class="profile-title">
            <strong>{{ patient.name }}</strong>
            <span class="progress-pill">{{ patient.progressLabel }}</span>
          </div>
          <div class="profile-sub">
            {{ patient.patientNo }} · {{ patient.gender }} · {{ patient.ageText }} · {{ patient.phoneMasked }}
          </div>
        </div>
        <div class="profile-stats">
          <div><span>就诊次数</span><strong>{{ patient.appointmentCount || 0 }}</strong></div>
          <div><span>已到诊</span><strong>{{ patient.completedVisitCount || 0 }}</strong></div>
          <div><span>消费总额</span><strong>¥{{ yuan(patient.totalSpent) }}</strong></div>
        </div>
      </section>

      <div class="detail-grid">
        <section class="panel">
          <div class="panel-header">基本信息</div>
          <div class="info-grid">
            <div><span>会员等级</span><strong>{{ patient.memberLevelLabel }}</strong></div>
            <div><span>患者关系</span><strong>{{ relationText(patient.relation) }}</strong></div>
            <div><span>患者来源</span><strong>{{ sourceLabel(patient.source) }}</strong></div>
            <div><span>推广层级</span><strong>{{ patient.relationLevel === 1 ? '一级推广' : '二级推广' }}</strong></div>
            <div><span>登记时间</span><strong>{{ formatShanghaiDateOnly(patient.createdAt) || '-' }}</strong></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">治疗摘要</div>
          <div v-if="patient.treatment" class="info-grid">
            <div><span>治疗状态</span><strong>{{ statusText(patient.treatment.status) }}</strong></div>
            <div><span>设备/方案</span><strong>{{ patient.treatment.device_product_name || patient.treatment.device_model || '-' }}</strong></div>
            <div><span>开始日期</span><strong>{{ formatShanghaiDateOnly(patient.treatment.start_date) || '-' }}</strong></div>
            <div><span>下次调整</span><strong>{{ formatShanghaiDateOnly(patient.treatment.next_adjust_date) || '-' }}</strong></div>
            <div><span>当前前伸量</span><strong>{{ patient.treatment.current_advancement ?? '-' }} mm</strong></div>
            <div><span>负责医生</span><strong>{{ patient.treatment.doctor_name || '-' }}</strong></div>
          </div>
          <div v-else class="empty-block">暂无治疗建档信息</div>
        </section>
      </div>

      <section class="panel">
        <div class="panel-header">预约记录</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>预约单号</th>
              <th>预约时间</th>
              <th>门店</th>
              <th>医生</th>
              <th>类型</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in patient.appointments" :key="item.id">
              <td class="mono">{{ item.appointment_no }}</td>
              <td>{{ formatShanghaiDateOnly(item.appointment_date) }} {{ item.appointment_time || '' }}</td>
              <td>{{ item.store_name || '-' }}</td>
              <td>{{ item.doctor_name || '-' }}</td>
              <td>{{ item.type || '-' }}</td>
              <td>{{ statusText(item.status) }}</td>
            </tr>
            <tr v-if="patient.appointments.length === 0">
              <td colspan="6" class="empty-cell">暂无预约记录</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <div class="panel-header">订单记录</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>订单号</th>
              <th>商品</th>
              <th>金额</th>
              <th>状态</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in patient.orders" :key="item.id">
              <td class="mono">{{ item.order_no }}</td>
              <td>{{ item.product_names || '订单商品' }}</td>
              <td>¥{{ yuan(item.pay_amount) }}</td>
              <td>{{ statusText(item.status) }}</td>
              <td>{{ formatShanghaiDateTime(item.created_at, false) }}</td>
            </tr>
            <tr v-if="patient.orders.length === 0">
              <td colspan="5" class="empty-cell">暂无订单记录</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div class="detail-grid">
        <section class="panel">
          <div class="panel-header">家庭成员</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>关系</th>
                <th>性别</th>
                <th>年龄</th>
                <th>手机</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in patient.familyMembers" :key="item.id">
                <td>{{ item.name }}</td>
                <td>{{ relationText(item.relation) }}</td>
                <td>{{ item.gender }}</td>
                <td>{{ item.age ?? '-' }}</td>
                <td>{{ item.phoneMasked || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <div class="panel-header">治疗时间线</div>
          <div class="timeline">
            <div v-for="item in patient.timelines" :key="item.id" class="timeline-item">
              <div class="timeline-dot"></div>
              <div>
                <strong>{{ item.event_title }}</strong>
                <span>{{ formatShanghaiDateOnly(item.event_date) }} · {{ item.doctor_name || '系统记录' }}</span>
              </div>
            </div>
            <div v-if="patient.timelines.length === 0" class="empty-block">暂无治疗时间线</div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.empty-state,
.empty-block,
.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 32px 0;
}

.profile-panel,
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.profile-panel {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  margin-bottom: 16px;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #3b6bf5;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex: 0 0 auto;
}

.profile-main {
  min-width: 0;
  flex: 1;
}

.profile-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  color: #111827;
}

.profile-sub {
  margin-top: 6px;
  font-size: 13px;
  color: #94a3b8;
}

.profile-stats {
  display: flex;
  gap: 24px;
}

.profile-stats div {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 84px;
}

.profile-stats span,
.info-grid span,
.timeline-item span {
  font-size: 12px;
  color: #94a3b8;
}

.profile-stats strong,
.info-grid strong {
  color: #111827;
  font-weight: 700;
}

.progress-pill {
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  background: #eef4ff;
  color: #2a52d4;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.panel {
  overflow: hidden;
  margin-bottom: 16px;
}

.panel-header {
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid #f3f4f6;
  font-weight: 700;
  color: #111827;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 20px;
}

.info-grid div {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mono {
  font-family: monospace;
  font-weight: 600;
  color: var(--primary-500);
}

.timeline {
  padding: 18px 20px;
}

.timeline-item {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 18px;
}

.timeline-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #3b6bf5;
  margin-top: 5px;
  flex: 0 0 auto;
}

.timeline-item > div:last-child {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

@media (max-width: 1100px) {
  .detail-grid,
  .info-grid {
    grid-template-columns: 1fr;
  }

  .profile-panel {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
