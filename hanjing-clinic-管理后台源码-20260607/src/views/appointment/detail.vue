<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'

const route = useRoute()
const router = useRouter()
const appointmentId = ref(route.params.id as string || '1')

/* ---- Appointment Data ---- */
const appointment = ref({
  id: appointmentId.value,
  no: 'BK20260529001',
  status: 'checked_in', // confirmed, checked_in, completed, cancelled
  createTime: '2026-05-28 14:32',
  patient: '张明华',
  phone: '138****6789',
  level: 'VIP',
  isNew: false, // 复诊
  doctor: '古堪民 主任医师',
  dept: '睡眠呼吸科',
  store: '龙岗总店',
  dateTime: '5月29日 周四 09:30',
  type: '复诊',
  fee: '200.00',
  feeStatus: 'paid', // paid
  source: '小程序',
  symptom: '睡觉打鼾严重，伴随夜间间歇性呼吸暂停，白天偶发性改变，希望复查睡眠数据。'
})

function handleBack() {
  router.push('/appointment')
}

function handlePrint() {
  MessagePlugin.success('打印任务已提交到前台打印机。')
}

function handleReschedule() {
  router.push(`/appointment/create?reschedule=1&id=${appointmentId.value}`)
}

function handleCancel() {
  appointment.value.status = 'cancelled'
  MessagePlugin.success(`预约单 ${appointment.value.no} 已成功取消。`)
}

function handleViewProfile() {
  router.push(`/patient/detail/1`)
}
</script>

