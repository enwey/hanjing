<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateOnly } from '@/utils/dateTime'

const keyword = ref('')
const level = ref('全部层级')
const rows = ref<any[]>([])

const levelOptions = ['全部层级', '一级团队', '二级团队']

const filteredRows = computed(() => {
  return rows.value.filter((item) => {
    const levelMatch = level.value === '全部层级'
      || (level.value === '一级团队' && item.relationLevel === 1)
      || (level.value === '二级团队' && item.relationLevel === 2)
    const keywordMatch = !keyword.value || [item.nickname, item.phone].some((field) =>
      String(field || '').includes(keyword.value)
    )
    return levelMatch && keywordMatch
  })
})

function yuan(value: number) {
  return (Number(value || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

async function loadData() {
  try {
    const res: any = await request.get('/api/promoter/team')
    rows.value = res.data?.list || []
  } catch (_error) {
    MessagePlugin.error('加载团队数据失败')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="page-container">
    <section class="panel">
      <div class="panel-title-row">
        <div class="panel-title">我的团队</div>
        <div class="panel-sub">查看当前推广员名下的一二级团队成员与转化情况</div>
      </div>
      <div class="filter-bar">
        <div class="filter-tabs">
          <button
            v-for="item in levelOptions"
            :key="item"
            :class="['filter-tab', level === item ? 'active' : '']"
            @click="level = item"
          >
            {{ item }}
          </button>
        </div>
        <input v-model="keyword" class="filter-input" placeholder="搜索昵称 / 手机号" />
      </div>
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th>成员</th>
              <th>团队层级</th>
              <th>当前身份</th>
              <th>转化状态</th>
              <th>订单数</th>
              <th>累计销售额</th>
              <th>加入时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredRows" :key="item.id">
              <td>
                <div style="display:flex;flex-direction:column;gap:4px;">
                  <strong style="color:#111827;">{{ item.nickname || '推广员' }}</strong>
                  <span style="font-size:12px;color:#94a3b8;">{{ item.phone || '未绑定手机号' }}</span>
                </div>
              </td>
              <td>{{ item.relationLevel === 1 ? '一级团队' : '二级团队' }}</td>
              <td>{{ item.levelLabel }}</td>
              <td>{{ item.statusText }}</td>
              <td>{{ item.orderCount || 0 }}</td>
              <td style="color:#1a9d5c;font-weight:700;">¥{{ yuan(item.totalSales) }}</td>
              <td>{{ formatShanghaiDateOnly(item.joinedAt) || '—' }}</td>
            </tr>
            <tr v-if="filteredRows.length === 0">
              <td colspan="7" class="empty-cell">暂无符合条件的团队成员</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.panel {
  background: #fff;
  border-radius: 18px;
  border: 1px solid #eef2f7;
  overflow: hidden;
}

.panel-title-row {
  padding: 20px 20px 0;
}

.panel-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.panel-sub {
  margin-top: 6px;
  font-size: 13px;
  color: #94a3b8;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid #f1f5f9;
}

.filter-tabs {
  display: flex;
  gap: 10px;
}

.filter-tab {
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  cursor: pointer;
}

.filter-tab.active {
  background: #eef4ff;
  color: #2a52d4;
  border-color: #dbeafe;
}

.filter-input {
  width: 260px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  padding: 0 12px;
  outline: none;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 36px 0;
}
</style>
