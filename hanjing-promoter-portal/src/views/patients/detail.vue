<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import request from '@/utils/request'
import { formatShanghaiDateOnly as date, formatShanghaiDateTime } from '@/utils/dateTime'

const route = useRoute(), router = useRouter()
const patient = ref<any>(null), loading = ref(false), error = ref('')
const activeTab = ref('info'), selectedRecord = ref<any>(null)
let requestId = 0
const tabs = [{ key: 'info', label: '基本信息' }, { key: 'visits', label: '就诊记录' }, { key: 'orders', label: '订单记录' }]
const appointments = computed<any[]>(() => patient.value?.appointments || [])
const records = computed<any[]>(() => patient.value?.medical_records || [])
const orders = computed<any[]>(() => patient.value?.orders || [])
const family = computed<any[]>(() => patient.value?.family_members || [])
const sleep = computed(() => patient.value?.sleep_diagnostics || {})
const treatment = computed(() => patient.value?.active_treatment)
const arrived = computed(() => appointments.value.filter(a => ['arrived', 'completed', 'settled'].includes(a.status)).length)
const yuan = (v: any) => (Number(v || 0) / 100).toFixed(2)
const label = (v: string, map: Record<string, string>) => map[v] || v || '未记录'
const relation = (v: string) => label(v, { self: '本人', spouse: '配偶', child: '子女', parent: '父母', sibling: '兄弟姐妹', other: '其他' })
const source = (v: string) => label(v, { mini_app: '小程序', mini_program: '小程序', wechat: '小程序', distribution: '分销', promoter: '分销', referral: '转介绍', referred: '转介绍', walk_in: '门店', store: '门店', offline: '门店', admin: '后台' })
const status = (v: string) => label(v, { pending: '待处理', confirmed: '已确认', checked_in: '已签到', arrived: '已到诊', completed: '已完成', settled: '已结算', cancelled: '已取消', no_show: '未到诊', paid: '已支付', unpaid: '待支付', processing: '处理中', shipping: '待发货', shipped: '已发货', delivered: '已送达', refunded: '已退款', active: '治疗中', paused: '暂停治疗', finished: '治疗完成' })
const risk = (v: string) => label(v, { normal: '正常', low: '低风险', mild: '轻度', moderate: '中度', severe: '重度', high: '高风险' })
const delivery = (v: string) => label(v, { pickup: '到店自提', express: '快递配送', shipping: '快递配送', delivery: '快递配送', store: '到店自提' })
const displayDate = (v: any) => v ? date(v) || '未记录' : '未记录'
async function loadData() {
  const current = ++requestId
  loading.value = true; patient.value = null; error.value = ''; selectedRecord.value = null; activeTab.value = 'info'
  try {
    const res: any = await request.get('/api/promoter/patients/' + encodeURIComponent(String(route.params.id || '')))
    if (current === requestId) patient.value = res.data
  } catch (e: any) {
    if (current === requestId) error.value = e.response?.data?.message || '加载患者详情失败，请重试'
  } finally { if (current === requestId) loading.value = false }
}
watch(() => route.params.id, loadData, { immediate: true })
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div><div class="page-title">患者详情</div><div class="page-title-sub">查看患者基本信息、就诊记录与订单记录</div></div>
      <button class="btn btn-outline" @click="router.push('/patients')">返回列表</button>
    </div>
    <div v-if="loading" class="empty-state">加载中...</div>
    <div v-else-if="error" class="empty-state">{{ error }} <button class="btn btn-outline" @click="loadData">重新加载</button></div>
    <div v-else-if="!patient" class="empty-state">未找到患者信息</div>
    <template v-else>
      <section class="profile-panel">
        <div class="avatar">{{ patient.name?.slice(0, 1) || '患' }}</div>
        <div><h2>{{ patient.name || '未记录' }}</h2><div class="muted">{{ patient.patient_no || '未记录编号' }} · {{ patient.gender || '未记录性别' }} · {{ patient.age == null ? '未记录年龄' : patient.age + '岁' }} · {{ patient.phone || '未记录电话' }}</div></div>
      </section>
      <div class="stats">
        <section class="panel stat"><span>预约次数</span><strong>{{ appointments.length }}</strong></section>
        <section class="panel stat"><span>累计到诊</span><strong>{{ arrived }}</strong></section>
        <section class="panel stat"><span>账户消费总额</span><strong>¥{{ yuan(patient.total_spent) }}</strong></section>
        <section class="panel stat"><span>患者来源</span><strong>{{ source(patient.source) }}</strong></section>
      </div>
      <div class="tabs" role="tablist"><button v-for="tab in tabs" :key="tab.key" class="tab" :class="{ active: activeTab === tab.key }" role="tab" :aria-selected="activeTab === tab.key" @click="activeTab = tab.key">{{ tab.label }}</button></div>
      <div v-if="activeTab === 'info'">
        <div class="detail-grid">
          <section class="panel"><div class="panel-header">个人信息</div><div class="info-grid">
            <div><span>姓名</span><strong>{{ patient.name }}</strong></div>
            <div><span>手机号</span><strong>{{ patient.phone || '未记录' }}</strong></div>
            <div><span>会员等级</span><strong>{{ patient.member_level_name || patient.member_level || '普通会员' }}</strong></div>
            <div><span>患者关系</span><strong>{{ relation(patient.relation) }}</strong></div>
            <div><span>患者来源</span><strong>{{ source(patient.source) }}</strong></div>
            <div><span>登记时间</span><strong>{{ displayDate(patient.created_at) }}</strong></div>
          </div></section>
          <section class="panel"><div class="panel-header">就诊概况</div><div class="info-grid">
            <div><span>主诊断</span><strong>{{ patient.latest_medical_record?.diagnosis || '未记录' }}</strong></div>
            <div><span>上次就诊</span><strong>{{ displayDate(patient.latest_medical_record?.visit_date) }}</strong></div>
            <div><span>当前方案</span><strong>{{ patient.latest_medical_record?.prescription || '未记录' }}</strong></div>
            <div><span>治疗状态</span><strong>{{ treatment ? status(treatment.status) : '暂无治疗建档信息' }}</strong></div>
            <div><span>设备/方案</span><strong>{{ treatment?.device_name_snapshot || treatment?.device_model || '未记录' }}</strong></div>
            <div><span>负责医生</span><strong>{{ treatment?.doctor_name || '未记录' }}</strong></div>
          </div></section>
        </div>
        <section class="panel"><div class="panel-header">睡眠诊断汇总</div><div class="info-grid">
          <div><span>ESS评分</span><strong>{{ sleep.ess ? sleep.ess.total_score + '分' : '暂无评估' }}</strong></div>
          <div><span>鼾声分析</span><strong>{{ sleep.snore ? (sleep.snore.analysis_version === 2 ? '声音特征分析' : risk(sleep.snore.risk_level)) : '暂无评估' }}</strong></div>
          <div><span>平均佩戴时长</span><strong>{{ Number(sleep.wearing?.avg_duration || 0).toFixed(1) }}小时</strong></div>
          <div><span>累计打卡</span><strong>{{ sleep.wearing?.total_days || 0 }}天</strong></div>
        </div></section>
        <section class="panel"><div class="panel-header">家庭成员</div><div class="table-scroll"><table class="data-table">
          <thead><tr><th>姓名</th><th>关系</th><th>性别</th><th>年龄</th><th>手机号</th></tr></thead>
          <tbody><tr v-for="member in family" :key="member.id"><td>{{ member.name }}</td><td>{{ relation(member.relation) }}</td><td>{{ member.gender || '未记录' }}</td><td>{{ member.age ?? '未记录' }}</td><td>{{ member.phone || '未记录' }}</td></tr><tr v-if="!family.length"><td colspan="5" class="empty-state">暂无家庭成员</td></tr></tbody>
        </table></div></section>
        <section class="panel"><div class="panel-header">就诊时间线</div><div class="timeline">
          <div v-for="record in records" :key="record.id" class="timeline-item"><strong>{{ displayDate(record.visit_date) }} · {{ record.doctor_name || '未记录医生' }}</strong><span>{{ record.diagnosis || '未记录诊断' }}</span></div>
          <div v-if="!records.length" class="empty-state">暂无就诊记录</div>
        </div></section>
      </div>
      <section v-else-if="activeTab === 'visits'" class="panel"><div class="panel-header">就诊记录</div><div class="table-scroll"><table class="data-table">
        <thead><tr><th>就诊时间</th><th>门店</th><th>接诊医生</th><th>诊断结果</th><th>操作</th></tr></thead>
        <tbody><tr v-for="record in records" :key="record.id"><td>{{ displayDate(record.visit_date) }}</td><td>{{ record.store_name || '未记录' }}</td><td>{{ record.doctor_name || '未记录' }}</td><td>{{ record.diagnosis || '未记录' }}</td><td><button class="btn btn-xs btn-outline" @click="selectedRecord = record">查看门诊病历</button></td></tr><tr v-if="!records.length"><td colspan="5" class="empty-state">暂无就诊记录</td></tr></tbody>
      </table></div></section>
      <section v-else class="panel"><div class="panel-header">订单记录</div><div class="table-scroll"><table class="data-table">
        <thead><tr><th>订单单号</th><th>购买日期</th><th>商品详情</th><th>配送方式</th><th>支付金额</th><th>交易状态</th></tr></thead>
        <tbody><tr v-for="order in orders" :key="order.id"><td>{{ order.order_no }}</td><td>{{ order.created_at ? formatShanghaiDateTime(order.created_at, false) : '未记录' }}</td><td><div v-for="item in (order.items || [])" :key="item.id">{{ item.product_name || '商品' }} × {{ item.quantity }}</div><span v-if="!order.items?.length">暂无商品明细</span></td><td>{{ delivery(order.delivery_type) }}</td><td>¥{{ yuan(order.pay_amount) }}</td><td>{{ status(order.status) }}</td></tr><tr v-if="!orders.length"><td colspan="6" class="empty-state">暂无订单记录</td></tr></tbody>
      </table></div></section>
    </template>
    <t-dialog :visible="!!selectedRecord" header="门诊病历" :footer="false" width="min(680px, 94vw)" @close="selectedRecord = null">
      <div v-if="selectedRecord" class="info-grid record-details">
        <div><span>就诊时间</span><strong>{{ displayDate(selectedRecord.visit_date) }}</strong></div>
        <div><span>医生 / 门店</span><strong>{{ selectedRecord.doctor_name || '未记录' }} / {{ selectedRecord.store_name || '未记录' }}</strong></div>
        <div><span>诊断结果</span><strong>{{ selectedRecord.diagnosis || '未记录' }}</strong></div>
        <div><span>治疗处方方案</span><strong>{{ selectedRecord.prescription || '未记录' }}</strong></div>
        <div><span>医嘱</span><strong>{{ selectedRecord.doctor_advice || '未记录' }}</strong></div>
        <div><span>备注</span><strong>{{ selectedRecord.note || '未记录' }}</strong></div>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
