<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const route = useRoute()

interface PatientOption {
  label: string;
  value: string;
  phone: string;
}

interface ProductItem {
  id: string;
  name: string;
  price: number; // in cents
}

const patients = ref<PatientOption[]>([])
const selectedPatientId = ref<string>((route.query.patientId as string) || '')
const loading = ref(false)

const productOptions: ProductItem[] = [
  { id: '1', name: '定制式可调舌型阻鼾器 HJ-MAD-03', price: 298000 },
  { id: '2', name: '鼾静阻鼾器专用清洁泡腾片 (60片/盒)', price: 4900 },
  { id: '3', name: '鼾静智能阻鼾舒眠记忆枕', price: 29900 },
  { id: '4', name: '诊所首诊挂号门诊费', price: 20000 },
  { id: '5', name: '诊所专家诊断评估费', price: 50000 },
  { id: '7', name: '快递运费', price: 1500 },
  { id: '8', name: '就诊预约定金', price: 20000 }
]

// Billing items chosen
const billingItems = ref<Array<{ product_id: string; product_name: string; price: number; quantity: number }>>([
  { product_id: '4', product_name: '诊所首诊挂号门诊费', price: 20000, quantity: 1 }
])

const discountAmount = ref<number>(3000) // 30 yuan coupon discount
const payMethod = ref<string>('wechat')
const checkoutSuccess = ref(false)
const orderResult = ref<any>(null)

const deliveryType = ref<string>('offline_direct') // offline_direct (现场提走), online (快递寄送), offline_pending (缺货自提预订)
const shippingReceiver = ref<string>('')
const shippingPhone = ref<string>('')
const shippingAddressStr = ref<string>('')

watch(selectedPatientId, (newVal) => {
  const p = patients.value.find(item => item.value === newVal)
  if (p) {
    shippingReceiver.value = p.label.split(' ')[0]
    shippingPhone.value = p.phone
  }
})

watch(deliveryType, (newVal) => {
  if (newVal === 'online') {
    const exists = billingItems.value.some(item => item.product_id === '7')
    if (!exists) {
      billingItems.value.push({ product_id: '7', product_name: '快递运费', price: 1500, quantity: 1 })
    }
  } else {
    const idx = billingItems.value.findIndex(item => item.product_id === '7')
    if (idx !== -1) {
      billingItems.value.splice(idx, 1)
    }
  }
})

const fetchPatients = async () => {
  try {
    const res: any = await request.get('/api/admin/patients')
    patients.value = res.data.map((p: any) => ({
      label: `${p.name} (${p.phone})`,
      value: p.id.toString(),
      phone: p.phone
    }))
  } catch (error) {
    console.error(error)
    MessagePlugin.error('获取患者列表失败')
  }
}

const addBillingItem = () => {
  billingItems.value.push({ product_id: '1', product_name: '定制式可调舌型阻鼾器 HJ-MAD-03', price: 298000, quantity: 1 })
}

const removeBillingItem = (idx: number) => {
  billingItems.value.splice(idx, 1)
}