<template>
  <div class="page-container">


    <!-- Header Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">
          {{ appointment.no }}
          <span class="status-tag green" v-if="appointment.status === 'checked_in'">已到诊</span>
          <span class="status-tag blue" v-else-if="appointment.status === 'confirmed'">已确认</span>
          <span class="status-tag gray" v-else-if="appointment.status === 'completed'">已完成</span>
          <span class="status-tag red" v-else-if="appointment.status === 'cancelled'">已取消</span>
        </div>
        <div class="page-title-sub">创建于 {{ appointment.createTime }} · 小程序预约</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" @click="handlePrint">🖨️ 打印</button>
        <button class="btn btn-warning" @click="handleReschedule">✏️ 改约</button>
        <button class="btn btn-danger" @click="handleCancel" v-if="appointment.status !== 'cancelled'">❌ 取消</button>
      </div>
    </div>

    <!-- Two-Column Panel Info -->
    <div class="card-grid-2">
      <!-- Patient Info -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header">
          <div class="panel-title">🧑‍⚕️ 患者信息</div>
          <button class="btn btn-sm btn-outline" @click="handleViewProfile">查看档案</button>
        </div>
        <div class="panel-body">
          <div style="display: flex; gap: 14px; align-items: flex-start;">
            <div class="avatar avatar-lg" style="background: linear-gradient(135deg, var(--primary-500), #2A52D4);">张</div>
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 18px; font-weight: 700; color: #111827;">{{ appointment.patient }}</span>
                <span class="tag tag-gold">{{ appointment.level }}</span>
                <span class="tag tag-blue">{{ appointment.type }}</span>
              </div>
              <div style="font-size: 13px; color: #6B7280; line-height: 1.8;">
                男 · 52岁 · {{ appointment.phone }}<br>
                病历号 HZ20240001 · 累计就诊 8次 · 消费 ¥18,640
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Appointment Info -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header">
          <div class="panel-title">📅 预约信息</div>
        </div>
        <div class="info-grid" style="grid-template-columns: 1fr 1fr;">
          <div class="info-item">
            <div class="info-label">就诊门店</div>
            <div class="info-value">🏥 {{ appointment.store }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">就诊医生</div>
            <div class="info-value">👨‍⚕️ {{ appointment.doctor }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">科室</div>
            <div class="info-value">{{ appointment.dept }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">预约时间</div>
            <div class="info-value" style="color: var(--primary-500);">{{ appointment.dateTime }}</div>
          </div>
          <div class="info-item">
            <div class="info-label">预约来源</div>
            <div class="info-value"><span class="tag tag-green">{{ appointment.source }}</span></div>
          </div>
          <div class="info-item">
            <div class="info-label">挂号费</div>
            <div class="info-value" style="color: var(--primary-500);">¥{{ appointment.fee }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline Progress -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">📋 预约流程</div></div>
      <div class="panel-body">
        <div class="timeline">
          <div class="timeline-item">
            <div class="timeline-dot blue"></div>
            <div class="timeline-time">5/28 14:32</div>
            <div class="timeline-content"><strong>创建预约</strong> — 患者通过小程序自助预约，选择龙岗总店·古堪民·5/29 09:30</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot green"></div>
            <div class="timeline-time">5/28 14:32</div>
            <div class="timeline-content"><strong>支付挂号费</strong> — ¥200.00 微信支付成功（交易号：wx2905281432001）</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot green"></div>
            <div class="timeline-time">5/29 08:45</div>
            <div class="timeline-content"><strong>系统提醒</strong> — 就诊前1小时自动提醒已发送</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot green"></div>
            <div class="timeline-time">5/29 09:15</div>
            <div class="timeline-content"><strong>到店签到</strong> — 前台扫码确认到诊</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot green"></div>
            <div class="timeline-time">5/29 09:30</div>
            <div class="timeline-content"><strong>开始就诊</strong> — 古堪民医生接诊</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot gray"></div>
            <div class="timeline-time">待完成</div>
            <div class="timeline-content" style="color: #9CA3AF;">完成就诊 → 开具处方/建议 → 随访计划</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Patient History Table -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header">
        <div class="panel-title">📜 历史预约（8次）</div>
        <button class="btn btn-sm btn-outline">查看全部</button>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>预约单号</th>
            <th>日期</th>
            <th>门店</th>
            <th>医生</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-family: monospace; font-size: 12px; color: #9CA3AF;">BK20260415001</td>
            <td>4/15</td>
            <td>龙岗总店</td>
            <td>古堪民</td>
            <td><span class="status-tag green">已完成</span></td>
          </tr>
          <tr>
            <td style="font-family: monospace; font-size: 12px; color: #9CA3AF;">BK20260320003</td>
            <td>3/20</td>
            <td>龙岗总店</td>
            <td>王志远</td>
            <td><span class="status-tag green">已完成</span></td>
          </tr>
          <tr>
            <td style="font-family: monospace; font-size: 12px; color: #9CA3AF;">BK20260225002</td>
            <td>2/25</td>
            <td>南山分院</td>
            <td>古堪民</td>
            <td><span class="status-tag gray">已取消</span></td>
          </tr>
        </tbody>
      </table>
    </div>
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
  display: flex;
  align-items: center;
  gap: 12px;
}
.page-title-sub {
  font-size: 13px;
  color: #9CA3AF;
  margin-top: 4px;
}

/* Action Buttons */
.action-buttons {
  display: flex;
  gap: 8px;
}

/* General Layout Elements */
.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #F3F4F6;
}
.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.panel-body {
  padding: 20px;
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
.btn-warning {
  background: #FFFBEB;
  color: #D97706;
  border: 1px solid #FDE68A;
}
.btn-warning:hover {
  background: #FEF3C7;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

/* Grids */
.card-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
}
.info-item {
  padding: 14px 20px;
  border-bottom: 1px solid #F9FAFB;
}
.info-item:nth-child(even) {
  border-left: 1px solid #F9FAFB;
}
.info-label {
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 4px;
}
.info-value {
  font-size: 14px;
  font-weight: 600;
  color: #1F2937;
}

/* Status & Tags */
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
.status-tag.blue {
  background: #EEF4FF;
  color: #2A52D4;
}
.status-tag.blue::before {
  background: var(--primary-500);
}
.status-tag.gray {
  background: #F3F4F6;
  color: #6B7280;
}
.status-tag.gray::before {
  background: #9CA3AF;
}
.status-tag.red {
  background: #FEF2F2;
  color: #DC2626;
}
.status-tag.red::before {
  background: #EF4444;
}

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

/* Avatar */
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}
.avatar-lg {
  width: 56px;
  height: 56px;
  font-size: 24px;
}

/* Timeline */
.timeline {
  position: relative;
  padding-left: 24px;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: #E5E7EB;
}
.timeline-item {
  position: relative;
  padding-bottom: 20px;
}
.timeline-item:last-child {
  padding-bottom: 0;
}
.timeline-dot {
  position: absolute;
  left: -20px;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 2px #E5E7EB;
}
.timeline-dot.blue {
  background: var(--primary-500);
  box-shadow: 0 0 0 2px #BCCFFF;
}
.timeline-dot.green {
  background: #22C55E;
  box-shadow: 0 0 0 2px #ECFDF5;
}
.timeline-dot.gray {
  background: #D1D5DB;
  box-shadow: 0 0 0 2px #F3F4F6;
}
.timeline-time {
  font-size: 11px;
  color: #9CA3AF;
  margin-bottom: 4px;
}
.timeline-content {
  font-size: 13px;
  color: #4B5563;
  line-height: 1.6;
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
</style>
