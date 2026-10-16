export interface CheckoutProduct {
  id: string;
  name: string;
  price: number;
  category?: string;
  status?: string;
}

export interface BillingItem {
  product_id: string;
  product_name: string;
  price: number;
  quantity: number;
  appointment_fee_kind?: 'consult_fee' | 'deposit_amount';
}

export async function appointmentBillingItems(request: any, products: CheckoutProduct[], appointmentId: string | number): Promise<BillingItem[]> {
  const res = await request.get(`/api/admin/appointments/${appointmentId}`)
  if (res.code !== 200 || !res.data?.id) throw new Error(res.message || '获取预约收费信息失败')
  const appointment = res.data
  if (['cancelled', 'no_show', 'refunding', 'refunded'].includes(appointment.status)) throw new Error('该预约不能继续收银')
  if (appointment.status !== 'pending_payment') return []
  const result: BillingItem[] = []
  for (const kind of ['consult_fee', 'deposit_amount'] as const) {
    const amount = Number(appointment[kind] || 0)
    if (amount <= 0) continue
    const product = products.find(p => p.category === 'service' && (kind === 'consult_fee'
      ? /挂号|门诊费/.test(p.name) : /定金/.test(p.name)))
    if (!product) throw new Error(`请先配置上架的${kind === 'consult_fee' ? '挂号费' : '预约定金'}服务项目`)
    result.push({ ...createBillingItem(product, { price: amount }), appointment_fee_kind: kind })
  }
  return result
}

export interface CheckoutReceiptResult {
  orderId: number | string;
  orderNo: string;
  patientName: string;
  total: string;
  discount: string;
  payable: string;
  payMethodText: string;
  time: string;
  items: BillingItem[];
}

export function createCashierSession(request: any) {
  let requestId = ''
  let fingerprint = ''
  const reset = () => { requestId = ''; fingerprint = '' }
  return {
    reset,
    async submit(payload: any) {
      const next = JSON.stringify(payload)
      if (fingerprint && fingerprint !== next) throw new Error('收银请求已发出，请先核对或取消原订单，不要修改后重复收款')
      if (!requestId) requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
      fingerprint = next
      const submittedId = requestId
      try {
        return await request.post('/api/admin/orders', { ...payload, request_id: requestId })
      } catch (error: any) {
        if (requestId === submittedId && [400, 401, 403, 404].includes(error.response?.status)) reset()
        throw error
      }
    }
  }
}

export async function confirmedCashierReceipt(request: any, receipt: any) {
  if (receipt.payAt) return receipt
  const res = await request.get(`/api/admin/pay/orders/${receipt.orderId}/status`)
  const status = res.data
  if (!status?.payAt || !['paid', 'processing', 'shipping', 'shipped', 'delivered', 'completed'].includes(status.status)) {
    throw new Error('收款凭证尚未确认，请核对订单支付状态')
  }
  return { ...receipt, payAt: status.payAt, payMethod: status.payMethod, status: status.status }
}

export async function fetchCheckoutProducts(request: any): Promise<CheckoutProduct[]> {
  const res = await request.get('/api/admin/products')
  if (res.code !== 200) {
    throw new Error(res.message || '获取商品列表失败')
  }

  return (res.data || [])
    .filter((product: any) => product.status === 'on')
    .map((product: any) => ({
      id: String(product.id),
      name: product.name,
      price: Number(product.price || 0),
      category: product.category,
      status: product.status
    }))
}

export function findCheckoutProduct(products: CheckoutProduct[], keyword?: string) {
  if (keyword) {
    return products.find(product => product.name.includes(keyword))
  }
  return products.find(product => product.name.includes('挂号') || product.name.includes('门诊费')) || products[0]
}

export function createBillingItem(product: CheckoutProduct, options: { name?: string; price?: number; quantity?: number } = {}): BillingItem {
  return {
    product_id: product.id,
    product_name: options.name || product.name,
    price: options.price ?? product.price,
    quantity: options.quantity || 1
  }
}

function formatAmount(amount: number) {
  return (Number(amount || 0) / 100).toFixed(2)
}

function formatPayMethod(method: string) {
  const methodMap: Record<string, string> = {
    cash: '现金',
    bank: '银行转账',
    wechat_native: '微信扫码支付',
    wechat_micropay: '微信付款码支付',
    wechat: '微信支付',
    alipay: '支付宝',
    pos: 'POS线下刷卡'
  }
  return methodMap[method] || method
}

const formatShanghaiDateTime = (value: string | number | Date) => {
  const text = String(value || '').trim()
  const matched = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (matched && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    return `${matched[1]} ${matched[2] || '00'}:${matched[3] || '00'}:${matched[4] || '00'}`
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return text
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const read = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}:${read('second')}`
}

export function createCheckoutReceiptResult(receipt: any): CheckoutReceiptResult {
  if (!receipt || !receipt.orderNo || !receipt.patientName || !receipt.payAt || !Array.isArray(receipt.items)) {
    throw new Error('订单凭证数据不完整')
  }

  return {
    orderId: receipt.orderId,
    orderNo: receipt.orderNo,
    patientName: receipt.patientName,
    total: formatAmount(receipt.totalAmount),
    discount: formatAmount(receipt.discountAmount),
    payable: formatAmount(receipt.payAmount),
    payMethodText: formatPayMethod(receipt.payMethod),
    time: formatShanghaiDateTime(receipt.payAt),
    items: receipt.items.map((item: any) => ({
      product_id: String(item.productId),
      product_name: item.productName,
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0)
    }))
  }
}