const onProductChange = (idx: number, prodId: string) => {
  const prod = productOptions.find(p => p.id === prodId)
  if (prod) {
    billingItems.value[idx].product_name = prod.name
    billingItems.value[idx].price = prod.price
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

const submitCheckout = async () => {
  if (!selectedPatientId.value) {
    MessagePlugin.warning('请先选择结账患者')
    return
  }
  if (billingItems.value.length === 0) {
    MessagePlugin.warning('结账明细不能为空')
    return
  }

  loading.value = true
  try {
    // Determine order type and status based on delivery type
    let orderType = 'offline'
    let orderStatus = 'completed' // completed for immediate offline delivery
    let shipAddr: any = null

    if (deliveryType.value === 'online') {
      orderType = 'online'
      orderStatus = 'shipping' // shipping in system means "To be shipped / 待发货"
      shipAddr = {
        receiver: shippingReceiver.value,
        phone: shippingPhone.value,
        province: '广东省',
        city: '深圳市',
        district: '快递邮寄',
        detail: shippingAddressStr.value
      }
    } else if (deliveryType.value === 'offline_pending') {
      orderType = 'offline'
      orderStatus = 'processing' // processing means "Self-pickup pending arrival / 自提待到货"
      shipAddr = {
        receiver: shippingReceiver.value,
        phone: shippingPhone.value,
        province: '广东省',
        city: '深圳市',
        district: '门店自提',
        detail: '缺货登记（待货通知自提）'
      }
    } else {
      // offline_direct
      orderType = 'offline'
      orderStatus = 'completed'
      shipAddr = {
        receiver: shippingReceiver.value || '到店客户',
        phone: shippingPhone.value || '--',
        province: '广东省',
        city: '深圳市',
        district: '到店自提',
        detail: '现场拿走'
      }
    }

    const payload = {
      patient_id: parseInt(selectedPatientId.value, 10),
      items: billingItems.value,
      pay_amount: payableAmount.value,
      discount_amount: discountAmount.value,
      pay_method: payMethod.value,
      type: orderType,
      status: orderStatus,
      shipping_address: shipAddr
    }
    const res: any = await request.post('/api/admin/orders', payload)
    if (res.code === 200) {
      MessagePlugin.success('收银收费交易成功！已打印交易小票。')
      orderResult.value = {
        orderNo: res.data.order_no,
        patientName: patients.value.find(p => p.value === selectedPatientId.value)?.label,
        total: (totalAmount.value / 100).toFixed(2),
        discount: (discountAmount.value / 100).toFixed(2),
        payable: (payableAmount.value / 100).toFixed(2),
        payMethodText: payMethod.value === 'wechat' ? '微信支付' : payMethod.value === 'alipay' ? '支付宝' : 'POS线下刷卡',
        time: new Date().toLocaleString()
      }
      checkoutSuccess.value = true
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('收银交易失败')
  } finally {
    loading.value = false
  }
}

const resetCheckout = () => {
  selectedPatientId.value = ''
  billingItems.value = [{ product_id: '4', product_name: '诊所首诊挂号门诊费', price: 20000, quantity: 1 }]
  discountAmount.value = 3000
  checkoutSuccess.value = false
  orderResult.value = null
  deliveryType.value = 'offline_direct'
  shippingReceiver.value = ''
  shippingPhone.value = ''
  shippingAddressStr.value = ''
}

onMounted(() => {
  fetchPatients()
})
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
        <div v-for="item in billingItems" :key="item.product_id" class="invoice-row">
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
          谢谢惠顾，定制式舌型阻鼾器会在1-3个工作日内根据您的三维口腔模型制作完成并包邮寄送。
        </div>
      </div>
      <div style="margin-top: 24px; text-align: center;">
        <t-button theme="primary" @click="resetCheckout">继续收银</t-button>
      </div>
    </div>

    <div v-else class="checkout-layout">
      <!-- Left Form -->
      <div class="form-card">
        <div class="card-title">💵 收费信息登记</div>
        
        <!-- Select Patient -->
        <div class="form-item">
          <label class="form-label">选择患者</label>
          <t-select v-model="selectedPatientId" filterable placeholder="输入患者姓名或手机号搜索" :options="patients" />
        </div>

        <!-- Add Products -->
        <div class="form-item">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <label class="form-label" style="margin-bottom: 0;">收费项目明细</label>
            <t-button size="small" theme="primary" variant="outline" @click="addBillingItem">
              ➕ 添加项目
            </t-button>
          </div>
          
          <div v-for="(item, idx) in billingItems" :key="idx" class="billing-row">
            <t-select
              v-model="item.product_id"
              :options="productOptions.map(p => ({ label: p.name, value: p.id }))"
              style="flex: 1;"
              @change="val => onProductChange(idx, val)"
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
            <t-input-number v-model="discountAmount" :min="0" :step="1000" :format="val => `¥${(val / 100).toFixed(2)}`" />
          </div>
          <div class="form-item" style="flex: 1;">
            <label class="form-label">支付方式</label>
            <t-select v-model="payMethod" :options="[
              { label: '微信支付', value: 'wechat' },
              { label: '支付宝', value: 'alipay' },
              { label: 'POS线下刷卡', value: 'pos' }
            ]" />
          </div>
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
            <span>🚚 快递收货地址</span>
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
            <span>🏪 缺货自提预订信息</span>
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
        <div class="card-title">🧾 结算清单</div>
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
          💳 确认收费结算 · ¥{{ (payableAmount / 100).toFixed(2) }}
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
