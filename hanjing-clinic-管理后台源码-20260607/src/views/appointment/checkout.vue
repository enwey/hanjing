<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { createCheckoutLifecycle, settleCashierAppointment, type CheckoutAttempt } from '@/utils/checkoutLifecycle'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { createNativePay, getAdminPayStatus, isPaidStatus, submitMicropay } from '@/utils/wechatCashier'
import {
  createBillingItem,
  createCashierSession,
  createCheckoutReceiptResult,
  confirmedCashierReceipt,
  fetchCheckoutProducts,
  findCheckoutProduct,
  type BillingItem,
  type CheckoutProduct
} from '@/utils/checkoutProducts'
import TechnicianSelect from '@/components/TechnicianSelect.vue'

const route = useRoute()

interface PatientOption {
  label: string;
  value: string;
  phone: string;
}

const stores = ref<any[]>([])
const selectedStoreId = ref('')
async function fetchStores() {
  try {
    const res: any = await request.get('/api/admin/orders/cashier-stores')
    stores.value = res.data || []
    if (stores.value.length === 1) selectedStoreId.value = String(stores.value[0].id)
  } catch { MessagePlugin.error('获取收款门店失败') }
}
const patients = ref<PatientOption[]>([])
const selectedPatientId = ref<string>((route.query.patientId as string) || '')
const loading = ref(false)

const productOptions = ref<CheckoutProduct[]>([])

// Billing items chosen
const billingItems = ref<BillingItem[]>([])

const discountAmount = ref<number>(0)
const payMethod = ref<string>('wechat_native')
const fulfillmentTechnicianId = ref<string>('')
const checkoutSuccess = ref(false)
const orderResult = ref<any>(null)
const nativePayInfo = ref<any>(null)
const micropayAuthCode = ref('')
const payWaiting = ref(false)
const cashierSession = createCashierSession(request)
const checkoutFlow = createCheckoutLifecycle(() => `${route.fullPath}:${selectedPatientId.value}:${selectedStoreId.value}`)

const deliveryType = ref<string>('offline_direct') // offline_direct (现场提走), online (快递寄送), offline_pending (缺货自提预订)
const shippingReceiver = ref<string>('')
const shippingPhone = ref<string>('')
const shippingAddressStr = ref<string>('')

watch([selectedPatientId, selectedStoreId, () => route.fullPath], () => {
  cashierSession.reset()
  checkoutFlow.begin()
  loading.value = false
  checkoutSuccess.value = false
  orderResult.value = null
  nativePayInfo.value = null
  micropayAuthCode.value = ''
  payWaiting.value = false
}, { flush: 'sync' })
watch(() => route.query.patientId, value => { selectedPatientId.value = String(value || '') })
checkoutFlow.begin()

watch(selectedPatientId, (newVal) => {
  const p = patients.value.find(item => item.value === newVal)
  if (p) {
    shippingReceiver.value = ''
    shippingPhone.value = ''
  }
})

watch(deliveryType, (newVal) => {
  if (newVal === 'online') {
    const freightProduct = findCheckoutProduct(productOptions.value, '运费')
    if (!freightProduct) {
      MessagePlugin.warning('商品管理中暂无上架运费项目，请先配置后再选择快递邮寄')
      deliveryType.value = 'offline_direct'
      return
    }
    const exists = billingItems.value.some(item => item.product_id === freightProduct.id)
    if (!exists) {
      billingItems.value.push(createBillingItem(freightProduct))
    }
  } else {
    const freightProduct = findCheckoutProduct(productOptions.value, '运费')
    const idx = billingItems.value.findIndex(item => item.product_id === freightProduct?.id || item.product_name.includes('运费'))
    if (idx !== -1) {
      billingItems.value.splice(idx, 1)
    }
  }
})

const fetchPatients = async () => {
  try {
    const res: any = await request.get('/api/admin/patients')
    patients.value = (Array.isArray(res.data) ? res.data : res.data?.list || []).map((p: any) => ({
      label: `${p.name} (${p.phone})`,
      value: p.id.toString(),
      phone: p.phone
    }))
  } catch (error) {
    console.error(error)
    MessagePlugin.error('获取患者列表失败')
  }
}