.empty-state { text-align:center; color:#64748b; padding:32px 12px; }
.profile-panel,.panel { background:#fff; border:1px solid #e5e7eb; border-radius:12px; margin-bottom:16px; }
.profile-panel { display:flex; align-items:center; gap:16px; padding:20px; }
h2 { margin:0 0 8px; font-size:20px; }
.avatar { width:48px; height:48px; border-radius:50%; background:#3b6bf5; color:white; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.muted { color:#64748b; font-size:13px; overflow-wrap:anywhere; }
.stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; }
.stat { padding:20px; display:flex; flex-direction:column; gap:8px; }
.stat strong { font-size:22px; }
.stat span,.info-grid span { color:#64748b; font-size:13px; }
.tabs { display:flex; overflow-x:auto; border-bottom:1px solid #e5e7eb; margin-bottom:20px; }
.tab { border:0; background:transparent; padding:14px 24px; white-space:nowrap; cursor:pointer; color:#64748b; }
.tab.active { color:#2563eb; border-bottom:2px solid #2563eb; }
.detail-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
.panel-header { padding:16px 20px; border-bottom:1px solid #f1f5f9; font-weight:600; }
.info-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; padding:20px; }
.info-grid > div { display:flex; flex-direction:column; gap:8px; min-width:0; }
.info-grid strong { font-weight:500; white-space:pre-wrap; overflow-wrap:anywhere; }
.table-scroll { overflow-x:auto; }
.data-table { min-width:600px; }
.timeline { padding:20px; }
.timeline-item { display:flex; flex-direction:column; gap:8px; border-left:2px solid #dbeafe; padding:0 16px 20px; }
.record-details { grid-template-columns:1fr; }
@media(max-width:900px) { .detail-grid { grid-template-columns:1fr; } .stats { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:480px) { .info-grid { grid-template-columns:1fr; } .profile-panel { align-items:flex-start; } }
</style>
