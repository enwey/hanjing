<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()
const searchKeyword = ref(localStorage.getItem('order_list_search_keyword') || '')
const currentPage = ref(1)
const pageSize = ref(30)
const activeTab = ref(localStorage.getItem('order_list_active_tab') || '全部')
const loading = ref(false)

watch(searchKeyword, (newVal) => { localStorage.setItem('order_list_search_keyword', newVal) })
watch(activeTab, (newVal) => { localStorage.setItem('order_list_active_tab', newVal) })

interface Order {
  id: string
  no: string
  patient: string
  avatarBg: string
  product: string
  store: string
  amount: number
  commission: string
  createTime: string
  status: string
  type: string
  shipping_address: any
  commissions: any[]
  raw?: any
}

const orders = ref<Order[]>([])

function formatFen(amount: number) {
  return (Number(amount || 0) / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

function formatCommission(commissions: any[]) {
  const validCommissions = (commissions || []).filter(item => item.status !== 'refunded')
  const total = validCommissions.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0)
  return total > 0 ? `¥${formatFen(total)}` : '—'
}

function formatDateTime(value: string) {
  if (!value) return ''
  return value.replace('T', ' ').slice(5, 16)
}

function formatFullDateTime(value: string) {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 19).replace('.000Z', '')
}

function getStatusLabel(status: string, type: string) {
  const map: Record<string, string> = {
    pending: '待付款',
    paid: type === 'offline' ? '自提待取货' : '已支付',
    shipping: '快递待发货',
    shipped: '已发货',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '退款审核中',
    refund_pending: '退款审核中',
    refunded: '已退款'
  }
  return map[status] || status || ''
}

function escapeCsv(value: any) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
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

