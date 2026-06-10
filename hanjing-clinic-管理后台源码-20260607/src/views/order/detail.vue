<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'

const route = useRoute()
const router = useRouter()
const orderId = ref(route.params.id as string || '1')

/* ---- Order Data ---- */
const order = ref({
  id: orderId.value,
  no: '#2026052903',
  status: 'paid', // paid (待发货), shipped (已发货)
  createTime: '2026-05-29 10:22:35',
  patient: '陈建国',
  phone: '135****8901',
  address: '深圳市福田区深南大道财富大厦A座3楼 鼾静健康福田门诊部',
  price: 8900,
  productName: 'CPAP呼吸机',
  productDesc: '瑞思迈 AirSense 10 自动调压版',
  productIcon: '💨',
  qty: 1
})

const showShip = ref(false)
const carrier = ref('顺丰速运')
const trackingNo = ref('')

function handleBack() {
  router.push('/order')
}

function handlePrint() {
  MessagePlugin.success('打印小票成功')
}

function handleConfirmShip() {
  if (order.value.status === 'shipped') {
    MessagePlugin.info('订单已完成发货')
    return
  }
  showShip.value = true
}

function submitShip() {
  if (!trackingNo.value.trim()) {
    MessagePlugin.warning('请填写快递单号')
    return
  }
  order.value.status = 'shipped'
  showShip.value = false
  MessagePlugin.success(`发货成功！快递单号：${trackingNo.value}`)
}
</script>

<template>
  <div class="page-container">


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">
          {{ order.no }}
          <span class="status-tag gold" v-if="order.status === 'paid'">待发货</span>
          <span class="status-tag green" v-else-if="order.status === 'shipped'">已发货</span>
        </div>
        <div class="page-title-sub">下单时间 {{ order.createTime }}</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-outline" @click="handlePrint">🖨️ 打印</button>
        <button class="btn btn-primary" @click="handleConfirmShip">📦 确认发货</button>
      </div>
    </div>

    <!-- Grid: Merchandise & Recipient Info -->
    <div class="card-grid-2">
      <!-- Merchandise Info -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header"><div class="panel-title">📦 商品信息</div></div>
        <div class="panel-body">
          <div style="display: flex; gap: 14px; align-items: flex-start;">
            <div class="product-icon-lg">{{ order.productIcon }}</div>
            <div style="flex: 1;">
              <div style="font-size: 16px; font-weight: 700; color: #111827;">{{ order.productName }}</div>
              <div style="font-size: 12px; color: #6B7280; margin-top: 2px;">{{ order.productDesc }}</div>
              <div style="font-size: 12px; color: #9CA3AF; margin-top: 6px;">× {{ order.qty }}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 20px; font-weight: 800; color: var(--primary-500);">¥{{ order.price.toLocaleString() }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Recipient Info -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header"><div class="panel-title">🧑‍⚕️ 收货信息</div></div>
        <div class="info-grid">
          <div class="info-item"><div class="info-label">收货人</div><div class="info-value">{{ order.patient }}</div></div>
          <div class="info-item"><div class="info-label">联系电话</div><div class="info-value">{{ order.phone }}</div></div>
          <div class="info-item" style="grid-column: span 2;">
            <div class="info-label">收货地址</div>
            <div class="info-value" style="font-size: 13px; line-height: 1.5;">{{ order.address }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Commission Panel -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">💰 分销佣金</div></div>
      <div class="panel-body">
        <div class="commission-flow">
          <div class="commission-card blue-bg">
            <div class="comm-label">一级推广员</div>
            <div class="comm-name">赵芳芳</div>
            <div class="comm-value">¥1,068</div>
            <div class="comm-percent">12%</div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="commission-card gold-bg">
            <div class="comm-label">二级推广员</div>
            <div class="comm-name">李雪琴</div>
            <div class="comm-value">¥267</div>
            <div class="comm-percent">3%</div>
          </div>
          <div class="flow-arrow">→</div>
          <div class="commission-card green-bg">
            <div class="comm-label">平台收入</div>
            <div class="comm-name">—</div>
            <div class="comm-value" style="color: var(--success-500);">¥7,565</div>
            <div class="comm-percent">85%</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Order Timeline -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title">📋 订单流程</div></div>
      <div class="panel-body">
        <div class="timeline">
          <div class="timeline-item">
            <div class="timeline-dot green"></div>
            <div class="timeline-time">5/29 10:22</div>
            <div class="timeline-content"><strong>下单成功</strong> — 微信支付 ¥8,900.00（交易号：wx20260529102235）</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot green"></div>
            <div class="timeline-time">5/29 10:22</div>
            <div class="timeline-content"><strong>支付成功</strong> — 佣金冻结：一级 ¥1,068 / 二级 ¥267</div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot" :class="order.status === 'shipped' ? 'green' : 'gold'"></div>
            <div class="timeline-time">5/29 10:23</div>
            <div class="timeline-content">
              <strong>{{ order.status === 'shipped' ? '已发货' : '待发货' }}</strong> — 
              {{ order.status === 'shipped' ? '顺丰速运单号 ' + trackingNo : '等待仓库发出CPAP设备' }}
            </div>
          </div>
          <div class="timeline-item">
            <div class="timeline-dot gray"></div>
            <div class="timeline-time">待处理</div>
            <div class="timeline-content" style="color: #9CA3AF;">确认收货 → 佣金解冻 → 7天售后期满</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Ship Dialog -->
    <t-dialog
      v-model:visible="showShip"
      header="录入发货信息"
      @confirm="submitShip"
      :cancelBtn="null"
    >
      <div class="form-container" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label class="form-label">物流公司</label>
          <select class="form-control" v-model="carrier">
            <option>顺丰速运</option>
            <option>中通快递</option>
            <option>圆通速递</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">快递单号</label>
          <input type="text" class="form-control" v-model="trackingNo" placeholder="请输入快递单号">
        </div>
      </div>
    </t-dialog>
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

/* Panels */
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

/* Product Icon */
.product-icon-lg {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  background: linear-gradient(135deg, #FFF7ED, #FFEDD5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  flex-shrink: 0;
}

/* Commission Flow Styling */
.commission-flow {
  display: flex;
  gap: 24px;
  align-items: center;
}
.commission-card {
  flex: 1;
  padding: 16px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}
.commission-card.blue-bg {
  background: var(--primary-100);
}
.commission-card.gold-bg {
  background: #FFF9E6;
}
.commission-card.green-bg {
  background: #ECFDF5;
}

.comm-label {
  font-size: 12px;
  color: #6B7280;
  margin-bottom: 4px;
}
.comm-name {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}
.comm-value {
  font-size: 20px;
  font-weight: 800;
  color: var(--primary-500);
  margin-top: 4px;
}
.comm-percent {
  font-size: 11px;
  color: #9CA3AF;
  margin-top: 2px;
}

.flow-arrow {
  font-size: 20px;
  color: #D1D5DB;
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
.timeline-dot.green {
  background: #22C55E;
  box-shadow: 0 0 0 2px #ECFDF5;
}
.timeline-dot.gold {
  background: #F59E0B;
  box-shadow: 0 0 0 2px #FFFBEB;
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

/* Dialog Form */
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
  padding: 10px 14px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 14px;
  color: #1F2937;
  outline: none;
}
select.form-control {
  appearance: auto;
}

/* Status Tags */
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
.status-tag.gold {
  background: #FFF9E6;
  color: #D97706;
}
.status-tag.gold::before {
  background: #F59E0B;
}
</style>
