<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { navigateToParent } from '@/utils/routeNavigation'

const route = useRoute()
const router = useRouter()
const distributorId = ref(route.params.id as string || '1')
const activeTab = ref('info')

const promoter = ref({
  id: distributorId.value,
  name: '赵芳芳',
  level: '钻石',
  code: 'FXY001',
  phone: '139****8888',
  regDate: '2025-08-12',
  status: '正常',
  parentName: '陈经理'
})

/* ---- Commission Flow List ---- */
const commissions = ref([
  { time: '5/29 10:22', type: '一级佣金', typeTag: 'green', source: '陈建国购买CPAP呼吸机', amount: '+¥1,335', status: '已结算', statusTag: 'green' },
  { time: '5/29 09:15', type: '二级佣金', typeTag: 'blue', source: '李雪琴推广：李雪琴购买止鼾器', amount: '+¥64', status: '已结算', statusTag: 'green' },
  { time: '5/28 18:32', type: '提现', typeTag: 'red', source: '提现至微信零钱', amount: '-¥1,500', status: '已到账', statusTag: 'green' },
  { time: '5/28 08:30', type: '一级佣金', typeTag: 'green', source: '张明华购买睡眠监测套餐', amount: '+¥552', status: '冻结中', statusTag: 'gold' }
])

function handleBack() {
  navigateToParent(router, route, '/promoter')
}

function handleFreeze() {
  if (promoter.value.status === '正常') {
    promoter.value.status = '已冻结'
    MessagePlugin.success('账号已成功冻结')
  } else {
    promoter.value.status = '正常'
    MessagePlugin.success('账号已成功解冻')
  }
}

function handleEdit() {
  MessagePlugin.info('跳转编辑推广员信息...')
}
</script>

