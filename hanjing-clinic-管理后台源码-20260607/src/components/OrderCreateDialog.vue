<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { createCashierSession, fetchCheckoutProducts, type CheckoutProduct } from '@/utils/checkoutProducts'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: []; created: [id: string] }>()
const cashier = createCashierSession(request)
const stores = ref<{ id: number; name: string }[]>([])
const products = ref<CheckoutProduct[]>([])
const patients = ref<{ label: string; value: string }[]>([])
const patient = ref('')
const store = ref('')
const productId = ref('')
const quantities = ref<Record<string, number>>({})
const method = ref<'cash' | 'wechat'>('wechat')
const confirmed = ref(false)
const busy = ref(false)
const loading = ref(false)
const failed = ref(false)
const uncertain = ref(false)
let searchVersion = 0
const items = computed(() => products.value.filter(p => quantities.value[p.id]).map(p => ({
  product_id: p.id, product_name: p.name, price: p.price, quantity: quantities.value[p.id]
})))
const total = computed(() => items.value.reduce((sum, item) => sum + item.price * item.quantity, 0))

watch(() => props.visible, async visible => {
  if (!visible) { searchVersion++; return }
  cashier.reset()
  patients.value = []
  patient.value = ''
  store.value = ''
  productId.value = ''
  quantities.value = {}
  confirmed.value = false
  method.value = 'wechat'
  uncertain.value = false
  failed.value = false
  loading.value = true
  try {
    const [locations, catalog] = await Promise.all([
      request.get('/api/admin/orders/cashier-stores'), fetchCheckoutProducts(request)
    ])
    stores.value = locations.data || []
    products.value = catalog
    if (stores.value.length === 1) store.value = String(stores.value[0].id)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})

async function searchPatients(value: string) {
  const version = ++searchVersion
  if (!value.trim()) return
  try {
    const result = await request.get('/api/admin/patients', { params: { search: value.trim() } })
    if (version !== searchVersion) return
    const rows = Array.isArray(result.data) ? result.data : result.data?.list || []
    patients.value = rows.map((row: any) => ({
      value: String(row.id), label: row.name + (row.phone ? ' · ' + row.phone : '')
    }))
  } catch {
    // The shared request client displays the error.
  }
}

function addProduct() {
  if (!productId.value) return
  quantities.value[productId.value] = (quantities.value[productId.value] || 0) + 1
  productId.value = ''
}

async function submit() {
  if (busy.value || loading.value || failed.value) return
  if (!patient.value || !store.value || !items.value.length ||
      items.value.some(item => !Number.isSafeInteger(item.quantity) || item.quantity < 1) ||
      (method.value === 'cash' && !confirmed.value)) {
    MessagePlugin.warning('请选择患者、门店和商品，并确认收款方式')
    return
  }
  busy.value = true
  try {
    const result = await cashier.submit({
      patient_id: Number(patient.value), store_id: Number(store.value), items: items.value,
      pay_amount: total.value, discount_amount: 0, pay_method: method.value,
      payment_confirmed: method.value === 'cash', type: 'offline'
    })
    if (!result.data?.order_id) throw new Error('订单结果未确认')
    MessagePlugin.success('订单已创建')
    emit('created', String(result.data.order_id))
  } catch (error: any) {
    uncertain.value = ![400, 401, 403, 404].includes(error.response?.status)
    if (uncertain.value) MessagePlugin.warning('创建结果未确认，请重试核对原订单')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <t-dialog :visible="visible" header="创建订单" dialog-class-name="order-create-modal" width="min(720px, 94vw)" :footer="false"
    :close-btn="!busy && !uncertain" :close-on-esc-keydown="!busy && !uncertain" :close-on-overlay-click="false" @close="emit('close')">
    <form class="order-form" @submit.prevent="submit">
      <p v-if="failed" role="alert">商品或门店加载失败，请关闭后重试。</p>
      <fieldset :disabled="busy || uncertain || loading || failed">
        <div class="order-fields">
        <label>患者
          <t-select v-model="patient" filterable placeholder="输入姓名或手机号搜索" :options="patients" @search="searchPatients" />
        </label>
        <label>收款门店
          <t-select v-model="store" placeholder="请选择收款门店">
            <t-option v-for="location in stores" :key="location.id" :value="String(location.id)" :label="location.name" />
          </t-select>
        </label>
        </div>
        <section class="order-section">
        <h3>商品明细</h3>
        <div class="product-picker">
          <t-select v-model="productId" filterable placeholder="搜索并选择商品">
            <t-option v-for="product in products" :key="product.id" :value="product.id" :label="product.name" />
          </t-select>
          <t-button variant="outline" :disabled="!productId" @click="addProduct">添加</t-button>
        </div>
        <div v-for="item in items" :key="item.product_id" class="product-row">
          <span>{{ item.product_name }} · ¥{{ (item.price / 100).toFixed(2) }}</span>
          <input v-model.number="quantities[item.product_id]" type="number" min="1" step="1" aria-label="商品数量">
          <t-button variant="text" @click="delete quantities[item.product_id]">移除</t-button>
        </div>
        <p v-if="!items.length" class="order-empty">请选择商品并添加到订单</p>
        </section>
        <section class="order-section">
        <h3>收款方式</h3>
        <div class="order-methods" role="group" aria-label="收款方式">
          <label :class="{ 'is-selected': method === 'wechat' }">
            <input v-model="method" name="order-pay-method" type="radio" value="wechat" @change="confirmed = false">
            小程序支付
          </label>
          <label :class="{ 'is-selected': method === 'cash' }">
            <input v-model="method" name="order-pay-method" type="radio" value="cash" @change="confirmed = false">
            现金支付
          </label>
        </div>
        <label v-if="method === 'cash'" class="cash-confirm"><input v-model="confirmed" type="checkbox"> 已确认实际收到现金</label>
        <p v-else class="order-hint">请提醒患者在小程序的「我的订单」完成支付。</p>
        </section>
      </fieldset>
      <div class="order-footer">
        <div class="order-total"><span>应付金额</span><strong>¥{{ (total / 100).toFixed(2) }}</strong></div>
        <t-button v-if="!uncertain" variant="outline" :disabled="busy" @click="emit('close')">取消</t-button>
        <t-button type="submit" theme="primary" :loading="busy" :disabled="loading || failed">
          {{ uncertain ? '核对原订单' : '确认创建' }}
        </t-button>
      </div>
    </form>
  </t-dialog>
</template>

<style scoped>
.order-form, fieldset, label { display: grid; gap: 16px; }
.order-form { max-height: calc(100dvh - 150px); overflow-y: auto; }
.order-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.order-section { display: grid; gap: 10px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
.order-section h3 { margin: 0; font-size: 14px; font-weight: 600; color: #1f2937; }
.order-empty, .order-hint { margin: 0; font-size: 13px; color: #6b7280; }
.order-empty { padding: 14px; border-radius: 8px; background: #f5f7fa; text-align: center; }
.product-row input { padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
.order-methods { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.order-methods label { display: flex; justify-content: center; align-items: center; min-height: 40px; padding: 0 8px; border: 1px solid #dfe3eb; border-radius: 8px; cursor: pointer; }
.order-methods .is-selected { color: var(--td-brand-color, #3b6bf5); border-color: currentColor; background: var(--td-brand-color-light, #f1f5ff); }
.order-methods input { accent-color: var(--td-brand-color, #3b6bf5); }
:global(.order-create-modal.t-dialog) { padding-bottom: var(--td-comp-paddingTB-xxl, 24px); }
:global(.order-create-modal .t-dialog__body) { padding-bottom: 0; }
.order-total { flex: 1; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; color: #374151; }
.order-total strong { color: var(--td-brand-color, #3b6bf5); font-size: 23px; font-variant-numeric: tabular-nums; }
@media (max-width: 520px) {
  .order-fields { grid-template-columns: minmax(0, 1fr); }
  .order-footer { flex-wrap: wrap; }
  .order-total { flex-basis: 100%; }
}
fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
label { gap: 6px; }
.product-picker, .product-row, .order-footer { display: flex; align-items: center; gap: 12px; }
.product-picker > :first-child, .product-row > span, .order-footer > strong { flex: 1; min-width: 0; }
.product-row { padding: 8px 12px; background: #f5f7fa; border-radius: 8px; }
.product-row input { width: 64px; }
.cash-confirm { display: flex; align-items: center; }
.order-footer { padding-top: 12px; border-top: 1px solid #edf0f4; }
</style>
