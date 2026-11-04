<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { QRCode } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'

interface Charge {
  id: string | number
  charge_no: string
  consult_fee: number
  deposit_amount: number
  status: string
  payment_method?: string
  paid_at?: string
  refund_status?: string
  code_url?: string
  qr_code_url?: string
}
interface ChargeData {
  charges: Charge[]
  appointment?: { id: string | number; status: string; consult_fee: number; deposit_amount: number; appointment_no?: string; patient_name?: string; doctor_name?: string; store_name?: string; appointment_date?: string; appointment_time?: string }
  legacy_order_id?: string | number
}
type Method = 'cash' | 'wechat'

const emit = defineEmits<{ changed: []; closed: [id: string] }>()
const router = useRouter()
const visible = ref(false)
const busy = ref(false)
const needsRefresh = ref(false)
const appointmentId = ref('')
const data = ref<ChargeData>()
const method = ref<Method>('cash')
const paymentConfirmed = ref(false)
const error = ref('')
const qr = ref('')
const canEditCharge = ref(false)
const canApproveRefund = ref(false)
const refundId = ref<string | number>()
const reason = ref('')
const offlineRefundConfirmed = ref(false)
const base = computed(() => '/api/admin/appointments/' + encodeURIComponent(appointmentId.value) + '/charges')
const active = computed(() => data.value?.charges.find(charge =>
  ['pending', 'paid', 'refund_pending', 'refunding'].includes(charge.status)
))
const canCollect = computed(() => {
  const appointment = data.value?.appointment
  return canEditCharge.value && !!appointment && appointment.status === 'pending_payment' &&
    Number(appointment.consult_fee) + Number(appointment.deposit_amount) > 0 && !active.value && !data.value?.legacy_order_id
})

function amount(value: number) {
  return '¥' + (Number(value || 0) / 100).toFixed(2)
}

function chargeLabel(status: string) {
  return ({
    pending: '待支付', paid: '已收款', refund_pending: '待退款', refunding: '退款处理中',
    refunded: '已退款', cancelled: '已取消', failed: '处理失败', abnormal: '退款异常', closed: '退款已关闭'
  } as Record<string, string>)[status] || status
}

async function refresh() {
  const response = await request.get<ChargeData>(base.value)
  data.value = response.data
  needsRefresh.value = false
  const native = response.data?.charges.find(charge => charge.status === 'pending' && charge.payment_method === 'wechat_native')
  qr.value = native ? (native.qr_code_url || qr.value) : ''
}

async function perform(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || '操作失败，请重新查询收费状态'
  } finally {
    busy.value = false
  }
}

async function open(id: string | number) {
  if (busy.value) return
  appointmentId.value = String(id)
  data.value = undefined
  needsRefresh.value = false
  refundId.value = undefined
  method.value = 'cash'
  paymentConfirmed.value = false
  qr.value = ''
  try {
    const operator = JSON.parse(localStorage.getItem('user_info') || '{}')
    canApproveRefund.value = operator?.role_code === 'super_admin' || Boolean(operator?.permissions?.includes('appointment:refund'))
    canEditCharge.value = operator?.role_code === 'super_admin' || Boolean(operator?.permissions?.includes('appointment:charge'))
  } catch {
    canApproveRefund.value = false
    canEditCharge.value = false
  }
  visible.value = true
  await perform(refresh)
}

function close() {
  if (busy.value || !visible.value) return
  visible.value = false
  emit('closed', appointmentId.value)
}

function collect(paymentMethod: Method | 'wechat_native' = method.value) {
  if (needsRefresh.value || !canEditCharge.value || (paymentMethod === 'cash' && !paymentConfirmed.value)) return
  return perform(async () => {
    needsRefresh.value = true
    const response = await request.post<Charge>(base.value, {
      method: paymentMethod,
      payment_confirmed: paymentMethod === 'cash' ? true : undefined
    })
    qr.value = response.data?.code_url || ''
    await refresh()
    emit('changed')
  })
}

function sync(charge: Charge, kind: 'sync' | 'refund-sync') {
  if (needsRefresh.value || (kind === 'sync' ? !canEditCharge.value : !canApproveRefund.value)) return
  return perform(async () => {
    needsRefresh.value = true
    await request.post(base.value + '/' + charge.id + '/' + kind)
    await refresh()
    emit('changed')
  })
}

