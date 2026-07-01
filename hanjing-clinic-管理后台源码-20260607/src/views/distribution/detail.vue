<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { navigateToParent } from '@/utils/routeNavigation'
import request from '@/utils/request'

const route = useRoute()
const router = useRouter()
const distributorId = ref(route.params.id as string || '1')
const activeTab = ref('info')

const promoter = ref({
  id: distributorId.value,
  name: '',
  level: 'silver',
  code: '',
  phone: '',
  regDate: '',
  status: 'active',
  parentName: '',
  firstLevelDownline: 0,
  secondLevelDownline: 0,
  totalOrders: 0,
  totalAmount: 0,
  totalCommission: 0,
  availableCommission: 0,
  withdrawnAmount: 0
})

const commissionsList = ref<any[]>([])
const teamData = ref<any>({
  level1: [],
  level2: []
})
const loading = ref(false)

function getLevelName(level: string) {
  if (level === 'diamond') return '钻石'
  if (level === 'gold') return '金牌'
  if (level === 'silver') return '银牌'
  return '青铜'
}

const fetchDetail = async () => {
  loading.value = true
  try {
    const res: any = await request.get(`/api/admin/distribution/promoters/${distributorId.value}`)
    if (res.code === 200 && res.data) {
      const d = res.data
      promoter.value = {
        id: d.id.toString(),
        name: d.name,
        level: d.level,
        code: d.code,
        phone: d.phone,
        regDate: d.regDate ? new Date(d.regDate).toLocaleDateString() : '',
        status: d.status,
        parentName: d.parentName,
        firstLevelDownline: d.firstLevelDownline,
        secondLevelDownline: d.secondLevelDownline,
        totalOrders: d.totalOrders,
        totalAmount: d.totalAmount,
        totalCommission: d.totalCommission,
        availableCommission: d.availableCommission,
        withdrawnAmount: d.withdrawnAmount
      }
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('加载推广员详情失败')
  } finally {
    loading.value = false
  }
}

const fetchCommissions = async () => {
  try {
    const res: any = await request.get(`/api/admin/distribution/promoters/${distributorId.value}/commissions`)
    if (res.code === 200 && res.data) {
      commissionsList.value = res.data || []
    }
  } catch (error) {
    console.error(error)
  }
}

const fetchTeam = async () => {
  try {
    const res: any = await request.get(`/api/admin/distribution/promoters/${distributorId.value}/team`)
    if (res.code === 200 && res.data) {
      teamData.value = res.data
    }
  } catch (error) {
    console.error(error)
  }
}

function handleBack() {
  navigateToParent(router, route, '/promoter')
}

async function handleFreeze() {
  const nextStatus = promoter.value.status === 'active' ? 'frozen' : 'active'
  try {
    const res: any = await request.put(`/api/admin/distribution/promoters/${distributorId.value}/status`, { status: nextStatus })
    if (res.code === 200) {
      promoter.value.status = nextStatus
      MessagePlugin.success(nextStatus === 'active' ? '账号已成功解冻' : '账号已成功冻结')
    }
  } catch (error) {
    console.error(error)
    MessagePlugin.error('修改状态失败')
  }
}

function handleEdit() {
  router.push('/promoter/edit/' + distributorId.value)
}

onMounted(() => {
  fetchDetail()
  fetchCommissions()
  fetchTeam()
})
</script>

<template>
  <div class="page-container">
    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">
          {{ promoter.name || '推广员' }}
          <span class="level-badge" :style="{ background: promoter.level === 'diamond' ? 'linear-gradient(135deg, #8B5CF6, #6D28D9)' : (promoter.level === 'gold' ? 'linear-gradient(135deg, #F59E0B, #D97706)' : '#E5E7EB'), color: promoter.level === 'silver' ? '#4B5563' : '#fff' }">
            <AppIcon :name="promoter.level === 'diamond' ? 'gem' : (promoter.level === 'gold' ? 'medal-gold' : (promoter.level === 'silver' ? 'medal-silver' : 'medal-bronze'))" />  
            {{ getLevelName(promoter.level) }}
          </span>
        </div>
        <div class="page-title-sub">注册于 {{ promoter.regDate }} · 推广码 {{ promoter.code }}</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-danger" @click="handleFreeze">
          {{ promoter.status === 'active' ? '冻结账号' : '解冻账号' }}
        </button>
        <button class="btn btn-outline" @click="handleEdit"><AppIcon name="edit" />  编辑</button>
      </div>
    </div>

    <!-- Tabs Header -->
    <div class="tabs">
      <div class="tab" :class="{ active: activeTab === 'info' }" @click="activeTab = 'info'">数据总览</div>
      <div class="tab" :class="{ active: activeTab === 'team' }" @click="activeTab = 'team'">团队关系</div>
      <div class="tab" :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">推广订单</div>
      <div class="tab" :class="{ active: activeTab === 'flow' }" @click="activeTab = 'flow'">佣金流水</div>
    </div>

    <!-- Tab Contents -->
    <div style="margin-top: 20px;">
      <!-- Tab 1: Info (Data Overview) -->
      <div v-if="activeTab === 'info'">
        <!-- Stats cards -->
        <div class="card-grid-4">
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--primary-100); color: var(--primary-500);"><AppIcon name="team" /> </div>
            <div>
              <div class="mini-stat-value">{{ promoter.firstLevelDownline }}</div>
              <div class="mini-stat-label">一级下线</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--success-100); color: var(--success-500);"><AppIcon name="team" /> </div>
            <div>
              <div class="mini-stat-value">{{ promoter.secondLevelDownline }}</div>
              <div class="mini-stat-label">二级下线</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: #FFF9E6; color: #D4930A;"><AppIcon name="box" /> </div>
            <div>
              <div class="mini-stat-value">{{ promoter.totalOrders }}</div>
              <div class="mini-stat-label">推广订单</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--error-100); color: #D4930A;"><AppIcon name="money" /> </div>
            <div>
              <div class="mini-stat-value" style="color: #D4930A;">¥{{ (promoter.totalCommission / 100).toFixed(2) }}</div>
              <div class="mini-stat-label">累计佣金</div>
            </div>
          </div>
        </div>

        <!-- Team Relationship Preview -->
        <div class="panel" style="margin-top: 16px;">
          <div class="panel-header"><div class="panel-title"><AppIcon name="tree" />  团队关系</div></div>
          <div class="panel-body">
            <div class="tree-node">
              <div class="avatar avatar-sm" style="background: linear-gradient(135deg,#8B5CF6,#6D28D9);">
                {{ (promoter.name || '推').substring(0, 1) }}
              </div>
              <strong>{{ promoter.name || '推广员' }}</strong>
              <span class="tree-badge purple" v-if="promoter.level === 'diamond'"><AppIcon name="gem" />  钻石</span>
              <span class="tree-badge gold" v-else-if="promoter.level === 'gold'"><AppIcon name="medal-gold" />  金牌</span>
              <span class="tree-badge silver" v-else-if="promoter.level === 'silver'"><AppIcon name="medal-silver" />  银牌</span>
              <span class="tree-badge bronze" v-else><AppIcon name="medal-bronze" />  青铜</span>
              <span style="font-size: 12px; color: #9CA3AF; margin-left: auto;">一级 · {{ promoter.firstLevelDownline }}人</span>
            </div>
            <div class="tree-children">
              <!-- Render dynamic Level 1 downline list up to 5 items -->
              <div v-for="(sub, idx) in teamData.level1.slice(0, 5)" :key="idx" class="tree-node tree-line">
                <div class="avatar avatar-sm" :style="{ background: sub.level === 'diamond' ? '#8B5CF6' : (sub.level === 'gold' ? '#F59E0B' : '#9CA3AF') }" style="font-size: 11px; color:#fff">
                  {{ sub.name.substring(0, 1) }}
                </div>
                <strong style="font-size: 13px;">{{ sub.name }}</strong>
                <span class="tree-badge gold" v-if="sub.level === 'gold'"><AppIcon name="medal-gold" />  金</span>
                <span class="tree-badge purple" v-else-if="sub.level === 'diamond'"><AppIcon name="gem" />  钻</span>
                <span class="tree-badge silver" v-else-if="sub.level === 'silver'"><AppIcon name="medal-silver" />  银</span>
                <span class="tree-badge bronze" v-else-if="sub.level === 'bronze'"><AppIcon name="medal-bronze" />  铜</span>
                <span style="font-size: 11px; color: #9CA3AF; margin-left: 8px;">电话 {{ sub.phone || '未绑定' }}</span>
              </div>
              <div v-if="teamData.level1.length > 5" style="padding: 8px 0; font-size: 12px; color: #9CA3AF; text-align: center;">
                · · · 还有 {{ teamData.level1.length - 5 }} 位一级下线成员
              </div>
              <div v-if="teamData.level1.length === 0" style="padding: 16px; font-size: 12px; color: #9CA3AF; text-align: center;">
                暂无一级下线团队成员
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Team (Dedicated Tree View) -->
      <div v-if="activeTab === 'team'">
        <div class="panel" style="margin: 0;">
          <div class="panel-header"><div class="panel-title"><AppIcon name="team" />  团队下线明细</div></div>
          <div class="panel-body" style="padding: 0;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>电话</th>
                  <th>当前级别</th>
                  <th>团队类型</th>
                  <th>加入时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in teamData.level1" :key="'l1-'+idx">
                  <td style="font-weight: 600;">{{ item.name }}</td>
                  <td>{{ item.phone }}</td>
                  <td>
                    <span class="tree-badge purple" v-if="item.level === 'diamond'"><AppIcon name="gem" />  钻石</span>
                    <span class="tree-badge gold" v-else-if="item.level === 'gold'"><AppIcon name="medal-gold" />  金牌</span>
                    <span class="tree-badge silver" v-else-if="item.level === 'silver'"><AppIcon name="medal-silver" />  银牌</span>
                    <span class="tree-badge bronze" v-else-if="item.level === 'bronze'"><AppIcon name="medal-bronze" />  青铜</span>
                    <span style="color: #9CA3AF;" v-else>普通客户</span>
                  </td>
                  <td>一级下线</td>
                  <td>{{ item.joinDate ? new Date(item.joinDate).toLocaleDateString() : '—' }}</td>
                </tr>
                <tr v-for="(item, idx) in teamData.level2" :key="'l2-'+idx">
                  <td style="font-weight: 600;">{{ item.name }}</td>
                  <td>{{ item.phone }}</td>
                  <td>
                    <span class="tree-badge purple" v-if="item.level === 'diamond'"><AppIcon name="gem" />  钻石</span>
                    <span class="tree-badge gold" v-else-if="item.level === 'gold'"><AppIcon name="medal-gold" />  金牌</span>
                    <span class="tree-badge silver" v-else-if="item.level === 'silver'"><AppIcon name="medal-silver" />  银牌</span>
                    <span class="tree-badge bronze" v-else-if="item.level === 'bronze'"><AppIcon name="medal-bronze" />  青铜</span>
                    <span style="color: #9CA3AF;" v-else>普通客户</span>
                  </td>
                  <td>二级下线</td>
                  <td>{{ item.joinDate ? new Date(item.joinDate).toLocaleDateString() : '—' }}</td>
                </tr>
                <tr v-if="teamData.level1.length === 0 && teamData.level2.length === 0">
                  <td colspan="5" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无团队下级关系数据</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Tab 3: Orders -->
      <div v-if="activeTab === 'orders'">
        <div class="panel" style="margin: 0;">
          <table class="data-table">
            <thead>
              <tr>
                <th>订单单号</th>
                <th>下单日期</th>
                <th>购买商品</th>
                <th>交易金额</th>
                <th>分销结算状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(comm, idx) in commissionsList" :key="idx">
                <td style="font-family: monospace;">{{ comm.order_no }}</td>
                <td>{{ new Date(comm.created_at).toLocaleDateString() }}</td>
                <td>{{ comm.product_names || '推广商品' }}</td>
                <td style="font-weight: 700; color: var(--primary-500);">¥{{ (comm.order_amount / 100).toFixed(2) }}</td>
                <td>
                  <span class="status-tag green" v-if="comm.status === 'settled'">已结算</span>
                  <span class="status-tag gold" v-else-if="comm.status === 'pending'">账期锁定</span>
                  <span class="status-tag red" v-else-if="comm.status === 'refunded'">已退回/失效</span>
                  <span class="status-tag gray" v-else>{{ comm.status }}</span>
                </td>
              </tr>
              <tr v-if="commissionsList.length === 0">
                <td colspan="5" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无推广关联的订单</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 4: Commission Flow -->
      <div v-if="activeTab === 'flow'">
        <div class="panel" style="margin: 0;">
          <table class="data-table">
            <thead>
              <tr>
                <th>结算入账时间</th>
                <th>佣金类型</th>
                <th>推广来源</th>
                <th>入账金额</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(comm, idx) in commissionsList" :key="idx">
                <td style="font-size: 12px; color: #6B7280;">{{ new Date(comm.created_at).toLocaleString() }}</td>
                <td>
                  <span class="tag tag-green" v-if="comm.commission_level === 1">一级推广佣金</span>
                  <span class="tag tag-blue" v-else-if="comm.commission_level === 2">二级推广佣金</span>
                  <span class="tag tag-gray" v-else>其他佣金</span>
                </td>
                <td style="font-size: 13px;">下级用户 {{ comm.buyer_name || comm.patient_name }} 消费</td>
                <td style="font-weight: 700; color: #D4930A;">
                  +¥{{ (comm.commission_amount / 100).toFixed(2) }}
                </td>
                <td>
                  <span class="status-tag green" v-if="comm.status === 'settled'">已结算</span>
                  <span class="status-tag gold" v-else-if="comm.status === 'pending'">冻结中</span>
                  <span class="status-tag red" v-else-if="comm.status === 'refunded'">已扣回</span>
                </td>
              </tr>
              <tr v-if="commissionsList.length === 0">
                <td colspan="5" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无佣金入账流水记录</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
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

