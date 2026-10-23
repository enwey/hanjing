<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { navigateToParent } from '@/utils/routeNavigation'
import { formatShanghaiDateTime } from '@/utils/dateTime'
import OrderPaymentActions from '@/components/OrderPaymentActions.vue'

const route = useRoute()
const router = useRouter()
const orderId = ref(route.params.id as string || '1')

/* ---- Express Tracking & Invoice State ---- */
const carrier = ref('')
const trackingNo = ref('')
const loadingTracking = ref(false)
const trackingSteps = ref<any[]>([])
const trackingMessage = ref('暂无物流轨迹信息')



/* ---- Order Data ---- */
const order = ref<any>({
  id: orderId.value,
  no: '',
  status: '',
  createTime: '',
  payTime: '',
  updateTime: '',
  patient: '',
  phone: '',
  address: '',
  receiverLabel: '收货人',
  addressLabel: '收货地址',
  infoTitle: '收货信息',
  price: 0,
  productIcon: 'box',
  items: [],
  commissions: [],
  totalAmount: 0,
  discountAmount: 0,
  payMethod: '微信支付',
  userName: '普通成员',
  userPhone: '',
  userAvatar: '',
  userId: '',
  type: 'product',
  shipping_address: {},
  invoice_info: null
})

const showShip = ref(false)

function parseAddress(value: any) {
  if (!value) return {}
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value || '{}')
  } catch (error) {
    return {}
  }
}

