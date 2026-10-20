export interface FulfillmentPayment {
  order_id?: number
  order_no?: string
  order_status?: string
  pay_amount?: number | string | null
  pay_at?: string | null
  pay_method?: string | null
  refund_at?: string | null
}

const paidStatuses = new Set(['paid', 'processing', 'shipping', 'shipped', 'completed'])
export function canAdvanceDelivery(payment?: FulfillmentPayment | null) {
  return paidStatuses.has(payment?.order_status || '')
}
export function paymentLabel(payment?: FulfillmentPayment | null) {
  if (canAdvanceDelivery(payment)) return '已支付'
  return ({ pending: '待付款', cancelled: '已取消', refund_pending: '退款待审核', refunding: '退款处理中', refunded: '已退款' } as Record<string, string>)[payment?.order_status || ''] || '付款状态待核对'
}
export function paymentTheme(payment?: FulfillmentPayment | null): 'success' | 'warning' | 'danger' | 'default' {
  if (canAdvanceDelivery(payment)) return 'success'
  if (['refunding', 'refund_pending', 'pending'].includes(payment?.order_status || '')) return 'warning'
  if (payment?.order_status === 'refunded') return 'danger'
  return 'default'
}
export function paymentMethod(value?: string | null) {
  return ({ wechat: '微信小程序支付', wechat_native: '微信扫码支付', wechat_micropay: '微信付款码支付', cash: '现金', bank: '银行转账' } as Record<string, string>)[value || ''] || '未记录'
}
export function paymentMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '未记录'
  return `¥${(Number(value) / 100).toFixed(2)}`
}