/* Tabs */
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid #E5E7EB;
}
.tab {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 150ms;
}
.tab.active {
  color: var(--primary-500);
  border-bottom-color: var(--primary-500);
  font-weight: 600;
}
.tab:hover:not(.active) {
  color: #374151;
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
.btn-outline {
  background: #fff;
  color: #374151;
  border: 1px solid #E5E7EB;
}
.btn-outline:hover {
  border-color: #BCCFFF;
  color: var(--primary-500);
}
.btn-danger {
  background: #FEF2F2;
  color: #DC2626;
  border: 1px solid #FECACA;
}
.btn-danger:hover {
  background: #FEE2E2;
}
.btn-xs {
  padding: 3px 8px;
  font-size: 11px;
}

/* Grids */
.card-grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.mini-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.mini-stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.mini-stat-value {
  font-size: 18px;
  font-weight: 800;
  color: #111827;
}
.mini-stat-label {
  font-size: 11px;
  color: #9CA3AF;
}

/* Level Gradient Badge */
.level-badge {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 9999px;
  background: linear-gradient(135deg, #8B5CF6, #6D28D9);
  color: #fff;
  font-weight: 600;
}

/* Tree Relationship structure */
.tree-node {
  padding: 8px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.tree-children {
  padding-left: 28px;
  border-left: 2px solid #F3F4F6;
  margin-left: 12px;
}
.tree-line {
  position: relative;
}
.tree-line::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 16px;
  height: 2px;
  background: #F3F4F6;
}

.tree-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 9999px;
  color: #fff;
}
.tree-badge.purple {
  background: linear-gradient(135deg, #8B5CF6, #6D28D9);
}
.tree-badge.gold {
  background: linear-gradient(135deg, #F59E0B, #D97706);
}
.tree-badge.silver {
  background: #9CA3AF;
}

/* Avatar */
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  flex-shrink: 0;
}
.avatar-sm {
  width: 28px;
  height: 28px;
  font-size: 11px;
}

/* Tags & Badges */
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.tag-green {
  background: #ECFDF5;
  color: #16A34A;
}
.tag-blue {
  background: #EEF4FF;
  color: #2A52D4;
}
.tag-red {
  background: #FEF2F2;
  color: #DC2626;
}

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

/* Data Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th {
  text-align: left;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: #9CA3AF;
  background: #F9FAFB;
  border-bottom: 1px solid #E5E7EB;
}
.data-table td {
  padding: 12px 14px;
  font-size: 13px;
  color: #4B5563;
  border-bottom: 1px solid #F3F4F6;
  vertical-align: middle;
}
.data-table tr:hover td {
  background: #F9FAFB;
}
</style>