const setDefaultBillingItem = () => {
  const product = findCheckoutProduct(productOptions.value)
  if (!product) {
    billingItems.value = []
    MessagePlugin.warning('暂无上架商品，无法开立收费账单')
    return
  }
  billingItems.value = [createBillingItem(product)]
}

const fetchProducts = async () => {
  try {
    productOptions.value = await fetchCheckoutProducts(request)
    setDefaultBillingItem()
  } catch (error) {
    console.error('获取商品列表失败:', error)
    billingItems.value = []
    MessagePlugin.error('获取商品列表失败')
  }
}

const addBillingItem = () => {
  const product = findCheckoutProduct(productOptions.value)
  if (!product) {
    MessagePlugin.warning('暂无可添加的上架商品')
    return
  }
  billingItems.value.push(createBillingItem(product))
}

const removeBillingItem = (idx: number) => {
  billingItems.value.splice(idx, 1)
}

const onProductChange = (idx: number, prodId: string) => {
  const prod = productOptions.value.find(p => p.id === prodId)
  if (prod) {
    billingItems.value[idx] = createBillingItem(prod, { quantity: billingItems.value[idx].quantity })
  }
}

// Calculate totals
const totalAmount = computed(() => {
  return billingItems.value.reduce((sum, item) => sum + (item.price * item.quantity), 0)
})

const payableAmount = computed(() => {
  const diff = totalAmount.value - discountAmount.value
  return diff > 0 ? diff : 0
})

function stopPayPolling() {
  checkoutFlow.invalidate()
}

function leaveCheckout() {
  stopPayPolling()
  loading.value = false
  checkoutSuccess.value = false
}
onBeforeRouteLeave(leaveCheckout)
onBeforeRouteUpdate(leaveCheckout)

async function markCheckoutPaid(receipt: any, attempt: CheckoutAttempt | null, isActive = () => checkoutFlow.isCurrent(attempt)) {
  if (!isActive() || String(receipt.orderId) !== attempt?.orderId) return
  receipt = await confirmedCashierReceipt(request, receipt)
  if (!isActive()) return
  checkoutFlow.stopPolling()
  nativePayInfo.value = null
  payWaiting.value = false
  orderResult.value = createCheckoutReceiptResult(receipt)
  checkoutSuccess.value = true
  MessagePlugin.success('收款成功')
}

function startPayPolling(orderId: number | string, receipt: any, attempt: CheckoutAttempt | null) {
  if (!checkoutFlow.isCurrent(attempt) || attempt.orderId !== String(orderId)) return
  payWaiting.value = true
  checkoutFlow.poll(attempt, async isActive => {
    try {
      const status = await getAdminPayStatus(orderId)
      if (!isActive()) return
      if (isPaidStatus(status.status)) {
        await markCheckoutPaid(Object.assign({}, receipt, { payAt: status.payAt }), attempt, isActive)
      }
    } catch (error) {
      if (isActive()) console.error('查询支付状态失败:', error)
    }
  })
}