<template>
  <div class="page-container">


    <!-- Page Title Row -->
    <div class="page-title-row">
      <div>
        <div class="page-title">
          {{ promoter.name }}
          <span class="level-badge"><AppIcon name="gem" />  钻石</span>
        </div>
        <div class="page-title-sub">注册于 {{ promoter.regDate }} · 推广码 {{ promoter.code }}</div>
      </div>
      <div class="action-buttons">
        <button class="btn btn-danger" @click="handleFreeze">
          {{ promoter.status === '正常' ? '冻结账号' : '解冻账号' }}
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
              <div class="mini-stat-value">56</div>
              <div class="mini-stat-label">一级下线</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--success-100); color: var(--success-500);"><AppIcon name="team" /> </div>
            <div>
              <div class="mini-stat-value">128</div>
              <div class="mini-stat-label">二级下线</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: #FFF9E6; color: #D4930A;"><AppIcon name="box" /> </div>
            <div>
              <div class="mini-stat-value">342</div>
              <div class="mini-stat-label">推广订单</div>
            </div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-icon" style="background: var(--error-100); color: #D4930A;"><AppIcon name="money" /> </div>
            <div>
              <div class="mini-stat-value" style="color: #D4930A;">¥18,640</div>
              <div class="mini-stat-label">累计佣金</div>
            </div>
          </div>
        </div>

        <!-- Team Relationship Preview -->
        <div class="panel" style="margin-top: 16px;">
          <div class="panel-header"><div class="panel-title"><AppIcon name="tree" />  团队关系</div></div>
          <div class="panel-body">
            <div class="tree-node">
              <div class="avatar avatar-sm" style="background: linear-gradient(135deg,#8B5CF6,#6D28D9);">赵</div>
              <strong>赵芳芳</strong>
              <span class="tree-badge purple"><AppIcon name="gem" />  钻石</span>
              <span style="font-size: 12px; color: #9CA3AF; margin-left: auto;">一级 · 56人</span>
            </div>
            <div class="tree-children">
              <!-- Node 1 -->
              <div class="tree-node tree-line">
                <div class="avatar avatar-sm" style="background: #F59E0B; font-size: 11px;">李</div>
                <strong style="font-size: 13px;">李雪琴</strong>
                <span class="tree-badge gold"><AppIcon name="medal-gold" />  金</span>
                <span style="font-size: 11px; color: #9CA3AF; margin-left: 8px;">二级下线 45人</span>
              </div>
              <div class="tree-children">
                <div class="tree-node tree-line">
                  <div class="avatar avatar-sm" style="background: #D1D5DB; font-size: 10px; color: #4B5563;">孙</div>
                  <span style="font-size: 13px;">孙大鹏</span>
                  <span class="tree-badge silver"><AppIcon name="medal-silver" />  银</span>
                  <span style="font-size: 11px; color: #9CA3AF;">3人</span>
                </div>
                <div class="tree-node tree-line">
                  <div class="avatar avatar-sm" style="background: #EC4899; font-size: 10px;">陈</div>
                  <span style="font-size: 13px;">陈小红</span>
                  <span class="tree-badge silver"><AppIcon name="medal-silver" />  银</span>
                  <span style="font-size: 11px; color: #9CA3AF;">5人</span>
                </div>
              </div>
              
              <!-- Node 2 -->
              <div class="tree-node tree-line">
                <div class="avatar avatar-sm" style="background: #10B981; font-size: 11px;">王</div>
                <strong style="font-size: 13px;">王秀兰</strong>
                <span class="tree-badge gold"><AppIcon name="medal-gold" />  金</span>
                <span style="font-size: 11px; color: #9CA3AF; margin-left: 8px;">二级下线 32人</span>
              </div>

              <!-- Node 3 -->
              <div class="tree-node tree-line">
                <div class="avatar avatar-sm" style="background: #6B7280; font-size: 11px;">刘</div>
                <span style="font-size: 13px;">刘建国</span>
                <span class="tree-badge silver"><AppIcon name="medal-silver" />  银</span>
                <span style="font-size: 11px; color: #9CA3AF; margin-left: 8px;">8人</span>
              </div>
              
              <div style="padding: 8px 0; font-size: 12px; color: #9CA3AF; text-align: center;">
                · · · 还有 52 位一级下线
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Team (Dedicated Tree View) -->
      <div v-if="activeTab === 'team'">
        <div class="panel" style="margin: 0;">
          <div class="panel-header"><div class="panel-title"><AppIcon name="team" />  下级团队明细</div></div>
          <div class="panel-body" style="padding: 0;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>推广码</th>
                  <th>当前级别</th>
                  <th>带来订单数</th>
                  <th>加入时间</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="font-weight: 600;">李雪琴</td>
                  <td>LIP023</td>
                  <td><span class="tree-badge gold"><AppIcon name="medal-gold" />  金</span></td>
                  <td>92</td>
                  <td>2025-09-02</td>
                </tr>
                <tr>
                  <td style="font-weight: 600;">王秀兰</td>
                  <td>WAP082</td>
                  <td><span class="tree-badge gold"><AppIcon name="medal-gold" />  金</span></td>
                  <td>74</td>
                  <td>2025-10-18</td>
                </tr>
                <tr>
                  <td style="font-weight: 600;">刘建国</td>
                  <td>LIP089</td>
                  <td><span class="tree-badge silver"><AppIcon name="medal-silver" />  银</span></td>
                  <td>18</td>
                  <td>2025-11-05</td>
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
                <th>结算状态</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-family: monospace;">OD20260529003</td>
                <td>05-29</td>
                <td>瑞思迈 AirSense 10 自动呼吸机</td>
                <td style="font-weight: 700; color: var(--primary-500);">¥8,900</td>
                <td><span class="status-tag green">已结算</span></td>
              </tr>
              <tr>
                <td style="font-family: monospace;">OD20260528001</td>
                <td>05-28</td>
                <td>多导睡眠监测 (PSG) 套餐</td>
                <td style="font-weight: 700; color: var(--primary-500);">¥3,680</td>
                <td><span class="status-tag gold">结算中</span></td>
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
                <th>时间</th>
                <th>类型</th>
                <th>来源</th>
                <th>金额</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(comm, idx) in commissions" :key="idx">
                <td style="font-size: 12px; color: #6B7280;">{{ comm.time }}</td>
                <td>
                  <span class="tag tag-green" v-if="comm.typeTag === 'green'">{{ comm.type }}</span>
                  <span class="tag tag-blue" v-else-if="comm.typeTag === 'blue'">{{ comm.type }}</span>
                  <span class="tag tag-red" v-else-if="comm.typeTag === 'red'">{{ comm.type }}</span>
                </td>
                <td style="font-size: 13px;">{{ comm.source }}</td>
                <td
                  style="font-weight: 700;"
                  :style="{ color: comm.typeTag === 'red' ? 'var(--error-500)' : '#D4930A' }"
                >
                  {{ comm.amount }}
                </td>
                <td>
                  <span class="status-tag green" v-if="comm.statusTag === 'green'">{{ comm.status }}</span>
                  <span class="status-tag gold" v-else-if="comm.statusTag === 'gold'">{{ comm.status }}</span>
                </td>
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
