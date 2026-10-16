<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { createNativePay, submitMicropay, getAdminPayStatus, cancelAdminPayOrder } from '@/utils/wechatCashier'

const props = defineProps<{ order: any }>()
const emit = defineEmits<{ changed: [] }>()
const superAdmin = ref(false)
const canEdit = ref(false)
const busy = ref(false)
const paymentVisible = ref(false)
const refundVisible = ref(false)
const error = ref('')
const qr = ref('')
const authCode = ref('')
const refund = reactive({ amount: 0, method: 'cash', time: '', reference: '', evidence: '', confirmed: false })
const pending = computed(() => props.order.status === 'pending' && ['wechat_native', 'wechat_micropay'].includes(props.order.pay_method))
const offlineEligible = computed(() => superAdmin.value && ['cash', 'bank'].includes(props.order.pay_method) && props.order.pay_at &&
  ['paid', 'processing', 'shipping', 'shipped', 'delivered', 'completed', 'refund_pending'].includes(props.order.status))
const wechatRefund = computed(() => superAdmin.value && ['wechat', 'wechat_native', 'wechat_micropay'].includes(props.order.pay_method) &&
  ['refund_pending', 'refunding'].includes(props.order.status))

onMounted(async () => {
  try {
    const response: any = await request.get('/api/admin/me')
    superAdmin.value = response.data?.role_code === 'super_admin'
    canEdit.value = superAdmin.value || response.data?.permissions?.includes('order:edit')
  } catch { /* Authorization remains enforced by the API. */ }
})

async function perform(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await action() }
  catch (e: any) { error.value = e?.response?.data?.message || e?.message || '操作失败，请核对后重试' }
  finally { busy.value = false }
}

async function refreshPayment() {
  const result = await getAdminPayStatus(props.order.id)
  if (result.status !== 'pending') {
    paymentVisible.value = false
    qr.value = ''
    emit('changed')
    MessagePlugin.info('付款状态已更新，请查看订单记录')
  } else MessagePlugin.info('尚未确认收款，请勿重复创建订单')
}

function continuePayment() {
  return perform(async () => {
    if (props.order.pay_method === 'wechat_native') {
      const result = await createNativePay(props.order.id)
      qr.value = result.qrCodeImageUrl || ''
      if (result.paid) await refreshPayment()
    } else {
      if (!/^\d{18}$/.test(authCode.value.trim())) throw new Error('请输入18位微信付款码')
      await submitMicropay(props.order.id, authCode.value.trim())
      authCode.value = ''
      await refreshPayment()
    }
  })
}

function cancelPayment() {
  if (!window.confirm('确认取消这笔未付款订单？将核对支付渠道结果；预约不会自动取消。')) return
  return perform(async () => {
    await cancelAdminPayOrder(props.order.id)
    paymentVisible.value = false
    qr.value = ''
    emit('changed')
    MessagePlugin.success('付款单已取消，预约仍保留')
  })
}

function openRefund() {
  const now = new Date()
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19)
  Object.assign(refund, { amount: Number(props.order.pay_amount) / 100, method: props.order.pay_method, time: localTime, reference: '', evidence: '', confirmed: false })
  error.value = ''
  refundVisible.value = true
}

function registerRefund() {
  return perform(async () => {
    if (!refund.confirmed || (!refund.reference.trim() && !refund.evidence.trim())) throw new Error('请确认实际退款，并填写流水或凭证')
    const amount = Math.round(Number(refund.amount) * 100)
    const date = new Date(refund.time)
    if (amount !== Number(props.order.pay_amount) || !Number.isFinite(date.getTime())) throw new Error('请输入全额实收金额和有效退款时间')
    const result: any = await request.post(`/api/admin/orders/${props.order.id}/offline-refund`, {
      amount, method: refund.method, refunded_at: date.toISOString(), reference: refund.reference, evidence: refund.evidence, confirmed: true
    })
    refundVisible.value = false
    emit('changed')
    MessagePlugin.success(result.message || '实际退款已登记')
  })
}

function handleWechatRefund() {
  if (!props.order.wechat_refund_no && !window.confirm('确认向支付渠道提交整笔原路退款？提交后以渠道结果为准。')) return
  return perform(async () => {
    try {
      const result: any = props.order.wechat_refund_no
        ? await request.post(`/api/admin/orders/${props.order.id}/refund-sync`)
        : await request.put(`/api/admin/orders/${props.order.id}/refund`, { approve: true })
      MessagePlugin.info(result.message)
    } finally {
      // A provider timeout can occur after the refund reference was committed.
      emit('changed')
    }
  })
}
</script>

