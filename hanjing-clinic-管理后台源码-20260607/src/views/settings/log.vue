<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface LogEntry {
  id: string;
  time: string;
  operator: string;
  role: string;
  module: string;
  action: string;
  detail: string;
  ip: string;
  status: 'success' | 'fail';
}

const baseLogs = [
  { id: '1', time: '2026-06-05 16:32:15', operator: '陈经理', role: '超级管理员', module: '系统设置', action: '启用账号', detail: '启用管理员账号 [李运营]', ip: '192.168.1.100', status: 'success' },
  { id: '2', time: '2026-06-05 15:10:45', operator: '李明辉', role: '医生/技师', module: '患者管理', action: '修改健康参数', detail: '修改患者 [张建国] 的阻鼾器下颌前移量 (2.0mm -> 4.0mm)', ip: '192.168.2.45', status: 'success' },
  { id: '3', time: '2026-06-05 14:23:10', operator: '陈经理', role: '超级管理员', module: '分销管理', action: '提现审批', detail: '审核通过分销商 [赵芳芳] 的提现申请 (单号：TX20260529001，金额：¥1200.00)', ip: '192.168.1.100', status: 'success' },
  { id: '4', time: '2026-06-04 18:30:12', operator: '赵经理', role: '门店管理员', module: '医生管理', action: '修改排班', detail: '调整医生 [李明辉] 2026-06-10 的出诊排班为 [下午半天]', ip: '192.168.1.155', status: 'success' },
  { id: '5', time: '2026-06-04 11:15:00', operator: '陈经理', role: '超级管理员', module: '患者管理', action: '查询敏感数据', detail: '导出患者 [张建国]、[李美玲] 的完整身份证号与就诊病历记录', ip: '192.168.1.100', status: 'success' },
  { id: '6', time: '2026-06-03 14:22:15', operator: '李运营', role: '内容管理员', module: '内容管理', action: '审核发帖', detail: '审核通过社区帖子 [佩戴阻鼾器三个月感受分享]', ip: '192.168.1.121', status: 'success' },
  { id: '7', time: '2026-06-02 09:45:11', operator: '赵经理', role: '门店管理员', module: '门店管理', action: '修改门店信息', detail: '更新 [南山分院] 的营业时间为 09:00 - 21:00', ip: '192.168.1.155', status: 'success' },
  { id: '8', time: '2026-06-01 10:12:35', operator: '李运营', role: '内容管理员', module: '系统设置', action: '密码修改', detail: '尝试修改管理员密码', ip: '192.168.1.121', status: 'fail' }
]

const logs = ref<LogEntry[]>(
  Array.from({ length: 42 }, (_, i) => {
    const base = baseLogs[i % baseLogs.length]
    const date = new Date(new Date('2026-06-05 16:32:15').getTime() - i * 3600 * 1000 * 2) // 2 hours apart
    const timeStr = date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0') + ' ' +
      String(date.getHours()).padStart(2, '0') + ':' +
      String(date.getMinutes()).padStart(2, '0') + ':' +
      String(date.getSeconds()).padStart(2, '0')
    return {
      ...base,
      id: String(i + 1),
      time: timeStr,
      operator: `${base.operator}-${i + 1}`,
      detail: `${base.detail} (日志审计 #${i + 1})`,
      status: i % 10 === 9 ? 'fail' : 'success'
    }
  })
)

/* ---- 筛选与搜索 ---- */
const searchKeyword = ref('')
const filterModule = ref('')
const filterAction = ref('')

const currentPage = ref(1)
const pageSize = ref(30)

// Reset to page 1 on filter changes
watch([searchKeyword, filterModule, filterAction], () => {
  currentPage.value = 1
})

const moduleOptions = [
  { label: '全部模块', value: '' },
  { label: '系统设置', value: '系统设置' },
  { label: '患者管理', value: '患者管理' },
  { label: '分销管理', value: '分销管理' },
  { label: '医生管理', value: '医生管理' },
  { label: '内容管理', value: '内容管理' },
  { label: '门店管理', value: '门店管理' },
]

const actionOptions = [
  { label: '全部行为', value: '' },
  { label: '修改', value: '修改' },
  { label: '新增', value: '新增' },
  { label: '查询敏感数据', value: '查询敏感数据' },
  { label: '提现审批', value: '提现审批' },
  { label: '启用账号', value: '启用账号' },
]

const filteredLogs = computed(() => {
  return logs.value.filter(l => {
    const matchKeyword = l.operator.includes(searchKeyword.value) || l.detail.includes(searchKeyword.value) || l.ip.includes(searchKeyword.value)
    const matchModule = !filterModule.value || l.module === filterModule.value
    const matchAction = !filterAction.value || l.action.includes(filterAction.value)
    return matchKeyword && matchModule && matchAction
  })
})

const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredLogs.value.slice(start, end)
})
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <div class="page-title-row">
      <div>
        <div class="page-title">操作日志</div>
        <div class="page-title-sub">记录管理员在后台系统的所有关键操作，确保审计追踪与安全合规。</div>
      </div>
    </div>

    <!-- Panel Wrapper -->
    <div class="panel">
      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <t-input
            v-model="searchKeyword"
            placeholder="搜索操作账号 / 操作详情 / IP 地址"
            style="width: 320px;"
            clearable
          />
          <t-select v-model="filterModule" :options="moduleOptions" placeholder="全部模块" style="width: 160px;" clearable />
          <t-select v-model="filterAction" :options="actionOptions" placeholder="全部行为" style="width: 160px;" clearable />
        </div>
        <div style="font-size: 13px; color: #9CA3AF;">
          共 {{ filteredLogs.length }} 条日志记录
        </div>
      </div>

      <!-- 表格 -->
      <div class="panel-body" style="padding: 0;">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="width: 180px;">操作时间</th>
              <th style="width: 180px;">操作账号</th>
              <th style="width: 120px;">操作模块</th>
              <th style="width: 130px;">行为类别</th>
              <th style="min-width: 280px;">操作详情</th>
              <th style="width: 130px;">IP 地址</th>
              <th style="width: 100px;">状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in paginatedLogs" :key="row.id">
              <td style="font-size: 12px; color: #9CA3AF;">{{ row.time }}</td>
              <td>
                <div style="font-weight: 500; color: #1F2937;">{{ row.operator }}</div>
                <div style="font-size: 11px; color: #9CA3AF;">{{ row.role }}</div>
              </td>
              <td>{{ row.module }}</td>
              <td>
                <t-tag
                  :theme="row.action.includes('修改') ? 'warning' : (row.action.includes('删除') || row.action.includes('查询敏感数据') ? 'danger' : 'primary')"
                  variant="light"
                  size="small"
                >
                  {{ row.action }}
                </t-tag>
              </td>
              <td>{{ row.detail }}</td>
              <td style="font-family: monospace; font-size: 12px; color: #6B7280;">{{ row.ip }}</td>
              <td>
                <t-tag
                  :theme="row.status === 'success' ? 'success' : 'danger'"
                  variant="light"
                  size="small"
                >
                  {{ row.status === 'success' ? '成功' : '失败' }}
                </t-tag>
              </td>
            </tr>
            <tr v-if="paginatedLogs.length === 0">
              <td colspan="7" style="text-align: center; color: #9CA3AF; padding: 40px 0;">暂无匹配的操作日志记录</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->
      <div class="pagination-footer">
        <t-pagination
          v-model:current="currentPage"
          v-model:pageSize="pageSize"
          :total="filteredLogs.length"
          :pageSizeOptions="[30, 60, 100]"
          style="border: none; padding: 0;"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
