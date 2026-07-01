<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { navigateToParent } from '@/utils/routeNavigation'

const route = useRoute()
const router = useRouter()
const orderId = ref(route.params.id as string || '1')

/* ---- Express Tracking & Invoice State ---- */
const carrier = ref('')
const trackingNo = ref('')
const loadingTracking = ref(false)
const trackingSteps = ref<any[]>([])

const invoiceDialogVisible = ref(false)
const invoiceViewerVisible = ref(false)
const submittingInvoice = ref(false)
const invoiceForm = ref({
  type: 'personal',
  title: '',
  tax_id: ''
})

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
  return value.replace('T', ' ').slice(0, 16)
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
  return Math.max(0, Number(order.value.price || 0) * 100 - commissionTotal.value)
})

const timelineItems = computed(() => {
  const result: Array<{ time: string; title: string; content: string; theme: string }> = []
  
  // 1. 下单创建 (始终存在并且已完成)
  result.push({
    time: order.value.createTime || '',
    title: '下单创建',
    content: `订单创建，订单金额 ¥${formatFen(order.value.totalAmount)}`,
    theme: 'green'
  })

  const status = order.value.status
  const type = order.value.type

  // 2. 区分取消流程与退款流程
  if (status === 'cancelled') {
    result.push({
      time: order.value.updateTime || '',
      title: '订单已取消',
      content: '订单已取消关闭，库存及已占用优惠券已释放。',
      theme: 'gray'
    })
    return result
  }

  if (status === 'refunding' || status === 'refund_pending' || status === 'refunded') {
    // 支付成功
    result.push({
      time: order.value.payTime || '',
      title: '支付成功',
      content: `${order.value.payMethod || '微信支付'}，实付 ¥${formatFen(order.value.price * 100)}`,
      theme: 'green'
    })
    // 申请退款
    result.push({
      time: order.value.updateTime || '',
      title: '申请退款',
      content: `用户已提交退款申请，原因: ${order.value.shipping_address?.refund_reason || '正常退款'}`,
      theme: 'green'
    })
    // 退款结果
    if (status === 'refunded') {
      result.push({
        time: order.value.updateTime || '',
        title: '退款成功',
        content: '管理员已审核通过，退款资金原路退回，分销佣金已退回。',
        theme: 'green'
      })
    } else {
      result.push({
        time: '进行中',
        title: '退款审核中',
        content: '退款申请已提交，等待管理员审核处理。',
        theme: 'gold'
      })
    }
    return result
  }

  // 3. 实付成功流程 (线上配送或门店自提)
  // 支付成功
  const hasPaid = ['paid', 'shipping', 'shipped', 'processing', 'completed'].includes(status)
  if (hasPaid || order.value.payTime) {
    result.push({
      time: order.value.payTime || '',
      title: '支付成功',
      content: `${order.value.payMethod || '微信支付'}，实付 ¥${formatFen(order.value.price * 100)}`,
      theme: 'green'
    })
  } else {
    result.push({
      time: '待处理',
      title: '支付成功',
      content: '等待用户完成付款。',
      theme: 'gray'
    })
  }

  if (type === 'offline') {
    // 【流程二：门店自提流程】
    // 自提待到货
    if (status === 'processing') {
      result.push({
        time: '进行中',
        title: '自提待到货',
        content: '自提订单已支付，等待商品到店。',
        theme: 'gold'
      })
      result.push({
        time: '待处理',
        title: '待到店取货',
        content: '商品到店后，将发送到货通知并等待患者取货。',
        theme: 'gray'
      })
      result.push({
        time: '待处理',
        title: '提货完成',
        content: '患者到店并出示凭证，核销后交易完成。',
        theme: 'gray'
      })
    } else if (status === 'paid') {
      result.push({
        time: order.value.updateTime || '',
        title: '商品已到店',
        content: '商品已配货到店，已发送到货消息通知。',
        theme: 'green'
      })
      result.push({
        time: '进行中',
        title: '待到店取货',
        content: '等待患者到店提取设备及配件。',
        theme: 'gold'
      })
      result.push({
        time: '待处理',
        title: '提货完成',
        content: '患者到店并出示凭证，核销后交易完成。',
        theme: 'gray'
      })
    } else if (status === 'completed') {
      result.push({
        time: order.value.updateTime || '',
        title: '商品已到店',
        content: '商品已配货到店并完成自提通知。',
        theme: 'green'
      })
      result.push({
        time: order.value.updateTime || '',
        title: '到店已取货',
        content: '患者已到店，核对无误后提走商品。',
        theme: 'green'
      })
      result.push({
        time: order.value.updateTime || '',
        title: '提货完成',
        content: '自提商品已核销交付，订单交易成功完成。',
        theme: 'green'
      })
    } else {
      // 待付款状态
      result.push({
        time: '待处理',
        title: '自提待到货',
        content: '等待商品到店。',
        theme: 'gray'
      })
      result.push({
        time: '待处理',
        title: '待到店取货',
        content: '等待患者到店取货。',
        theme: 'gray'
      })
      result.push({
        time: '待处理',
        title: '提货完成',
        content: '患者到店并出示凭证，核销后交易完成。',
        theme: 'gray'
      })
    }
  } else {
    // 【流程一：快递邮寄流程】
    // 待发货 / 已发货
    if (status === 'shipping' || status === 'paid') {
      result.push({
        time: '进行中',
        title: '待发货',
        content: '快递订单已支付，等待仓库分拣并录入物流运单发货。',
        theme: 'gold'
      })
      result.push({
        time: '待处理',
        title: '已发货',
        content: '商品发出后，可在此查询物流运单追踪。',
        theme: 'gray'
      })
      result.push({
        time: '待处理',
        title: '订单完成',
        content: '用户签收或自动收货后，交易成功完成。',
        theme: 'gray'
      })
    } else if (status === 'shipped') {
      result.push({
        time: order.value.updateTime || '',
        title: '已发货',
        content: `商品已发出。${carrier.value || '快递公司'}: ${trackingNo.value || '运单发出'}`,
        theme: 'green'
      })
      result.push({
        time: '进行中',
        title: '待确认收货',
        content: '商品运输中，等待患者确认收货。',
        theme: 'gold'
      })
      result.push({
        time: '待处理',
        title: '订单完成',
        content: '用户签收并确认，或系统到期自动收货后交易完成。',
        theme: 'gray'
      })
    } else if (status === 'completed') {
      result.push({
        time: order.value.updateTime || '',
        title: '已发货',
        content: `商品已发出。${carrier.value || '快递公司'}: ${trackingNo.value || '配送成功'}`,
        theme: 'green'
      })
      result.push({
        time: order.value.updateTime || '',
        title: '已确认收货',
        content: '患者已签收并确认收到商品。',
        theme: 'green'
      })
      result.push({
        time: order.value.updateTime || '',
        title: '订单完成',
        content: '订单交易已全部成功完成，已转入售后服务期。',
        theme: 'green'
      })
    } else {
      // 待付款状态
      result.push({
        time: '待处理',
        title: '待发货',
        content: '等待仓库录入运单发货。',
        theme: 'gray'
      })
      result.push({
        time: '待处理',
        title: '已发货',
        content: '商品发出后将产生物流追踪。',
        theme: 'gray'
      })
      result.push({
        time: '待处理',
        title: '订单完成',
        content: '确认收货后交易完成。',
        theme: 'gray'
      })
    }
  }

  return result
})