function canRefund(charge: Charge) {
  return canApproveRefund.value && (charge.status === 'refund_pending' ||
    (charge.status === 'paid' && ['cancelled', 'no_show'].includes(data.value?.appointment?.status || '')))
}

function showRefund(charge: Charge) {
  refundId.value = charge.id
  reason.value = ''
  offlineRefundConfirmed.value = false
}

function refund(charge: Charge) {
  if (needsRefresh.value || !canRefund(charge) || !reason.value.trim()) return
  if (!String(charge.payment_method || '').startsWith('wechat') && !offlineRefundConfirmed.value) return
  return perform(async () => {
    needsRefresh.value = true
    await request.post(base.value + '/' + charge.id + '/refund', {
      reason: reason.value.trim(),
      offline_confirmed: offlineRefundConfirmed.value
    })
    refundId.value = undefined
    await refresh()
    emit('changed')
  })
}

function openLegacyOrder() {
  if (!data.value?.legacy_order_id) return
  const id = data.value.legacy_order_id
  visible.value = false
  void router.push({ name: 'order-detail', params: { id } })
}

function printReceipt(charge: Charge) {
  const tab = window.open('', '_blank', 'width=420,height=650')
  if (!tab) {
    error.value = '打印窗口未打开，请允许弹出窗口后重试。'
    return
  }
  tab.opener = null
  const doc = tab.document
  doc.title = '预约收费凭证'
  const style = doc.createElement('style')
  style.textContent = `
    @page { margin: 3mm; }
    * { box-sizing: border-box; }
    body { width: 100%; max-width: 72mm; margin: 0 auto; color: #000; font: 12px/1.5 "Microsoft YaHei", sans-serif; }
    header, footer { text-align: center; }
    h1 { font-size: 17px; margin: 0; }
    h2 { font-size: 14px; margin: 4px 0 0; }
    section, footer { border-top: 1px dashed #000; margin-top: 10px; padding-top: 8px; }
    .row { display: grid; grid-template-columns: 60px minmax(0, 1fr); gap: 6px; margin: 3px 0; overflow-wrap: anywhere; }
    .money { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
    .total { font-size: 16px; font-weight: 700; margin-top: 7px; }
    @media screen { body { padding: 16px 8px; } }
  `
  doc.head.append(style)
  const appendText = (parent: HTMLElement, tag: string, text: string) => {
    const element = doc.createElement(tag)
    element.textContent = text
    parent.append(element)
    return element
  }
  const row = (parent: HTMLElement, label: string, value: string, className = 'row') => {
    if (!value) return
    const element = doc.createElement('div')
    element.className = className
    appendText(element, 'span', label)
    appendText(element, 'span', value)
    parent.append(element)
  }
  const appointment = data.value?.appointment
  const header = appendText(doc.body, 'header', '')
  appendText(header, 'h1', '深圳兴康明诊所')
  appendText(header, 'h2', '预约收费凭证')
  const visit = appendText(doc.body, 'section', '')
  row(visit, '预约编号', appointment?.appointment_no || '')
  row(visit, '收费单号', charge.charge_no)
  row(visit, '就诊患者', appointment?.patient_name || '')
  row(visit, '就诊门店', appointment?.store_name || '')
  row(visit, '就诊医生', appointment?.doctor_name || '')
  row(visit, '就诊时间', [appointment?.appointment_date, appointment?.appointment_time].filter(Boolean).join(' '))
  const fees = appendText(doc.body, 'section', '')
  if (Number(charge.consult_fee) > 0) row(fees, '挂号费', amount(charge.consult_fee), 'money')
  if (Number(charge.deposit_amount) > 0) row(fees, '预约定金', amount(charge.deposit_amount), 'money')
  row(fees, '实收金额', amount(Number(charge.consult_fee) + Number(charge.deposit_amount)), 'money total')
  const payment = appendText(doc.body, 'section', '')
  const methods: Record<string, string> = { cash: '现金支付', wechat: '微信支付', wechat_native: '微信扫码', offline: '线下收款' }
  row(payment, '支付方式', methods[charge.payment_method || ''] || '')
  row(payment, '收款时间', charge.paid_at ? formatShanghaiDateTime(charge.paid_at) : '')
  row(payment, '收费状态', chargeLabel(charge.status))
  appendText(doc.body, 'footer', '请妥善保管此凭证')
  tab.focus()
  tab.print()
}

