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
    wechat: '微信支付',
    alipay: '支付宝',
    pos: 'POS线下刷卡'
  }
  return methodMap[method] || method
}

const formatShanghaiDateTime = (value: string | number | Date) => {
  const text = String(value || '').trim()
  const matched = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (matched) {
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