const fetchOrders = async () => {
  loading.value = true
  try {
    const res: any = await request.get('/api/admin/orders')
    if (res.code === 200) {
      orders.value = res.data.map((item: any) => {
        let addr: any = {}
        try {
          addr = typeof item.shipping_address === 'string' ? JSON.parse(item.shipping_address || '{}') : (item.shipping_address || {})
        } catch(e) {}
        
        const productName = item.items && item.items[0] ? item.items[0].product_name : '订单商品'
        const productDesc = item.items && item.items.length > 1 ? `${productName} 等${item.items.length}件` : productName
        
        let storeLabel = ''
        if (item.type === 'online') {
          storeLabel = item.status === 'shipped' ? '快递寄送 (已发货)' : '快递寄送 (待发货)'
        } else if (item.status === 'processing') {
          storeLabel = `自提 (${addr.status || '待到货'})`
        } else if (item.status === 'paid') {
          storeLabel = '自提 (待取货)'
        } else {
          storeLabel = `自提 (${statusLabelMap[item.status] || '已处理'})`
        }
        
        return {
          id: item.id.toString(),
          no: item.order_no,
          patient: addr.receiver || item.buyer_nickname || item.user_name || '患者',
          avatarBg: '#5A85F5',
          product: productDesc,
          store: storeLabel,
          amount: item.pay_amount / 100,
          commission: formatCommission(item.commissions || []),
          createTime: formatDateTime(item.created_at),
          status: item.status,
          type: item.type,
          shipping_address: item.shipping_address,
          commissions: item.commissions || [],
          raw: item
        }
      })
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('获取订单列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchOrders()
})

const tabs = ['全部', '待取货', '待发货 (快递)', '待到货 (自提预订)', '已完成', '已退款']

const statusThemeMap: Record<string, string> = {
  completed: 'green',
  paid: 'blue',
  processing: 'blue',
  shipping: 'gold',
  shipped: 'green',
  refunding: 'red',
  refunded: 'red'
}

const statusLabelMap: Record<string, string> = {
  completed: '已完成',
  paid: '待取货',
  processing: '自提待到货',
  shipping: '快递待发货',
  shipped: '已发货',
  refunding: '退款中',
  refunded: '已退款'
}

const filteredOrders = computed(() => {
  let list = orders.value

  // Horizontal Tabs Filter
  if (activeTab.value === '待取货') {
    list = list.filter(o => o.type === 'offline' && o.status === 'paid')
  } else if (activeTab.value === '待发货 (快递)') {
    list = list.filter(o => o.type === 'online' && o.status === 'shipping')
  } else if (activeTab.value === '待到货 (自提预订)') {
    list = list.filter(o => o.type === 'offline' && o.status === 'processing')
  } else if (activeTab.value === '已完成') {
    list = list.filter(o => o.status === 'completed')
  } else if (activeTab.value === '已退款') {
    list = list.filter(o => o.status === 'refunded' || o.status === 'refunding')
  }

  // Search input filter
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(o => o.no.toLowerCase().includes(kw) || o.patient.includes(kw))
  }

  return list
})

const paginatedOrders = computed(() => {
  const filtered = filteredOrders.value
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filtered.slice(start, end)
})

function openOrderDetail(orderId: string) {
  router.push(`/order/detail/${orderId}`)
}

function handleExport() {
  const headers = [
    '订单ID', 
    '订单编号', 
    '订单类型', 
    '订单状态', 
    '下单时间', 
    '支付时间', 
    '支付渠道',
    '商品总额', 
    '优惠券抵扣', 
    '实际支付', 
    '下单会员ID', 
    '下单会员昵称', 
    '下单会员手机号', 
    '收件人/提货人', 
    '联系电话', 
    '收货地址/自提门店说明',
    '物流公司', 
    '快递单号', 
    '购买商品明细', 
    '推广佣金总额', 
    '分销明细'
  ]

  const rows = filteredOrders.value.map(row => {
    const raw = row.raw || {}
    const addr = typeof raw.shipping_address === 'string' ? JSON.parse(raw.shipping_address || '{}') : (raw.shipping_address || {})
    
    // 格式化商品明细
    const itemsStr = (raw.items || []).map((item: any) => 
      `${item.product_name} x${item.quantity || 1} (单价: ¥${formatFen(item.price)})`
    ).join('; ')

    // 格式化推广佣金明细
    const commissionsStr = (raw.commissions || []).map((c: any) => 
      `${c.commission_level === 1 ? '一级' : '二级'}:${c.promoter_name || '推广员'}(佣金: ¥${formatFen(c.commission_amount)})`
    ).join('; ')

    // 格式化订单状态文字
    const statusText = getStatusLabel(raw.status, raw.type)

    return [
      raw.id || '',
      raw.order_no || '',
      raw.type === 'online' ? '快递邮寄' : '门店自提',
      statusText,
      formatFullDateTime(raw.created_at),
      formatFullDateTime(raw.pay_at || raw.pay_time || ''),
      raw.pay_method === 'wechat' ? '微信支付' : (raw.pay_method || '—'),
      `¥${formatFen(raw.total_amount)}`,
      `¥${formatFen(raw.discount_amount)}`,
      `¥${formatFen(raw.pay_amount)}`,
      raw.user_id || '',
      raw.buyer_nickname || '—',
      raw.buyer_phone ? maskPhone(raw.buyer_phone) : '—',
      addr.receiver || '—',
      addr.phone || '—',
      raw.type === 'online' ? (addr.detail || '—') : (addr.detail || addr.store_name || addr.status || '门店自提'),
      addr.express_company || '—',
      addr.tracking_number || '—',
      itemsStr || '—',
      `¥${formatFen(raw.commission_total || 0)}`,
      commissionsStr || '—'
    ]
  })

  const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `订单导出数据-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  MessagePlugin.success('订单详情已成功导出')
}

async function handleComplete(row: Order) {
  try {
    const res: any = await request.post(`/api/admin/orders/${row.id}/complete`)
    if (res.code === 200) {
      MessagePlugin.success(`订单 ${row.no} 已成功核销完成交付！`)
      fetchOrders()
    }
  } catch (err) {
    console.error(err)
    MessagePlugin.error('核销操作失败')
  }
}

async function handleNotify(row: Order) {
  try {
    const res: any = await request.post(`/api/admin/orders/${row.id}/notify`)
    if (res.code === 200) {
      MessagePlugin.success('已通过微信模板消息通知该患者到店自提')
      fetchOrders()
    }
  } catch (err) {
    console.error(err)
    MessagePlugin.error('通知推送失败')
  }
}

function handleShip(row: Order) {
  router.push(`/order/detail/${row.id}`)
}

const operationColumnWidth = computed(() => {
  if (paginatedOrders.value.length === 0) return '80px'
  const hasProcessing = paginatedOrders.value.some(o => o.status === 'processing')
  const hasPickup = paginatedOrders.value.some(o => o.type === 'offline' && o.status === 'paid')
  const hasShipping = paginatedOrders.value.some(o => o.status === 'shipping')
  if (hasProcessing) return '240px'
  if (hasPickup) return '150px'
  if (hasShipping) return '140px'
  return '80px'
})

watch(operationColumnWidth, () => {
  nextTick(() => {
    window.dispatchEvent(new Event('resize'))
  })
})
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">订单管理</div>
        <div class="page-title-sub">管理所有商品及服务订单</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline" @click="handleExport"><AppIcon name="download" />  导出</button>
      </div>
    </div>

    <!-- 订单列表面板 -->
    <div class="panel">
      <!-- 过滤栏 -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <div
            v-for="tab in tabs"
            :key="tab"
            :class="['filter-tab', activeTab === tab ? 'active' : '']"
            @click="activeTab = tab"
          >
            {{ tab }}
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:10px;align-items:center;">
          <input type="text" v-model="searchKeyword" class="filter-input" placeholder="搜索订单号/患者名" style="width:200px;">
        </div>
      </div>

      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>订单号</th>
              <th>患者</th>
              <th>商品/服务</th>
              <th>门店</th>
              <th>金额</th>
              <th>分销佣金</th>
              <th>下单时间</th>
              <th>状态</th>
              <th :style="{ width: operationColumnWidth, minWidth: operationColumnWidth, textAlign: 'right' }">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedOrders" :key="row.id">
              <td class="id">{{ row.no }}</td>
              <td>
                <div class="name-cell" style="min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 8px;">
                  <div class="avatar-sm" :style="{ background: row.avatarBg, flexShrink: 0 }">
                    {{ row.patient[0] }}
                  </div>
                  <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ row.patient }}</span>
                </div>
              </td>
              <td>{{ row.product }}</td>
              <td>{{ row.store }}</td>
              <td style="font-weight:700;">¥{{ row.amount.toLocaleString() }}</td>
              <td :style="{
                color: row.commission !== '—' ? '#F59E0B' : 'inherit',
                fontWeight: row.commission !== '—' ? '600' : 'normal'
              }">
                {{ row.commission }}
              </td>
              <td style="font-size:12px;color:#9CA3AF;">{{ row.createTime }}</td>
              <td>
                <span :class="['status-tag', statusThemeMap[row.status]]">
                  {{ statusLabelMap[row.status] }}
                </span>
              </td>
              <td style="text-align: right;">
                <div class="actions" style="justify-content: flex-end;">
                  <button class="btn btn-xs btn-outline" @click="openOrderDetail(row.id)">详情</button>
                  <button v-if="row.status === 'processing'" class="btn btn-xs btn-outline" @click="handleNotify(row)" style="margin-right: 4px;">通知到货</button>
                  <button v-if="row.status === 'processing' || (row.type === 'offline' && row.status === 'paid')" class="btn btn-xs btn-success" @click="handleComplete(row)">提货核销</button>
                  <button v-if="row.status === 'shipping'" class="btn btn-xs btn-primary" @click="handleShip(row)">发货</button>
                </div>
              </td>
            </tr>
            <tr v-if="paginatedOrders.length === 0">
              <td colspan="9" style="text-align:center;color:#9CA3AF;padding:40px 0;">暂无匹配的订单数据</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 footer -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredOrders.length"
          :pageSizeOptions="[30, 60, 100]"
          style="width: 100%; border: none; padding: 0; display: flex; justify-content: flex-end;"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Panels */
.panel {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #F3F4F6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  margin-bottom: 0;
}

/* Button styles matching mockup global CSS rules */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 150ms ease;
  font-family: inherit;
}
.btn-primary {
  background: #3B6BF5;
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
  color: #3B6BF5;
}
.btn-danger {
  background: #FEF2F2;
  color: #EF4444;
  border: 1px solid #FECACA;
}
.btn-success {
  background: #ECFDF5;
  color: #16A34A;
  border: 1px solid #BBF7D0;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

/* Filter styles matching mockup */
.filter-bar {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #F3F4F6;
  background: #fff;
  flex-wrap: wrap;
  gap: 12px;
}
.filter-tabs {
  display: flex;
  gap: 0;
}
.filter-tab {
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  border: 1px solid #E5E7EB;
  background: #fff;
  transition: all 150ms;
}
.filter-tab:first-child {
  border-radius: 6px 0 0 6px;
}
.filter-tab:last-child {
  border-radius: 0 6px 6px 0;
}
.filter-tab + .filter-tab {
  border-left: none;
}
.filter-tab.active {
  background: #3B6BF5;
  color: #fff;
  border-color: #3B6BF5;
}

.filter-input, .filter-select {
  padding: 6px 12px;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  outline: none;
  transition: border-color 150ms;
}
.filter-input:focus, .filter-select:focus {
  border-color: #3B6BF5;
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-label {
  font-size: 13px;
  color: #6B7280;
}

/* Table styles matching mockup */
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #F9FAFB;
  border-bottom: 1px solid #F3F4F6;
}
.data-table td {
  padding: 14px 16px;
  font-size: 13px;
  color: #374151;
  border-bottom: 1px solid #F9FAFB;
  vertical-align: middle;
}
.data-table tr:hover td {
  background-color: #F9FAFB;
}

.id {
  font-family: monospace;
  font-weight: 600;
  color: #3B6BF5;
}
.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1F2937;
}
.avatar-sm {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  color: #fff;
  flex-shrink: 0;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.pagination-footer {
  padding: 16px 20px;
  border-top: 1px solid #F3F4F6;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

/* Rounded Status tags with indicator dots */
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}
.status-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.status-tag.green {
  background: #ecfdf5;
  color: #16a34a;
}
.status-tag.green::before {
  background: #10b981;
}
.status-tag.blue {
  background: #eef2ff;
  color: #4f46e5;
}
.status-tag.blue::before {
  background: #6366f1;
}
.status-tag.gold {
  background: #fff9e6;
  color: #d4930a;
}
.status-tag.gold::before {
  background: #f59e0b;
}
.status-tag.red {
  background: #fef2f2;
  color: #dc2626;
}
.status-tag.red::before {
  background: #ef4444;
}
</style>