defineExpose({ open })
</script>

<template>
  <t-dialog :visible="visible" header="预约收费" dialog-class-name="appointment-charge-modal" width="min(600px, 94vw)"
    :footer="false" :close-btn="!busy" :close-on-overlay-click="false" :close-on-esc-keydown="!busy"
    @close="close">
    <div class="charge-dialog">
      <p v-if="error" class="charge-error" role="alert">{{ error }}</p>
      <t-button v-if="error" variant="outline" :disabled="busy" @click="perform(refresh)">刷新收费状态</t-button>
      <p v-if="busy && !data" role="status">正在查询收费记录…</p>
      <div v-if="data?.legacy_order_id" class="charge-card">
        <span>此预约已有历史收费订单。</span>
        <t-button variant="outline" @click="openLegacyOrder">处理原收费订单</t-button>
      </div>
      <section v-if="data?.appointment" class="charge-totals" aria-label="费用明细">
        <div class="charge-total-main">
          <span>预约费用</span>
          <strong>{{ amount(Number(data.appointment.consult_fee) + Number(data.appointment.deposit_amount)) }}</strong>
        </div>
        <dl class="charge-breakdown">
          <div><dt>挂号费</dt><dd>{{ amount(data.appointment.consult_fee) }}</dd></div>
          <div><dt>预约定金</dt><dd>{{ amount(data.appointment.deposit_amount) }}</dd></div>
        </dl>
      </section>
      <form v-if="canCollect" class="charge-form" @submit.prevent="collect()">
        <fieldset class="charge-methods">
          <legend>收款方式</legend>
          <div class="charge-method-options">
            <label v-for="option in [{ value: 'cash', label: '现金支付' }, { value: 'wechat', label: '微信支付' }]"
              :key="option.value" :class="{ 'is-selected': method === option.value }">
              <input v-model="method" type="radio" name="charge-method" :value="option.value" :disabled="busy" @change="paymentConfirmed = false">
              {{ option.label }}
            </label>
          </div>
        </fieldset>
        <label v-if="method === 'cash'" class="charge-confirm">
          <input v-model="paymentConfirmed" type="checkbox" required :disabled="busy"> 已确认实际收到款项
        </label>
        <p v-if="method === 'wechat'" class="charge-hint">请提醒患者到 深圳兴康明诊所 小程序支付</p>
        <div class="charge-footer">
          <t-button variant="outline" :disabled="busy" @click="close">关闭</t-button>
          <t-button type="submit" theme="primary" :loading="busy"
          :disabled="needsRefresh || (method === 'cash' && !paymentConfirmed)">{{ method === 'wechat' ? '生成待支付收费单' : '确认已收款' }}</t-button>
        </div>
      </form>
      <QRCode v-if="qr" :value="qr" :size="220" type="svg" class="charge-qr" aria-label="预约收费微信支付二维码" />
      <article v-for="charge in data?.charges || []" :key="charge.id" class="charge-card">
        <div class="charge-heading">
          <strong>{{ charge.charge_no }}</strong>
          <t-tag variant="light">{{ chargeLabel(charge.status) }}</t-tag>
        </div>
        <div>挂号费 {{ amount(charge.consult_fee) }} · 预约定金 {{ amount(charge.deposit_amount) }}</div>
        <div v-if="charge.refund_status">退款状态 {{ chargeLabel(charge.refund_status) }}</div>
        <p v-if="['abnormal', 'closed'].includes(charge.refund_status || '')" class="charge-error">
          请核对微信商户平台中的退款记录。
        </p>
        <div class="charge-actions">
          <t-button v-if="canEditCharge && charge.status === 'pending' && charge.payment_method === 'wechat_native' && !qr" variant="outline" :disabled="busy || needsRefresh" @click="collect('wechat_native')">获取原收款码</t-button>
          <t-button v-if="canEditCharge && charge.status === 'pending' && String(charge.payment_method || '').startsWith('wechat')" variant="outline" :disabled="busy || needsRefresh" @click="sync(charge, 'sync')">核对支付结果</t-button>
          <t-button v-if="canRefund(charge)" variant="outline" theme="danger" :disabled="busy" @click="showRefund(charge)">退款</t-button>
          <t-button v-if="canApproveRefund && (charge.status === 'refunding' || ['processing', 'refunding'].includes(charge.refund_status || ''))" variant="outline" :disabled="busy || needsRefresh" @click="sync(charge, 'refund-sync')">同步退款结果</t-button>
        </div>
        <form v-if="refundId === charge.id" class="charge-form" @submit.prevent="refund(charge)">
          <label>退款原因<input v-model="reason" class="charge-input" required maxlength="250" :disabled="busy"></label>
          <label v-if="!String(charge.payment_method || '').startsWith('wechat')" class="charge-confirm">
            <input v-model="offlineRefundConfirmed" type="checkbox" required :disabled="busy"> 已核实款项实际退还
          </label>
          <t-button type="submit" theme="danger" :loading="busy" :disabled="needsRefresh">确认全额退款</t-button>
        </form>
      </article>
      <p v-if="data && !canCollect && !data.legacy_order_id && !data.charges.length">暂无收费记录</p>
      <div v-if="!canCollect" class="charge-footer">
        <t-button variant="outline" :disabled="busy" @click="close">关闭</t-button>
        <template v-for="charge in data?.charges || []" :key="charge.id">
          <t-button v-if="charge.paid_at" theme="primary" :disabled="busy" v-permission="'appointment:print'" @click="printReceipt(charge)">打印凭证</t-button>
        </template>
      </div>
    </div>
  </t-dialog>
