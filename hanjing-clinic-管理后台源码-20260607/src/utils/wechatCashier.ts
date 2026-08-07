import request from '@/utils/request'

export type AdminPayStatus = {
  orderId: number | string
  orderNo: string
  status: string
  payMethod: string
  payAt?: string
  transactionId?: string
}

export async function createNativePay(orderId: number | string) {
  const res: any = await request.post('/api/admin/pay/native', { orderId })
  return res?.data || {}
}

export async function submitMicropay(orderId: number | string, authCode: string) {
  const res: any = await request.post('/api/admin/pay/micropay', { orderId, authCode })
  return res?.data || {}
}

export async function getAdminPayStatus(orderId: number | string): Promise<AdminPayStatus> {
  const res: any = await request.get(`/api/admin/pay/orders/${orderId}/status`)
  return res?.data || {}
}

export async function cancelAdminPayOrder(orderId: number | string) {
  return request.post(`/api/admin/pay/orders/${orderId}/cancel`)
}

export function isPaidStatus(status: string) {
  return ['paid', 'shipping', 'shipped', 'processing', 'completed'].includes(String(status || ''))
}

