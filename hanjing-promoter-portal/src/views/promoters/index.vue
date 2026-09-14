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
    const keywordMatch = !keyword.value || [item.nickname, item.phone, item.upperName, item.upperPhone].some((field) =>
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
    <div class="page-title-row">
      <div>
        <div class="page-title">我的团队</div>
        <div class="page-title-sub">查看当前推广员名下的一二级团队成员与转化情况</div>
      </div>
      <div class="page-count">共 {{ filteredRows.length }} 人</div>
    </div>

    <section class="panel">
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
              <th>上级</th>
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
              <td>
                <div style="display:flex;flex-direction:column;gap:4px;">
                  <strong style="color:#111827;">{{ item.upperName || '无' }}</strong>
                  <span style="font-size:12px;color:#94a3b8;">{{ item.upperPhone || '未绑定手机号' }}</span>
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
              <td colspan="8" class="empty-cell">暂无符合条件的团队成员</td>
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
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.page-count {
  font-size: 13px;
  color: #9ca3af;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
}

.filter-tabs {
  display: flex;
  gap: 10px;
}

.filter-tab {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #dbe3ef;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-size: 13px;
}

.filter-tab.active {
  background: #eef4ff;
  color: #2a52d4;
  border-color: #3b6bf5;
}

.filter-input {
  width: 260px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #dbe3ef;
  padding: 0 12px;
  outline: none;
  font-size: 13px;
}

.empty-cell {
  text-align: center;
  color: #94a3b8;
  padding: 36px 0;
}
</style>
