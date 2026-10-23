<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateOnly } from '@/utils/dateTime'

const router = useRouter()
const rows = ref<any[]>([])
const keyword = ref('')
const loading = ref(false)
const filtered = computed(() => rows.value.filter(r => !keyword.value || [r.name, r.appointment_no].some(v => String(v || '').includes(keyword.value))))
const statusLabels: Record<string, string> = { pending: '待确认', confirmed: '已确认', checked_in: '已签到', completed: '已完成', cancelled: '已取消', no_show: '未到诊' }

async function loadData() {
  loading.value = true
  try {
    const res: any = await request.get('/api/promoter/patients')
    rows.value = res.data?.list || []
  } catch {
    MessagePlugin.error('加载推荐预约失败')
  } finally {
    loading.value = false
  }
}

function viewDetail(row: any) {
  const targetId = row.patient_id || row.id
  if (targetId) {
    router.push(`/patients/${targetId}`)
  }
}

onMounted(loadData)
</script>
<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">我的患者</div>
        <div class="page-title-sub">查看通过本人推广码提交的预约及成单转化情况，可点击查看患者详情</div>
      </div>
      <div>共 {{ filtered.length }} 次预约</div>
    </div>
    <section class="panel">
      <div class="filter-bar"><t-input v-model="keyword" placeholder="搜索患者姓名 / 预约编号" clearable /></div>
      <t-loading :loading="loading">
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>预约编号</th>
                <th>患者</th>
                <th>预约日期</th>
                <th>时段</th>
                <th>预约状态</th>
                <th>成单状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filtered" :key="row.id">
                <td>{{ row.appointment_no }}</td>
                <td>{{ row.name }}</td>
                <td>{{ formatShanghaiDateOnly(row.appointment_date) }}</td>
                <td>{{ row.appointment_time }}</td>
                <td>{{ statusLabels[row.status] || row.status }}</td>
                <td>{{ row.orderCount > 0 ? '已成单' : '未成单' }}</td>
                <td>
                  <button class="btn btn-xs btn-outline" @click="viewDetail(row)">查看详情</button>
                </td>
              </tr>
              <tr v-if="!loading && !filtered.length">
                <td colspan="7" class="empty-cell">暂无推荐预约</td>
              </tr>
            </tbody>
          </table>
        </div>
      </t-loading>
    </section>
  </div>
</template>
<style scoped>
.panel { background:#fff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; }
.filter-bar { padding:16px 20px; max-width:400px; }
.table-scroll { overflow-x:auto; }
.data-table { min-width:720px; }
.empty-cell { padding:36px; text-align:center; color:#94a3b8; }
</style>