<template>
  <t-button v-if="pending && canEdit" theme="primary" @click="error = ''; paymentVisible = true">处理原付款单</t-button>
  <t-button v-if="offlineEligible" theme="default" @click="openRefund">登记线下退款</t-button>
  <t-button v-if="wechatRefund" theme="default" :loading="busy" @click="handleWechatRefund">{{ order.wechat_refund_no ? '同步退款结果' : '确认原路退款' }}</t-button>
  <span v-if="error && !paymentVisible && !refundVisible" class="payment-error" role="alert">{{ error }}</span>

  <t-dialog v-model:visible="paymentVisible" header="原付款单" placement="center" width="min(520px, 94vw)" :footer="false" :close-btn="!busy" :close-on-overlay-click="false" :close-on-esc-keydown="!busy">
    <div class="payment-form">
      <div>订单号：{{ order.order_no }}</div>
      <div>应付：¥{{ (Number(order.pay_amount) / 100).toFixed(2) }}</div>
      <label v-if="order.pay_method === 'wechat_micropay'">微信付款码<input v-model="authCode" aria-label="微信付款码" inputmode="numeric" autocomplete="off" maxlength="18" :disabled="busy"></label>
      <img v-if="qr" :src="qr" alt="原订单支付二维码" class="payment-qr">
      <p v-if="error" class="payment-error" role="alert">{{ error }}</p>
      <div class="payment-actions">
        <t-button theme="primary" :loading="busy" @click="continuePayment">{{ order.pay_method === 'wechat_native' ? '获取原单二维码' : '提交付款码' }}</t-button>
        <t-button theme="default" :disabled="busy" @click="perform(refreshPayment)">刷新付款状态</t-button>
        <t-button theme="danger" variant="outline" :disabled="busy" @click="cancelPayment">取消付款单</t-button>
      </div>
    </div>
  </t-dialog>

  <t-dialog v-model:visible="refundVisible" header="登记已实际完成的线下退款" placement="center" width="min(560px, 94vw)" :footer="false" :close-btn="!busy" :close-on-overlay-click="false" :close-on-esc-keydown="!busy">
    <form class="payment-form" @submit.prevent="registerRefund">
      <label>实际退款金额（元）<input v-model.number="refund.amount" aria-label="实际退款金额" type="number" min="0.01" step="0.01" required :disabled="busy"></label>
      <label>实际退款方式<select v-model="refund.method" aria-label="实际退款方式" :disabled="busy"><option value="cash">现金</option><option value="bank">银行转账</option></select></label>
      <label>实际退款时间<input v-model="refund.time" aria-label="实际退款时间" type="datetime-local" step="1" required :disabled="busy"></label>
      <label>退款流水号<input v-model="refund.reference" aria-label="退款流水号" maxlength="150" :disabled="busy"></label>
      <label>凭证编号或存放位置<textarea v-model="refund.evidence" aria-label="凭证编号或存放位置" maxlength="1000" rows="3" :disabled="busy"></textarea></label>
      <label class="payment-confirm"><input v-model="refund.confirmed" aria-label="已核实款项实际退还" type="checkbox" required :disabled="busy">已核实款项实际退还</label>
      <p v-if="error" class="payment-error" role="alert">{{ error }}</p>
      <t-button type="submit" theme="primary" :loading="busy">登记实际退款</t-button>
    </form>
  </t-dialog>
</template>

<style scoped>
.payment-form { display: grid; gap: 14px; min-width: 0; max-height: calc(100dvh - 180px); overflow-y: auto; overflow-wrap: anywhere; padding-right: 2px; }
.payment-form label { display: grid; gap: 6px; font-size: 14px; }
.payment-form input, .payment-form select, .payment-form textarea { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid #d1d5db; border-radius: 4px; padding: 8px 10px; font: inherit; background: #fff; color: #111827; }
.payment-form textarea { resize: vertical; }
.payment-form .payment-confirm { display: flex; align-items: center; }
.payment-confirm input { width: 18px; height: 18px; }
.payment-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.payment-error { color: #be123c; margin: 0; overflow-wrap: anywhere; }
.payment-qr { width: 220px; height: 220px; max-width: 100%; object-fit: contain; justify-self: center; }
</style>