function formatFen(amount: number) {
  return (Number(amount || 0) / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatDateTime(value: string) {
  if (!value) return ''
  return formatShanghaiDateTime(value, false)
}

function maskPhone(phone: string) {
  if (!phone || phone === '未绑定') return '未绑定'
  const p = phone.trim()
  if (p.length === 11) {
    return p.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  }
  if (p.length > 4) {
    return p.slice(0, 3) + '****' + p.slice(-4)
  }
  return p
}

const getAvatarColor = (name: string) => {
  if (!name) return '#3B6BF5'
  const colors = ['#3B6BF5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function commissionTitle(level: number) {
  return level === 1 ? '一级推广员' : level === 2 ? '二级推广员' : `${level}级推广员`
}

function commissionStatus(status: string) {
  const map: Record<string, string> = {
    pending: '待结算',
    settled: '已结算',
    refunded: '已退佣'
  }
  return map[status] || status || '待结算'
}

const activeCommissions = computed(() => {
  return (order.value.commissions || []).filter((item: any) => item.status !== 'refunded')
})

const commissionTotal = computed(() => {
  return activeCommissions.value.reduce((sum: number, item: any) => sum + Number(item.commission_amount || 0), 0)
})

const platformIncome = computed(() => {
  if (!order.value.raw?.pay_at || order.value.status === 'refunded') return 0
  return Number(order.value.price || 0) * 100 - commissionTotal.value
})

const timelineItems = computed(() => {
  const result: Array<{ time: string; title: string; content: string; theme: string }> = []
  const row = order.value.raw
  if (!row) return result
  result.push({ time: order.value.createTime, title: '订单创建', content: '订单金额 ¥' + formatFen(order.value.totalAmount), theme: 'green' })
  if (row.pay_at) result.push({ time: formatDateTime(row.pay_at), title: '已记录付款', content: order.value.payMethod + '，实付 ¥' + formatFen(row.pay_amount), theme: 'green' })
  const address = order.value.shipping_address
  if (address.refund_applied_at) result.push({ time: formatDateTime(address.refund_applied_at), title: '申请退款', content: address.refund_reason || '未填写原因', theme: 'gold' })
  if (row.status === 'refunded') {
    const offline = address.offline_refund
    const proof = offline ? `线下${offline.method === 'cash' ? '现金' : '银行转账'}退款 ¥${formatFen(offline.amount)}；流水：${offline.reference || '未填写'}；凭证：${offline.evidence || '未填写'}；登记人 ID：${offline.actor_id}；登记时间：${formatDateTime(offline.registered_at)}` : ''
    result.push({ time: row.refund_at ? formatDateTime(row.refund_at) : '未记录退款时间', title: '订单已标记退款', content: proof || (row.wechat_refund_id ? '支付渠道退款单号：' + row.wechat_refund_id : '缺少退款流水或凭证，需人工核对历史记录。'), theme: offline || row.wechat_refund_id ? 'green' : 'gold' })
  } else if (['refund_pending', 'refunding'].includes(row.status)) {
    result.push({ time: '当前状态', title: row.wechat_refund_no ? '退款处理中' : '退款待审核', content: row.wechat_refund_no ? '退款单号：' + row.wechat_refund_no + '，尚未确认退款成功。' : '等待管理员审核。', theme: 'gold' })
  } else {
    const states: Record<string, string> = { pending: '待付款', paid: '已付款', shipping: '待发货', shipped: '已发货', processing: '处理中', completed: '订单已完成', cancelled: '订单已取消' }
    result.push({ time: '当前状态', title: states[row.status] || row.status, content: '最近更新：' + (order.value.updateTime || '未记录'), theme: row.status === 'completed' ? 'green' : 'gray' })
  }
  if (trackingNo.value) result.push({ time: '运单记录', title: carrier.value || '承运商未记录', content: trackingNo.value, theme: 'gray' })
  return result
})

const fetchTrackingLogs = async () => {
  loadingTracking.value = true
  try {
    const res: any = await request.get(`/api/admin/orders/${orderId.value}/tracking`)
    if (res.code === 200 && res.data) {
      trackingSteps.value = res.data.steps || []
      trackingMessage.value = res.data.message || '暂无物流轨迹信息'
    }
  } catch (error) {
    trackingSteps.value = []
    trackingMessage.value = '物流信息获取失败，请重试'
    console.error('Failed to load tracking logs:', error)
  } finally {
    loadingTracking.value = false
  }
}

function handlePrintReceipt() {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  const itemsHtml = (order.value.raw?.items || []).map((item: any) => `
    <tr>
      <td style="padding: 4px 0; font-size: 12px;">${item.product_name}</td>
      <td style="text-align: right; padding: 4px 0; font-size: 12px;">${item.quantity}</td>
      <td style="text-align: right; padding: 4px 0; font-size: 12px;">¥${(item.price * item.quantity / 100).toFixed(2)}</td>
    </tr>
  `).join('')

  const orderNo = order.value.no
  const createTime = order.value.createTime
  const patientName = order.value.patient
  const totalAmount = (order.value.raw?.total_amount / 100).toFixed(2)
  const discountAmount = (order.value.raw?.discount_amount / 100).toFixed(2)
  const payAmount = (order.value.raw?.pay_amount / 100).toFixed(2)
  const payMethod = order.value.raw?.pay_method === 'wechat' ? '微信支付' : order.value.raw?.pay_method

  printWindow.document.write(`
    <html>
      <head>
        <title>打印收银小票 - ${orderNo}</title>
        <style>
          body {
            font-family: monospace;
            width: 72mm;
            margin: 0 auto;
            padding: 10px;
            color: #000;
          }
          .header { text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 5px; }
          .subtitle { text-align: center; font-size: 11px; margin-bottom: 15px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
          .info-line { font-size: 11px; margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 10px; }
          th { text-align: left; font-size: 11px; border-bottom: 1px dashed #000; padding-bottom: 4px; }
          .summary { border-top: 1px dashed #000; padding-top: 6px; font-size: 11px; }
          .summary-item { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .bold { font-weight: bold; font-size: 12px; }
          .footer { text-align: center; margin-top: 25px; font-size: 10px; border-top: 1px dashed #000; padding-top: 8px; line-height: 1.4; }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        <div class="header">兴康明诊所</div>
        <div class="subtitle">结账小票 (POS RECEIPT)</div>
        <div class="info-line">小票单号: ${orderNo}</div>
        <div class="info-line">下单日期: ${createTime}</div>
        <div class="info-line">收银员: 管理员</div>
        <div class="info-line" style="border-bottom: 1px dashed #000; padding-bottom: 5px;">患者姓名: ${patientName}</div>
        
        <table>
          <thead>
            <tr>
              <th>项目</th>
              <th style="text-align: right; width: 40px;">数量</th>
              <th style="text-align: right; width: 70px;">金额</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="summary">
          <div class="summary-item"><span>商品总计:</span><span>¥${totalAmount}</span></div>
          <div class="summary-item"><span>优惠扣减:</span><span>¥${discountAmount}</span></div>
          <div class="summary-item bold" style="margin-top: 4px;"><span>实付总额:</span><span>¥${payAmount}</span></div>
          <div class="summary-item" style="margin-top: 4px;"><span>支付方式:</span><span>${payMethod}</span></div>
        </div>
        
        <div class="footer">
          谢谢惠顾，祝您健康睡眠！<br>
          兴康明诊所 · 鼾声分析管理系统
        </div>
      </body>
    </html>
  `)
  printWindow.document.close()
}

const fetchOrderDetail = async () => {
  try {
    const res: any = await request.get(`/api/admin/orders/${orderId.value}`)
    if (res.code === 200 && res.data) {
      const o = res.data
      const addr: any = parseAddress(o.shipping_address)
      const items = Array.isArray(o.items) ? o.items : []
      const isOnline = o.type === 'online'
      carrier.value = addr.express_company || carrier.value
      trackingNo.value = addr.tracking_number || ''
      
      order.value = {
        id: o.id.toString(),
        no: o.order_no,
        status: o.status,
        createTime: formatDateTime(o.created_at),
        payTime: formatDateTime(o.pay_at || ''),
        updateTime: formatDateTime(o.updated_at),
        patient: addr.receiver || o.user_name || '患者',
        phone: addr.phone || o.user_phone || '未绑定',
        address: isOnline ? (addr.detail || '未填写收货地址') : (addr.detail || addr.store_name || addr.status || '门店自提'),
        receiverLabel: isOnline ? '收货人' : '取货人',
        addressLabel: isOnline ? '收货地址' : '自提信息',
        infoTitle: isOnline ? '收货信息' : '自提信息',
        userName: o.user_name || '普通成员',
        userPhone: maskPhone(o.user_phone),
        userAvatar: o.user_avatar || '',
        userId: o.user_id ? o.user_id.toString() : '',
        price: o.pay_amount / 100,
        totalAmount: Number(o.total_amount || o.pay_amount || 0),
        discountAmount: Number(o.discount_amount || 0),
        payMethod: ({ wechat: '微信支付', wechat_native: '微信扫码', wechat_micropay: '微信付款码', cash: '现金', bank: '银行转账', alipay: '支付宝', card: '银行卡' } as Record<string, string>)[o.pay_method] || o.pay_method || '未记录',
        productIcon: 'box',
        items,
        commissions: Array.isArray(o.commissions) ? o.commissions : [],
        type: o.type,
        shipping_address: addr,
        invoice_info: o.invoice_info,
        raw: o
      }

      if (isOnline && ['shipped', 'completed'].includes(o.status)) {
        fetchTrackingLogs()
      }
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('加载订单详情失败')
  }
}

onMounted(() => {
  fetchOrderDetail()
})

function handleBack() {
  navigateToParent(router, route, '/order')
}

function handleConfirmShip() {
  if (order.value.status === 'shipped') {
    MessagePlugin.info('订单已完成发货')
    return
  }
  showShip.value = true
}

async function submitShip() {
  if (!trackingNo.value.trim()) {
    MessagePlugin.warning('请填写快递单号')
    return
  }
  try {
    const res: any = await request.post(`/api/admin/orders/${orderId.value}/ship`, {
      tracking_number: trackingNo.value,
      express_company: carrier.value
    })
    if (res.code === 200) {
      order.value.status = 'shipped'
      showShip.value = false
      MessagePlugin.success(`发货成功！快递单号：${trackingNo.value}`)
      fetchOrderDetail()
    }
  } catch (e) {
    console.error(e)
    MessagePlugin.error('发货失败')
  }
}

async function handleCompleteOrder() {
  try {
    const res: any = await request.post(`/api/admin/orders/${orderId.value}/complete`)
    if (res.code === 200) {
      MessagePlugin.success('订单已核销完成，成功交付自提商品！')
      fetchOrderDetail()
    }
  } catch (err) {
    console.error(err)
    MessagePlugin.error('核销失败')
  }
}

async function handleNotifyOrder() {
  try {
    const res: any = await request.post(`/api/admin/orders/${orderId.value}/notify`)
    if (res.code === 200) {
      MessagePlugin.success('已发送微信消息通知患者到店自提')
      fetchOrderDetail()
    }
  } catch (err) {
    console.error(err)
    MessagePlugin.error('发送通知失败')
  }
}
</script>

<template>
  <div class="page-container">


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">
          {{ order.no }}
          <span class="status-tag gold" v-if="order.status === 'pending'">待付款</span>
          <span class="status-tag gold" v-if="order.status === 'shipping'">待发货</span>
          <span class="status-tag blue" v-else-if="order.status === 'paid'">待取货</span>
          <span class="status-tag blue" v-else-if="order.status === 'processing'">自提待到货</span>
          <span class="status-tag green" v-else-if="order.status === 'completed'">已完成</span>
          <span class="status-tag green" v-else-if="order.status === 'shipped'">已发货</span>
          <span class="status-tag red" v-else-if="order.status === 'refunding' || order.status === 'refund_pending'">{{ order.status === 'refund_pending' ? '退款待审核' : '退款处理中' }}</span>
          <span class="status-tag red" v-else-if="order.status === 'refunded'">已退款</span>
        </div>
        <div class="page-title-sub">下单时间 {{ order.createTime }}</div>
      </div>
      <div class="action-buttons" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <OrderPaymentActions v-if="order.raw" :key="order.raw.id" :order="order.raw" @changed="fetchOrderDetail" />
        <!-- Print Receipt Action -->
        <button class="btn btn-outline" v-if="['paid', 'completed', 'shipped'].includes(order.status)" @click="handlePrintReceipt"><AppIcon name="printer" />  打印小票</button>


        <!-- For online shipping -->
        <button class="btn btn-primary" v-if="order.type === 'online' && order.status === 'shipping'" @click="handleConfirmShip"><AppIcon name="box" />  确认发货</button>
        <!-- For offline pending self-pickup -->
        <button class="btn btn-outline" v-if="order.type === 'offline' && order.status === 'processing'" @click="handleNotifyOrder"><AppIcon name="bell" />  到货通知</button>
        <button class="btn btn-success" v-if="order.type === 'offline' && (order.status === 'processing' || order.status === 'paid')" @click="handleCompleteOrder"><AppIcon name="check-circle" />  完成自提核销</button>
      </div>
    </div>

    <!-- Grid: Order User Info & Delivery Info -->
    <div class="card-grid-2">
      <!-- Member Info (会员信息) -->
      <div class="panel" style="margin: 0; display: flex; flex-direction: column; height: 100%;">
        <div class="panel-header"><div class="panel-title"><AppIcon name="patient" />  会员信息</div></div>
        <div class="panel-body" style="display: flex; align-items: center; gap: 16px; padding: 24px 20px; flex: 1;">
          <img v-if="order.userAvatar" :src="order.userAvatar" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 2px solid #F3F4F6;" />
          <div v-else :style="{ width: '56px', height: '56px', borderRadius: '50%', background: getAvatarColor(order.userName), color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: '700', flexShrink: 0 }">
            {{ (order.userName || 'U')[0] }}
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="font-size: 18px; font-weight: 700; color: #111827;">{{ order.userName }}</div>
            <div style="font-size: 13px; color: #6B7280; display: flex; align-items: center; gap: 6px;">
              <span style="background: #F3F4F6; color: #4B5563; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">手机号</span>
              <span style="font-weight: 600; color: #374151;">{{ order.userPhone }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Delivery & Logistics Info -->
      <div class="panel" style="margin: 0;">
        <div class="panel-header">
          <div class="panel-title">
            <AppIcon :name="order.type === 'online' ? 'box' : 'bell'" />  
            {{ order.type === 'online' ? '配送与物流' : '自提与核销' }}
          </div>
        </div>
        <div class="info-grid">
          <!-- Receiver Details -->
          <div class="info-item"><div class="info-label">{{ order.receiverLabel }}</div><div class="info-value">{{ order.patient }}</div></div>
          <div class="info-item"><div class="info-label">联系电话</div><div class="info-value">{{ order.phone }}</div></div>
          <div class="info-item" style="grid-column: span 2;">
            <div class="info-label">{{ order.addressLabel }}</div>
            <div class="info-value" style="font-size: 13px; line-height: 1.5;">{{ order.address }}</div>
          </div>

          <!-- Logistics Info for Online -->
          <template v-if="order.type === 'online'">
            <div class="info-item" style="border-left: none;"><div class="info-label">配送方式</div><div class="info-value">快递邮寄</div></div>
            <div class="info-item" style="border-left: 1px solid #F9FAFB;"><div class="info-label">物流公司</div><div class="info-value">{{ carrier || '暂无' }}</div></div>
            <div class="info-item" style="grid-column: span 2; border-left: none;">
              <div class="info-label">物流追踪 / 快递单号</div>
              <div v-if="trackingNo" class="info-value" style="font-size: 14px; font-weight: 700; color: var(--primary-500);">
                {{ trackingNo }}
              </div>
              <div v-else class="info-value" style="font-size: 13px; color: #9CA3AF; font-weight: normal; display: flex; justify-content: space-between; align-items: center;">
                <span>待发货 (暂无快递单号)</span>
                <button class="btn btn-outline" @click="handleConfirmShip" style="padding: 4px 10px; font-size: 12px; height: 28px; line-height: 1;"><AppIcon name="box" /> 录入发货</button>
              </div>
            </div>
          </template>

          <!-- Self-pickup Info for Offline -->
          <template v-else>
            <div v-if="order.status === 'processing' || order.status === 'paid'" class="info-item" style="grid-column: span 2; display: flex; align-items: center; justify-content: flex-end; gap: 6px; border-left: none;">
              <button class="btn btn-outline" v-if="order.status === 'processing'" @click="handleNotifyOrder" style="padding: 4px 10px; font-size: 12px; height: 28px; line-height: 1;"><AppIcon name="bell" /> 通知到货</button>
              <button class="btn btn-success" v-if="order.status === 'processing' || order.status === 'paid'" @click="handleCompleteOrder" style="padding: 4px 10px; font-size: 12px; height: 28px; line-height: 1; border: 1px solid #BBF7D0; background: #ECFDF5; color: #16A34A;"><AppIcon name="check-circle" /> 提货核销</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="order.invoice_info" class="panel" style="margin-top: 16px; padding: 16px;">
      历史开票信息尚未验证，不作为有效税务发票。在线开票服务暂未开通。
    </div>

    <!-- Logistics Tracking Panel -->
    <div v-if="order.type === 'online' && (order.status === 'shipped' || order.status === 'completed')" class="panel" style="margin-top: 16px;">
      <div class="panel-header">
        <div class="panel-title"><AppIcon name="map-pin" />  物流轨迹追踪</div>
      </div>
      <div class="panel-body" style="padding: 20px 24px;">
        <div v-if="loadingTracking" style="text-align: center; color: #9CA3AF; padding: 10px;">加载物流中...</div>
        <div v-else-if="trackingSteps.length === 0" style="color: #9CA3AF; text-align: center;">{{ trackingMessage }}</div>
        <div v-else style="display: flex; flex-direction: column; gap: 20px;">
          <div v-for="(step, idx) in trackingSteps" :key="idx" style="display: flex; gap: 16px; position: relative;">
            <div v-if="idx < trackingSteps.length - 1" style="position: absolute; left: 7px; top: 16px; bottom: -20px; width: 2px; background: #E5E7EB;"></div>
            <div :style="{ width: '16px', height: '16px', borderRadius: '50%', background: idx === 0 ? 'var(--primary-500)' : '#D1D5DB', border: idx === 0 ? '4px solid #DBEAFE' : 'none', flexShrink: 0, marginTop: '2px', zIndex: 1 }"></div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div :style="{ fontSize: '13px', color: idx === 0 ? '#1F2937' : '#4B5563', fontWeight: idx === 0 ? '600' : 'normal' }">{{ step.desc }}</div>
              <div style="font-size: 11px; color: #9CA3AF;">{{ step.time }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Commission Panel -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title"><AppIcon name="money" />  分销佣金</div></div>
      <div class="panel-body">
        <div v-if="order.commissions.length === 0" class="empty-state">该订单未产生分销佣金</div>
        <div v-else class="commission-flow">
          <template v-for="commission in order.commissions" :key="commission.id">
            <div class="commission-card" :class="commission.commission_level === 1 ? 'blue-bg' : 'gold-bg'">
              <div class="comm-label">{{ commissionTitle(Number(commission.commission_level || 1)) }}</div>
              <div class="comm-name">{{ commission.promoter_name || '推广员' }}</div>
              <div class="comm-value">¥{{ formatFen(commission.commission_amount) }}</div>
              <div class="comm-percent">{{ commissionStatus(commission.status) }}</div>
            </div>
            <div class="flow-arrow">→</div>
          </template>
          <div class="commission-card green-bg">
            <div class="comm-label">实收减佣金</div>
            <div class="comm-name">—</div>
            <div class="comm-value" style="color: var(--success-500);">¥{{ formatFen(platformIncome) }}</div>
            <div class="comm-percent">实付扣除未退佣金</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Merchandise Info -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title"><AppIcon name="box" />  商品信息</div></div>
      <div class="panel-body">
        <div
          v-for="item in order.items"
          :key="item.id || item.product_id || item.product_name"
          style="display: flex; gap: 14px; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid #F9FAFB;"
        >
          <div class="product-icon-lg"><AppIcon :name="order.productIcon" size="32" /></div>
          <div style="flex: 1;">
            <div style="font-size: 16px; font-weight: 700; color: #111827;">{{ item.product_name }}</div>
            <div style="font-size: 12px; color: #6B7280; margin-top: 2px;">单价 ¥{{ formatFen(item.price) }}</div>
            <div style="font-size: 12px; color: #9CA3AF; margin-top: 6px;">× {{ item.quantity || 1 }}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 20px; font-weight: 800; color: var(--primary-500);">¥{{ formatFen(Number(item.price || 0) * Number(item.quantity || 1)) }}</div>
          </div>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 18px; margin-top: 16px; font-size: 13px; color: #6B7280;">
          <span>商品总额 ¥{{ formatFen(order.totalAmount) }}</span>
          <span v-if="order.discountAmount > 0">优惠 ¥{{ formatFen(order.discountAmount) }}</span>
          <strong style="color: var(--primary-500);">实付 ¥{{ formatFen(order.price * 100) }}</strong>
        </div>
      </div>
    </div>

    <!-- Order Timeline -->
    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header"><div class="panel-title"><AppIcon name="clipboard" />  订单流程</div></div>
      <div class="panel-body">
        <div class="timeline">
          <div v-for="item in timelineItems" :key="`${item.title}-${item.time}`" class="timeline-item">
            <div class="timeline-dot" :class="item.theme"></div>
            <div class="timeline-time">{{ item.time || '待处理' }}</div>
            <div class="timeline-content"><strong>{{ item.title }}</strong> — {{ item.content }}</div>
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
.btn-success {
  background: #ECFDF5;
  color: #16A34A;
  border: 1px solid #BBF7D0;
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
.empty-state {
  padding: 24px;
  border: 1px dashed #E5E7EB;
  border-radius: 10px;
  color: #9CA3AF;
  text-align: center;
  font-size: 13px;
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
.status-tag.blue {
  background: #EEF2FF;
  color: #4F46E5;
}
.status-tag.blue::before {
  background: #6366F1;
}
.status-tag.red {
  background: #FEF2F2;
  color: #DC2626;
}
.status-tag.red::before {
  background: #EF4444;
}
</style>