const submitCheckout = async () => {
  if (loading.value) return
  const attempt = checkoutFlow.capture()
  if (!checkoutFlow.isCurrent(attempt)) return
  const authCode = micropayAuthCode.value.trim()
  if (!selectedStoreId.value) { MessagePlugin.warning('请选择收款门店'); return }
  if (!selectedPatientId.value) {
    MessagePlugin.warning('请先选择结账患者')
    return
  }
  if (billingItems.value.length === 0) {
    MessagePlugin.warning('结账明细不能为空')
    return
  }
  if (deliveryType.value !== 'offline_direct') {
    if (!shippingReceiver.value || !shippingReceiver.value.trim()) {
      MessagePlugin.warning('请填写联系人/收件人姓名')
      return
    }
    if (!shippingPhone.value || !shippingPhone.value.trim()) {
      MessagePlugin.warning('请填写联系电话')
      return
    }
    if (!/^1\d{10}$/.test(shippingPhone.value.trim())) {
      MessagePlugin.warning('请输入有效的11位手机号码')
      return
    }
  }
  if (deliveryType.value === 'online' && (!shippingAddressStr.value || !shippingAddressStr.value.trim())) {
    MessagePlugin.warning('请填写详细收货地址')
    return
  }
  if (payMethod.value === 'wechat_micropay' && !micropayAuthCode.value.trim()) {
    MessagePlugin.warning('请先扫描或输入顾客微信付款码')
    return
  }

  loading.value = true
  try {
    // Determine order type and status based on delivery type
    let orderType = 'offline'
    let orderStatus = 'paid'
    let shipAddr: any = null

    if (deliveryType.value === 'online') {
      orderType = 'online'
      orderStatus = 'shipping' // shipping in system means "To be shipped / 待发货"
      shipAddr = {
        receiver: shippingReceiver.value,
        phone: shippingPhone.value,
        detail: shippingAddressStr.value,
        deliveryMethod: 'online'
      }
    } else if (deliveryType.value === 'offline_pending') {
      orderType = 'offline'
      orderStatus = 'processing' // processing means "Self-pickup pending arrival / 自提待到货"
      shipAddr = {
        receiver: shippingReceiver.value,
        phone: shippingPhone.value,
        detail: '缺货登记（待货通知自提）',
        deliveryMethod: 'pickup_pending'
      }
    } else {
      // offline_direct
      orderType = 'offline'
      orderStatus = 'paid'
      shipAddr = {
        receiver: shippingReceiver.value,
        phone: shippingPhone.value,
        detail: '到店自提',
        deliveryMethod: 'pickup'
      }
    }

    const payload = {
      patient_id: parseInt(selectedPatientId.value, 10),
      store_id: Number(selectedStoreId.value),
      items: billingItems.value,
      pay_amount: payableAmount.value,
      discount_amount: discountAmount.value,
      pay_method: payMethod.value,
      payment_confirmed: ['cash', 'bank'].includes(payMethod.value),
      technician_id: fulfillmentTechnicianId.value ? Number(fulfillmentTechnicianId.value) : undefined,
      type: orderType,
      status: orderStatus,
      shipping_address: shipAddr
    }
    if (['cash', 'bank'].includes(payMethod.value) && !window.confirm('请确认已实际收到款项。此操作仅登记人工收款，不会发起微信支付。')) return
    const res: any = await cashierSession.submit(payload)
    if (!checkoutFlow.isCurrent(attempt)) return
    if (res.code === 200) {
      if (!checkoutFlow.bindOrder(attempt, res.data.order_id)) return
      const receipt = res.data.receipt
      if (payload.pay_method === 'wechat_native') {
        const payInfo = await createNativePay(res.data.order_id)
        if (!checkoutFlow.isCurrent(attempt)) return
        if (payInfo.paid) {
          await markCheckoutPaid(receipt, attempt)
        } else {
          nativePayInfo.value = payInfo
          startPayPolling(res.data.order_id, Object.assign({}, receipt, { payMethod: '微信扫码支付' }), attempt)
          MessagePlugin.info('请顾客使用微信扫码完成支付')
        }
      } else if (payload.pay_method === 'wechat_micropay') {
        const payInfo = await submitMicropay(res.data.order_id, authCode)
        if (!checkoutFlow.isCurrent(attempt)) return
        if (payInfo.tradeState === 'SUCCESS') {
          await markCheckoutPaid(receipt, attempt)
        } else {
          startPayPolling(res.data.order_id, Object.assign({}, receipt, { payMethod: '微信付款码支付' }), attempt)
          MessagePlugin.info('支付处理中，请等待顾客确认')
        }
      } else {
        await markCheckoutPaid(receipt, attempt)
      }
    }
  } catch (error) {
    console.error(error)
    if (checkoutFlow.isCurrent(attempt)) MessagePlugin.error('收银交易失败')
  } finally {
    if (checkoutFlow.isCurrent(attempt)) loading.value = false
  }
}