</template>

<style scoped>
:global(.appointment-charge-modal.t-dialog) { padding-bottom: var(--td-comp-paddingTB-xxl, 24px); }
:global(.appointment-charge-modal .t-dialog__body) { padding-bottom: 0; }
.charge-dialog, .charge-form, .charge-card { display: grid; gap: 12px; }
.charge-dialog { max-height: calc(100dvh - 180px); overflow-y: auto; padding: 0; }
.charge-form label { display: grid; gap: 6px; }
.charge-form .charge-confirm { display: flex; align-items: center; gap: 8px; }
.charge-input { box-sizing: border-box; width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; font: inherit; }
.charge-card { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
.charge-heading, .charge-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.charge-totals { display: grid; gap: 10px; padding: 14px 16px; border: 1px solid var(--td-brand-color-2, #d9e5ff); border-radius: 10px; background: var(--td-brand-color-light, #f1f5ff); }
.charge-total-main { display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #374151; }
.charge-total-main strong { font-size: 28px; line-height: 1.2; color: var(--td-brand-color, #3b6bf5); font-variant-numeric: tabular-nums; }
.charge-breakdown { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 0; font-size: 13px; }
.charge-breakdown div { display: flex; gap: 8px; }
.charge-breakdown dt { color: #6b7280; }
.charge-breakdown dd { margin: 0; font-weight: 600; }
.charge-methods { border: 0; padding: 0; margin: 0; min-width: 0; }
.charge-methods legend { margin-bottom: 8px; font-weight: 600; }
.charge-method-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.charge-method-options label { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 12px; border: 1px solid #dfe3eb; border-radius: 8px; cursor: pointer; }
.charge-method-options .is-selected { color: var(--td-brand-color, #3b6bf5); border-color: currentColor; background: var(--td-brand-color-light, #f1f5ff); }
.charge-method-options input, .charge-confirm input { accent-color: var(--td-brand-color, #3b6bf5); }
.charge-form .charge-confirm { padding: 10px 12px; border-radius: 8px; background: #f5f7fa; font-size: 13px; }
.charge-footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid #edf0f4; }
@media (max-width: 480px) {
  .charge-method-options { grid-template-columns: 1fr; }
  .charge-method-options label { justify-content: flex-start; }
}
.charge-heading { justify-content: space-between; }
.charge-hint { color: #6b7280; margin: 0; font-size: 13px; }
.charge-error { color: #be123c; margin: 0; }
.charge-qr { width: 220px; max-width: 100%; justify-self: center; }
</style>