const fetchTrackingLogs = async () => {
  loadingTracking.value = true
  try {
    const res: any = await request.get(`/api/admin/orders/${orderId.value}/tracking`)
    if (res.code === 200 && res.data) {
      trackingSteps.value = res.data.steps || []
    }
  } catch (error) {
    console.error('Failed to load tracking logs:', error)
  } finally {
    loadingTracking.value = false
  }
}

function handleOpenInvoiceDialog() {
  invoiceForm.value = {
    type: 'personal',
    title: order.value.patient || '',
    tax_id: ''
  }
  invoiceDialogVisible.value = true
}

const handleConfirmInvoice = async () => {
  if (!invoiceForm.value.title.trim()) {
    MessagePlugin.warning('请输入发票抬头')
    return
  }
  if (invoiceForm.value.type === 'company' && !invoiceForm.value.tax_id.trim()) {
    MessagePlugin.warning('请输入企业纳税人识别号')
    return
  }

  submittingInvoice.value = true
  try {
    const res: any = await request.post(`/api/admin/orders/${orderId.value}/invoice`, {
      title: invoiceForm.value.title.trim(),
      tax_id: invoiceForm.value.type === 'company' ? invoiceForm.value.tax_id.trim() : ''
    })
    if (res.code === 200) {
      MessagePlugin.success('电子发票开具成功！')
      invoiceDialogVisible.value = false
      fetchOrderDetail()
    }
  } catch (error) {
    console.error('Failed to issue invoice:', error)
    MessagePlugin.error('开票失败，请检查后端服务')
  } finally {
    submittingInvoice.value = false
  }
}