const resetCheckout = () => {
  cashierSession.reset()
  stopPayPolling()
  selectedPatientId.value = ''
  setDefaultBillingItem()
  discountAmount.value = 0
  payMethod.value = 'wechat_native'
  fulfillmentTechnicianId.value = ''
  checkoutSuccess.value = false
  orderResult.value = null
  nativePayInfo.value = null
  micropayAuthCode.value = ''
  payWaiting.value = false
  deliveryType.value = 'offline_direct'
  shippingReceiver.value = ''
  shippingPhone.value = ''
  shippingAddressStr.value = ''
  checkoutFlow.begin()
}

onMounted(() => {
  fetchStores()
  fetchPatients()
  fetchProducts()
})

onUnmounted(() => stopPayPolling())
</script>

<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">诊所收银结算台</div>
        <div class="page-title-sub">就诊费、定制器械线下结算及分销自动返佣结算</div>
      </div>
    </div>

    <div v-if="checkoutSuccess" class="success-panel">
      <div class="invoice-box">
        <div class="invoice-title">鼾静健康诊所 · 收费凭证</div>
        <div class="invoice-divider">================================</div>
        <div class="invoice-row"><span>交易单号:</span> <span>{{ orderResult.orderNo }}</span></div>
        <div class="invoice-row"><span>结账客户:</span> <span>{{ orderResult.patientName }}</span></div>
        <div class="invoice-row"><span>交易时间:</span> <span>{{ orderResult.time }}</span></div>
        <div class="invoice-divider">--------------------------------</div>
        <div v-for="item in orderResult.items" :key="item.product_id" class="invoice-row">
          <span>{{ item.product_name }} x{{ item.quantity }}</span>
          <span>¥{{ ((item.price * item.quantity) / 100).toFixed(2) }}</span>
        </div>
        <div class="invoice-divider">--------------------------------</div>
        <div class="invoice-row"><span>总计金额:</span> <span>¥{{ orderResult.total }}</span></div>
        <div class="invoice-row"><span>优惠折扣:</span> <span>-¥{{ orderResult.discount }}</span></div>
        <div class="invoice-row" style="font-weight: bold; font-size: 15px; color: #000;">
          <span>实收金额:</span> <span>¥{{ orderResult.payable }}</span>
        </div>
        <div class="invoice-row"><span>支付方式:</span> <span>{{ orderResult.payMethodText }}</span></div>
        <div class="invoice-divider">================================</div>
        <div class="invoice-footer">
          谢谢惠顾，请妥善保管收款凭证。
        </div>
      </div>
      <div style="margin-top: 24px; text-align: center;">
        <t-button theme="primary" @click="resetCheckout">继续收银</t-button>
      </div>
    </div>

    <div v-else class="checkout-layout">
      <!-- Left Form -->
      <div class="form-card">
        <div class="card-title"><AppIcon name="money" />  收费信息登记</div>
        
        <!-- Select Patient -->
        <div class="form-item">
          <label class="form-label">收款门店</label>
          <t-select v-model="selectedStoreId" placeholder="请选择收款门店" :options="stores.map(s => ({ label: s.name, value: String(s.id) }))" />
        </div>
        <div class="form-item">
          <label class="form-label">选择患者</label>
          <t-select v-model="selectedPatientId" filterable placeholder="输入患者姓名或手机号搜索" :options="patients" />
        </div>

        <!-- Add Products -->
        <div class="form-item">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <label class="form-label" style="margin-bottom: 0;">收费项目明细</label>
            <t-button size="small" theme="primary" variant="outline" @click="addBillingItem">
              <AppIcon name="plus" />  添加项目
            </t-button>
          </div>
          
          <div v-for="(item, idx) in billingItems" :key="idx" class="billing-row">
            <t-select
              v-model="item.product_id"
              :options="productOptions.map(p => ({ label: p.name, value: p.id }))"
              style="flex: 1;"
              @change="(val: string) => onProductChange(idx, val)"
            />
            <t-input-number v-model="item.quantity" :min="1" style="width: 100px;" />
            <div class="row-price">¥{{ ((item.price * item.quantity) / 100).toFixed(2) }}</div>
            <t-button theme="danger" variant="text" @click="removeBillingItem(idx)">删除</t-button>
          </div>
        </div>

        <!-- Discount & Paymethod -->
        <div style="display: flex; gap: 16px; margin-top: 16px;">
          <div class="form-item" style="flex: 1;">
            <label class="form-label">卡券折扣金额 (元)</label>
            <t-input-number v-model="discountAmount" :min="0" :step="1000" :format="(val: string | number) => `¥${(Number(val) / 100).toFixed(2)}`" />
          </div>
          <div class="form-item" style="flex: 1;">
            <label class="form-label">支付方式</label>
            <t-select v-model="payMethod" :options="[
              { label: '现金已收款', value: 'cash' },
              { label: '微信收款码', value: 'wechat_native' },
              { label: '扫顾客付款码', value: 'wechat_micropay' }
            ]" />
          </div>
        </div>

        <div v-if="payMethod === 'wechat_micropay'" class="form-item" style="margin-top: 12px;">
          <label class="form-label">顾客微信付款码</label>
          <t-input v-model="micropayAuthCode" placeholder="请用扫码枪扫描或输入顾客微信付款码" />
        </div>
        <TechnicianSelect v-model="fulfillmentTechnicianId" />

        <div v-if="nativePayInfo" style="margin-top: 16px; text-align: center; padding: 16px; border: 1px solid #E5E7EB; border-radius: 10px; background: #FAFBFC;">
          <img v-if="nativePayInfo.qrCodeImageUrl" :src="nativePayInfo.qrCodeImageUrl" alt="微信支付二维码" style="width: 220px; height: 220px;">
          <div style="font-size: 13px; color: #374151; margin-top: 10px;">请顾客使用微信扫码支付</div>
          <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">订单号：{{ nativePayInfo.orderNo }}</div>
        </div>

        <div v-if="payWaiting" style="margin-top: 12px; color: #2563EB; font-size: 13px;">
          正在等待微信支付结果...
        </div>

        <!-- Delivery Type Selection -->
        <div class="form-item" style="margin-top: 16px; border-top: 1px dashed #E5E7EB; padding-top: 16px;">
          <label class="form-label">配送/交付方式</label>
          <t-radio-group v-model="deliveryType" variant="default-filled">
            <t-radio-button value="offline_direct">现场提走 (有货)</t-radio-button>
            <t-radio-button value="offline_pending">到店自取 (缺货预订)</t-radio-button>
            <t-radio-button value="online">快递邮寄 (缺货/定制)</t-radio-button>
          </t-radio-group>
        </div>

        <!-- Shipping Address Form (if online delivery or pending offline) -->
        <div v-if="deliveryType === 'online'" style="background: #F9FAFB; padding: 14px; border-radius: 8px; border: 1px solid #E5E7EB; margin-top: 16px;">
          <div style="font-weight: 700; font-size: 13px; color: #374151; margin-bottom: 12px; display: flex; align-items: center; gap: 4px;">
            <span><AppIcon name="truck" />  快递收货地址</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div class="form-item" style="margin-bottom: 0;">
              <label class="form-label" style="font-size: 11px;">收件人姓名</label>
              <t-input v-model="shippingReceiver" placeholder="收件人姓名" />
            </div>
            <div class="form-item" style="margin-bottom: 0;">
              <label class="form-label" style="font-size: 11px;">联系电话</label>
              <t-input v-model="shippingPhone" placeholder="收件人电话" />
            </div>
          </div>
          <div class="form-item" style="margin-bottom: 0;">
            <label class="form-label" style="font-size: 11px;">详细收货地址 (省市区县及详细门牌号)</label>
            <t-textarea v-model="shippingAddressStr" placeholder="请输入完整收货地址..." :rows="2" />
          </div>
        </div>

        <!-- Pickup Info Form (if pending pickup) -->
        <div v-if="deliveryType === 'offline_pending'" style="background: #FFFBEB; padding: 14px; border-radius: 8px; border: 1px solid #FCD34D; margin-top: 16px;">
          <div style="font-weight: 700; font-size: 13px; color: #D97706; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
            <span><AppIcon name="pickup" />  缺货自提预订信息</span>
          </div>
          <div style="font-size: 12px; color: #B45309; line-height: 1.5; margin-bottom: 10px;">
            系统将会在后台生成一笔“待到货”的自提记录。当门店到货并在后台点击“货到通知”时，系统将通过微信推送通知该患者到店自提。
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-item" style="margin-bottom: 0;">
              <label class="form-label" style="font-size: 11px; color: #B45309;">通知联系人</label>
              <t-input v-model="shippingReceiver" placeholder="通知姓名" />
            </div>
            <div class="form-item" style="margin-bottom: 0;">
              <label class="form-label" style="font-size: 11px; color: #B45309;">通知手机号</label>
              <t-input v-model="shippingPhone" placeholder="通知电话" />
            </div>
          </div>
        </div>
      </div>

      <!-- Right Summary Panel -->
      <div class="summary-card">
        <div class="card-title"><AppIcon name="receipt" />  结算清单</div>
        <div class="summary-row">
          <span>商品总额</span>
          <span>¥{{ (totalAmount / 100).toFixed(2) }}</span>
        </div>
        <div class="summary-row">
          <span>优惠券抵扣</span>
          <span style="color: #EF4444;">-¥{{ (discountAmount / 100).toFixed(2) }}</span>
        </div>
        <div class="summary-divider"></div>
        <div class="summary-row total">
          <span>应收总额</span>
          <span class="price">¥{{ (payableAmount / 100).toFixed(2) }}</span>
        </div>

        <t-button size="large" theme="success" block :loading="loading" @click="submitCheckout" style="margin-top: 24px;">
          <AppIcon name="card" />  确认收费结算 · ¥{{ (payableAmount / 100).toFixed(2) }}
        </t-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  padding: 24px;
}
.page-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #1F2937;
}
.page-title-sub {
  font-size: 13px;
  color: #6B7280;
  margin-top: 4px;
}
.checkout-layout {
  display: flex;
  gap: 24px;
  margin-top: 20px;
  align-items: flex-start;
}
.form-card {
  flex: 1;
  background: #FFFFFF;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.summary-card {
  width: 320px;
  background: #FFFFFF;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.card-title {
  font-size: 16px;
  font-weight: 700;
  color: #1F2937;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #F3F4F6;
}
.form-item {
  margin-bottom: 20px;
}
.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #4B5563;
  margin-bottom: 8px;
}
.billing-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}
.row-price {
  width: 100px;
  text-align: right;
  font-weight: 700;
  color: #1F2937;
  font-size: 14px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #4B5563;
  margin-bottom: 12px;
}
.summary-row.total {
  font-weight: 700;
  color: #1F2937;
  font-size: 16px;
}
.summary-row .price {
  color: #1A9D5C;
  font-size: 20px;
}
.summary-divider {
  height: 1px;
  background: #F3F4F6;
  margin: 16px 0;
}
.success-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 20px;
}
.invoice-box {
  width: 400px;
  background: #FCFCFA;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  padding: 24px;
  font-family: monospace, Courier, monospace;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.invoice-title {
  font-size: 18px;
  font-weight: bold;
  text-align: center;
  color: #000;
}
.invoice-divider {
  text-align: center;
  color: #9CA3AF;
  margin: 10px 0;
  letter-spacing: -1px;
}
.invoice-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #4B5563;
  margin-bottom: 6px;
}
.invoice-footer {
  font-size: 11px;
  color: #9CA3AF;
  text-align: center;
  margin-top: 16px;
  line-height: 1.4;
}
</style>
