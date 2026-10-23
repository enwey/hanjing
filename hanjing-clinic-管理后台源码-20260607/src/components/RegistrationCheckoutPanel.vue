<script setup lang="ts">
import type { BillingItem } from '@/utils/checkoutProducts'

defineProps<{
  patientName: string
  items: BillingItem[]
  discountAmount: number
  totalAmount: number
  payableAmount: number
  payMethod: 'cash' | 'wechat'
  loading: boolean
  wechatSubmitText: string
}>()

const emit = defineEmits<{
  'update:discountAmount': [value: number]
  'update:payMethod': [value: 'cash' | 'wechat']
  close: []
  submit: []
}>()
</script>

<template>
  <div class="registration-checkout-panel">
    <div class="checkout-intro">正在为患者 <strong>{{ patientName }}</strong> 开立收费结算账单：</div>

    <table class="billing-table">
      <thead>
        <tr>
          <th>项目/商品名称</th>
          <th class="price-column">单价</th>
          <th class="quantity-column">数量</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.product_id">
          <td><div class="fixed-field">{{ item.product_name }}</div></td>
          <td>¥{{ (item.price / 100).toFixed(2) }}</td>
          <td><div class="fixed-quantity">1</div></td>
        </tr>
      </tbody>
    </table>

    <div class="discount-row">
      <label>卡券折扣金额 (元)</label>
      <t-input-number
        :model-value="discountAmount"
        :min="0"
        :step="1000"
        :format="(value: string | number) => `¥${(Number(value) / 100).toFixed(2)}`"
        style="width: 100%;"
        @update:model-value="emit('update:discountAmount', Number($event || 0))"
      />
    </div>

    <div class="amount-summary">
      <div><span>项目总额：</span><span>¥{{ (totalAmount / 100).toFixed(2) }}</span></div>
      <div><span>优惠折扣：</span><span>- ¥{{ (discountAmount / 100).toFixed(2) }}</span></div>
      <div class="payable"><span>应付金额：</span><span>¥{{ (payableAmount / 100).toFixed(2) }}</span></div>
    </div>

    <div class="payment-section">
      <div class="section-label">支付方式</div>
      <div class="payment-options">
        <label class="pay-method-label" :class="{ active: payMethod === 'cash' }">
          <input type="radio" value="cash" :checked="payMethod === 'cash'" @change="emit('update:payMethod', 'cash')">
          <AppIcon name="money" /> 现金支付
        </label>
        <label class="pay-method-label" :class="{ active: payMethod === 'wechat' }">
          <input type="radio" value="wechat" :checked="payMethod === 'wechat'" @change="emit('update:payMethod', 'wechat')">
          小程序支付
        </label>
      </div>
      <div class="payment-tip">
        {{ payMethod === 'cash'
          ? '确认后表示线下现金已经收妥，系统将登记为已支付。'
          : '系统将生成待支付预约订单，用户可在小程序预约详情中完成支付，并在已授权通知时收到微信提醒。' }}
      </div>
    </div>

    <div class="checkout-actions">
      <t-button theme="default" @click="emit('close')">关闭收银</t-button>
      <t-button theme="primary" :loading="loading" @click="emit('submit')">
        {{ payMethod === 'wechat' ? wechatSubmitText : '确认现金收款' }} · ¥{{ (payableAmount / 100).toFixed(2) }}
      </t-button>
    </div>
  </div>
</template>

<style scoped>
.registration-checkout-panel { padding: 10px 0; }
.checkout-intro { margin-bottom: 16px; color: #374151; font-size: 14px; }
.billing-table { width: 100%; margin-bottom: 16px; border-collapse: collapse; }
.billing-table th { padding: 8px; border-bottom: 1px solid #E5E7EB; background: #F9FAFB; color: #4B5563; font-size: 12px; text-align: left; }
.billing-table td { padding: 8px; border-bottom: 1px solid #F3F4F6; color: #374151; font-size: 13px; }
.price-column { width: 100px; }
.quantity-column { width: 60px; }
.fixed-field, .fixed-quantity { display: flex; align-items: center; min-height: 30px; box-sizing: border-box; border: 1px solid #E5E7EB; border-radius: 6px; background: #F9FAFB; }
.fixed-field { padding: 0 8px; }
.fixed-quantity { justify-content: center; }
.discount-row { margin-bottom: 16px; }
.discount-row label, .section-label { display: block; margin-bottom: 8px; color: #374151; font-size: 13px; font-weight: 600; }
.amount-summary { margin-bottom: 20px; padding: 14px; border-radius: 8px; background: #F9FAFB; }
.amount-summary > div { display: flex; justify-content: space-between; margin-bottom: 6px; color: #4B5563; font-size: 13px; }
.amount-summary .payable { margin: 0; padding-top: 8px; border-top: 1px dashed #D1D5DB; color: #111827; font-size: 15px; font-weight: 700; }
.amount-summary .payable span:last-child { color: #EF4444; }
.payment-section { margin-bottom: 24px; }
.payment-options { display: flex; gap: 12px; }
.pay-method-label { flex: 1; display: flex; align-items: center; justify-content: center; height: 40px; border: 1px solid #D1D5DB; border-radius: 8px; font-size: 13px; cursor: pointer; }
.pay-method-label input { display: none; }
.pay-method-label.active { border-color: var(--primary-500); background: var(--primary-50); color: var(--primary-600); font-weight: 600; }
.payment-tip { margin-top: 10px; color: #64748B; font-size: 12px; line-height: 1.6; }
.checkout-actions { display: flex; justify-content: flex-end; gap: 10px; }
</style>