function handlePrintInvoice() {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  const itemsHtml = (order.value.invoice_info?.items || []).map((item: any) => `
    <tr style="border-bottom: 1px dashed #DDD;">
      <td style="padding: 6px; font-size: 12px; color: #333;">*健康服务* ${item.name}</td>
      <td style="text-align: right; padding: 6px; font-size: 12px; color: #333;">${(item.price / 100).toFixed(2)}</td>
      <td style="text-align: right; padding: 6px; font-size: 12px; color: #333;">${item.quantity}</td>
      <td style="text-align: right; padding: 6px; font-size: 12px; color: #333;">${(item.total / 100).toFixed(2)}</td>
    </tr>
  `).join('')

  const taxpayerId = order.value.invoice_info?.taxpayer_id || ''
  const companyName = order.value.invoice_info?.company_name || ''
  const title = order.value.invoice_info?.title || ''
  const taxId = order.value.invoice_info?.tax_id || ''
  const invoiceCode = order.value.invoice_info?.invoice_code || ''
  const invoiceNo = order.value.invoice_info?.invoice_no || ''
  const createdAt = order.value.invoice_info?.created_at ? new Date(order.value.invoice_info.created_at).toLocaleString() : ''
  const totalAmount = order.value.invoice_info ? (order.value.invoice_info.amount / 100).toFixed(2) : '0.00'

  const taxIdHtml = taxId ? `<div>纳税人识别号：${taxId}</div>` : ''

  printWindow.document.write(`
    <html>
      <head>
        <title>电子发票 - ${invoiceNo}</title>
        <style>
          body { font-family: monospace; font-size: 12px; color: #111; padding: 20px; line-height: 1.6; }
          .container { max-width: 600px; margin: 0 auto; border: 1px solid #CCC; padding: 20px; border-radius: 8px; }
          .title { text-align: center; font-size: 18px; font-weight: bold; color: #B91C1C; border-bottom: 2px double #B91C1C; padding-bottom: 8px; margin-bottom: 10px; }
          .meta-info { display: flex; justify-content: space-between; color: #666; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          .section-table tr { border-bottom: 1px solid #B91C1C; }
          .section-table td { padding: 6px; }
          .items-table th { border-bottom: 1px solid #B91C1C; color: #B91C1C; text-align: left; padding: 6px; background: #FEF2F2; }
          .items-table td { padding: 6px; }
          .total-row { border-top: 1px solid #B91C1C; padding-top: 10px; display: flex; justify-content: space-between; font-weight: bold; color: #B91C1C; font-size: 14px; }
        </style>
      </head>
      <body onload="window.print(); window.close();">
        <div class="container">
          <div class="title">电子增值税普通发票</div>
          <div class="meta-info">
            <span>发票代码：${invoiceCode}</span>
            <span>发票号码：${invoiceNo}</span>
            <span>开票日期：${createdAt}</span>
          </div>
          <table class="section-table">
            <tr style="border-top: 1px solid #B91C1C;">
              <td style="width: 80px; font-weight: bold; color: #B91C1C; background: #FEF2F2;">购买方</td>
              <td>
                <div>名称：${title}</div>
                ${taxIdHtml}
              </td>
            </tr>
            <tr>
              <td style="font-weight: bold; color: #B91C1C; background: #FEF2F2;">销售方</td>
              <td>
                <div>名称：${companyName}</div>
                <div>纳税人识别号：${taxpayerId}</div>
                <div>地址、电话：深圳市福田区深南大道999号 0755-88888888</div>
              </td>
            </tr>
          </table>
          <table class="items-table">
            <thead>
              <tr>
                <th>货物或应税劳务、服务名称</th>
                <th style="text-align: right;">单价 (元)</th>
                <th style="text-align: right; width: 60px;">数量</th>
                <th style="text-align: right;">金额 (元)</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="total-row">
            <span>合  计 (含税)</span>
            <span>¥${totalAmount}</span>
          </div>
        </div>
      </body>
    </html>
  `)
  printWindow.document.close()
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
        <div class="header">鼾静健康诊所</div>
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
          鼾静健康诊所 · 鼾声分析管理系统
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
      const firstItem = items[0] || {}
      const isOnline = o.type === 'online'
      carrier.value = addr.express_company || carrier.value
      trackingNo.value = addr.tracking_number || ''
      
      order.value = {
        id: o.id.toString(),
        no: o.order_no,
        status: o.status,
        createTime: formatDateTime(o.created_at),
        payTime: formatDateTime(o.pay_time || o.paid_at || ''),
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
        payMethod: o.pay_method || '微信支付',
        productIcon: 'box',
        items: items.length > 0 ? items : [{
          product_name: firstItem.product_name || '订单商品',
          price: o.pay_amount,
          quantity: 1
        }],
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
          <span class="status-tag gold" v-if="order.status === 'shipping'">待发货</span>
          <span class="status-tag blue" v-else-if="order.status === 'paid'">待取货</span>
          <span class="status-tag blue" v-else-if="order.status === 'processing'">自提待到货</span>
          <span class="status-tag green" v-else-if="order.status === 'completed'">已完成</span>
          <span class="status-tag green" v-else-if="order.status === 'shipped'">已发货</span>
          <span class="status-tag red" v-else-if="order.status === 'refunding' || order.status === 'refund_pending'">退款中</span>
          <span class="status-tag red" v-else-if="order.status === 'refunded'">已退款</span>
        </div>
        <div class="page-title-sub">下单时间 {{ order.createTime }}</div>
      </div>
      <div class="action-buttons" style="display: flex; gap: 8px; align-items: center;">
        <!-- Print Receipt Action -->
        <button class="btn btn-outline" v-if="['paid', 'completed', 'shipped'].includes(order.status)" @click="handlePrintReceipt"><AppIcon name="printer" />  打印小票</button>
        <!-- E-Invoice Actions -->
        <button class="btn btn-outline" v-if="['paid', 'completed', 'shipped'].includes(order.status) && !order.invoice_info" @click="handleOpenInvoiceDialog"><AppIcon name="clipboard" />  开具电子发票</button>
        <button class="btn btn-outline" v-if="order.invoice_info" @click="invoiceViewerVisible = true"><AppIcon name="clipboard" />  查看电子发票</button>

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

    <!-- Invoice Info Panel -->
    <div v-if="order.invoice_info" class="panel" style="margin-top: 16px;">
      <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
        <div class="panel-title"><AppIcon name="clipboard" />  电子发票信息</div>
        <button class="btn btn-xs btn-outline" @click="invoiceViewerVisible = true">查看发票详情</button>
      </div>
      <div class="panel-body" style="padding: 16px 20px;">
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
          <div>
            <div style="font-size: 12px; color: #9CA3AF; margin-bottom: 4px;">发票代码</div>
            <div style="font-size: 13px; color: #1F2937; font-weight: 600;">{{ order.invoice_info.invoice_code }}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #9CA3AF; margin-bottom: 4px;">发票号码</div>
            <div style="font-size: 13px; color: #1F2937; font-weight: 600;">{{ order.invoice_info.invoice_no }}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #9CA3AF; margin-bottom: 4px;">发票抬头</div>
            <div style="font-size: 13px; color: #1F2937; font-weight: 600;">{{ order.invoice_info.title }}</div>
          </div>
          <div>
            <div style="font-size: 12px; color: #9CA3AF; margin-bottom: 4px;">税额 / 总额</div>
            <div style="font-size: 13px; color: #1F2937; font-weight: 600; color: #10B981;">¥{{ formatFen(order.invoice_info.amount) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Logistics Tracking Panel -->
    <div v-if="order.type === 'online' && (order.status === 'shipped' || order.status === 'completed')" class="panel" style="margin-top: 16px;">
      <div class="panel-header">
        <div class="panel-title"><AppIcon name="map-pin" />  物流轨迹追踪</div>
      </div>
      <div class="panel-body" style="padding: 20px 24px;">
        <div v-if="loadingTracking" style="text-align: center; color: #9CA3AF; padding: 10px;">加载物流中...</div>
        <div v-else-if="trackingSteps.length === 0" style="color: #9CA3AF; text-align: center;">暂无物流轨迹信息</div>
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
            <div class="comm-label">平台收入</div>
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

    <!-- Issue Invoice Dialog -->
    <t-dialog
      v-model:visible="invoiceDialogVisible"
      header="开具电子发票"
      @confirm="handleConfirmInvoice"
      :confirm-loading="submittingInvoice"
    >
      <div class="form-container" style="padding: 12px 0; display: flex; flex-direction: column; gap: 14px;">
        <div class="form-group">
          <label class="form-label">发票抬头类型</label>
          <div style="display: flex; gap: 16px; margin-top: 6px;">
            <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: #374151;">
              <input type="radio" value="personal" v-model="invoiceForm.type"> 个人
            </label>
            <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: #374151;">
              <input type="radio" value="company" v-model="invoiceForm.type"> 企业
            </label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">发票抬头名称</label>
          <input type="text" class="form-control" v-model="invoiceForm.title" placeholder="请输入发票抬头">
        </div>
        <div class="form-group" v-if="invoiceForm.type === 'company'">
          <label class="form-label">纳税人识别号 / 统一社会信用代码</label>
          <input type="text" class="form-control" v-model="invoiceForm.tax_id" placeholder="请输入纳税人识别号">
        </div>
      </div>
    </t-dialog>

    <!-- Invoice Viewer Dialog -->
    <t-dialog
      v-model:visible="invoiceViewerVisible"
      header="电子增值税普通发票"
      :footer="null"
      width="640px"
    >
      <div style="background: #FAFAFA; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px; color: #111; font-family: monospace; font-size: 12px; line-height: 1.6; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-top: 10px;">
        <div style="text-align: center; font-size: 18px; font-weight: 700; color: #B91C1C; letter-spacing: 4px; margin-bottom: 4px; border-bottom: 2px double #B91C1C; padding-bottom: 8px;">
          电子增值税普通发票
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; color: #666; font-size: 11px;">
          <span>发票代码：{{ order.invoice_info?.invoice_code }}</span>
          <span>发票号码：{{ order.invoice_info?.invoice_no }}</span>
          <span>开票日期：{{ order.invoice_info?.created_at ? new Date(order.invoice_info.created_at).toLocaleString() : '' }}</span>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #B91C1C;">
          <tr style="border-bottom: 1px solid #B91C1C; background: #FEF2F2;">
            <td style="width: 80px; padding: 6px; font-weight: 600; color: #B91C1C; vertical-align: middle; border-right: 1px solid #B91C1C;">购买方</td>
            <td style="padding: 6px;">
              <div>名称：{{ order.invoice_info?.title }}</div>
              <div v-if="order.invoice_info?.tax_id">纳税人识别号：{{ order.invoice_info?.tax_id }}</div>
            </td>
          </tr>
          <tr style="background: #FFF;">
            <td style="padding: 6px; font-weight: 600; color: #B91C1C; vertical-align: middle; border-right: 1px solid #B91C1C;">销售方</td>
            <td style="padding: 6px;">
              <div>名称：{{ order.invoice_info?.company_name }}</div>
              <div>纳税人识别号：{{ order.invoice_info?.taxpayer_id }}</div>
              <div>地址、电话：深圳市福田区深南大道999号 0755-88888888</div>
            </td>
          </tr>
        </table>

        <!-- Itemized Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #B91C1C;">
          <thead>
            <tr style="border-bottom: 1px solid #B91C1C; color: #B91C1C; font-weight: 600; background: #FEF2F2;">
              <th style="text-align: left; padding: 6px; border-right: 1px solid #B91C1C;">货物或应税劳务、服务名称</th>
              <th style="text-align: right; padding: 6px; border-right: 1px solid #B91C1C; width: 80px;">单价 (元)</th>
              <th style="text-align: right; padding: 6px; border-right: 1px solid #B91C1C; width: 50px;">数量</th>
              <th style="text-align: right; padding: 6px; width: 90px;">金额 (元)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in order.invoice_info?.items" :key="index" style="border-bottom: 1px dashed #E5E7EB; background: #FFF;">
              <td style="padding: 6px; color: #333; border-right: 1px solid #B91C1C;">*健康服务* {{ item.name }}</td>
              <td style="text-align: right; padding: 6px; color: #333; border-right: 1px solid #B91C1C;">{{ (item.price / 100).toFixed(2) }}</td>
              <td style="text-align: right; padding: 6px; color: #333; border-right: 1px solid #B91C1C;">{{ item.quantity }}</td>
              <td style="text-align: right; padding: 6px; color: #333;">{{ (item.total / 100).toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- Total -->
        <div style="border-top: 1px solid #B91C1C; padding-top: 8px; display: flex; justify-content: space-between; font-weight: bold; color: #B91C1C; font-size: 14px;">
          <span>合  计 (含税)</span>
          <span>¥{{ order.invoice_info ? (order.invoice_info.amount / 100).toFixed(2) : '0.00' }}</span>
        </div>
      </div>
      <div style="text-align: right; margin-top: 16px;">
        <button class="btn btn-outline" @click="handlePrintInvoice" style="height: 32px; padding: 0 16px; font-size: 13px;"><AppIcon name="printer" />  打印电子发票</button>
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
