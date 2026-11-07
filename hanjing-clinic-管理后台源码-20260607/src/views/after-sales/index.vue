<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { formatShanghaiDateTime } from '@/utils/dateTime'
const loading=ref(false),tickets=ref<any[]>([]),cases=ref<any[]>([]),admins=ref<any[]>([]),visible=ref(false)
const form=ref<any>({fulfillment_case_id:'',issue_type:'',description:'',assigned_technician_id:''})
const caseSearch=ref(''),casePage=ref(1),caseTotal=ref(0)
async function loadCases(){try{const r:any=await request.get('/api/admin/after-sales/options/cases',{params:{page:casePage.value,pageSize:20,search:caseSearch.value.trim()||undefined}});cases.value=r.data||[];caseTotal.value=Number(r.pagination?.total||0)}catch{cases.value=[];caseTotal.value=0;MessagePlugin.error('加载履约单失败')}}
function searchCases(){casePage.value=1;form.value.fulfillment_case_id='';loadCases()}
function changeCasePage(info:any){casePage.value=info.current;form.value.fulfillment_case_id='';loadCases()}
const labels:Record<string,string>={pending:'待处理',assigned:'已分配',processing:'处理中',resolved:'已解决',closed:'已关闭'}
const staffName=(x:any)=>x.real_name||x.name||x.username
const caseLabel=(x:any)=>`#${x.id} · ${x.patient_name||'患者'} · ${x.order_no||'订单'}`
async function load(){loading.value=true;try{const[a,c]:any[]=await Promise.all([request.get('/api/admin/after-sales-tickets'),request.get('/api/admin/after-sales/options/technicians')]);if(a.code===200)tickets.value=a.data||[];if(c.code===200)admins.value=c.data||[]}catch(e){console.error(e);MessagePlugin.error('加载售后工单失败')}finally{loading.value=false}}
function openCreate(){form.value={fulfillment_case_id:'',issue_type:'',description:'',assigned_technician_id:''};caseSearch.value='';casePage.value=1;loadCases();visible.value=true}
async function create(){if(!form.value.fulfillment_case_id||!form.value.issue_type||!form.value.description)return MessagePlugin.warning('请填写履约单、问题类型和问题说明');try{const r:any=await request.post('/api/admin/after-sales-tickets',{...form.value,fulfillment_case_id:Number(form.value.fulfillment_case_id),assigned_technician_id:form.value.assigned_technician_id?Number(form.value.assigned_technician_id):undefined});if(r.code!==200)throw new Error(r.message);MessagePlugin.success('售后工单已创建');visible.value=false;await load()}catch(e:any){MessagePlugin.error(e.message||'创建售后工单失败')}}
const activeTicket = ref<any>(null)
const action = ref('')
const actionSaving = ref(false)
const actionForm = ref({ technicianId: '', resolution: '', closeReason: '', advancement: undefined as number | undefined, followUp: 'continue', nextDate: '' })
const actionTitle = computed(() => ({ assigned: activeTicket.value?.assigned_technician_id ? '转派工单' : '分配工单', processing: '开始处理', resolved: activeTicket.value?.issue_type === '微调复查' ? '完成微调' : '解决工单', closed: '关闭工单' } as Record<string, string>)[action.value] || '')
const technicianOptions = computed(() => admins.value.filter(item => Number(item.id) !== Number(activeTicket.value?.assigned_technician_id)).map(item => ({ value: String(item.id), label: staffName(item) })))
function openAction(ticket: any, next: string) {
  activeTicket.value = { ...ticket }
  action.value = next
  actionForm.value = { technicianId: '', resolution: '', closeReason: '', advancement: ticket.current_advancement == null ? undefined : Number(ticket.current_advancement), followUp: 'continue', nextDate: '' }
}
const isAdjustment = computed(() => activeTicket.value?.issue_type === '微调复查')
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
function adjustmentRecord(ticket: any) { try { return typeof ticket.adjustment_snapshot === 'string' ? JSON.parse(ticket.adjustment_snapshot) : ticket.adjustment_snapshot } catch { return null } }
async function submitAction() {
  if (!activeTicket.value || actionSaving.value) return
  if (action.value === 'assigned' && !actionForm.value.technicianId) return MessagePlugin.warning('请选择处理技师')
  if (action.value === 'resolved' && !actionForm.value.resolution.trim()) return MessagePlugin.warning('请填写处理结果')
  if (action.value === 'closed' && activeTicket.value.status !== 'resolved' && !actionForm.value.closeReason.trim()) return MessagePlugin.warning('请填写提前关闭原因')
  if (action.value === 'resolved' && isAdjustment.value) {
    const n = actionForm.value.advancement
    if (n == null || !Number.isFinite(Number(n)) || Number(n) < 0 || Number(n) > 15) return MessagePlugin.warning('请输入0至15mm的下颌前移量')
    if (actionForm.value.followUp === 'continue' && (!actionForm.value.nextDate || actionForm.value.nextDate <= today())) return MessagePlugin.warning('请选择晚于今天的下次复查日期')
  }
  actionSaving.value = true
  try {
    const ticket = activeTicket.value
    await request.put(`/api/admin/after-sales-tickets/${ticket.id}`, {
      status: action.value, expected_status: ticket.status, expected_technician_id: ticket.assigned_technician_id || null,
      ...(action.value === 'assigned' ? { assigned_technician_id: Number(actionForm.value.technicianId) } : {}),
      ...(action.value === 'resolved' ? { resolution: actionForm.value.resolution.trim(), ...(isAdjustment.value ? {
        adjusted_advancement: actionForm.value.advancement, expected_advancement: ticket.current_advancement,
        needs_follow_up: actionForm.value.followUp === 'continue', next_adjust_date: actionForm.value.followUp === 'continue' ? actionForm.value.nextDate : null
      } : {}) } : {}),
      ...(action.value === 'closed' ? { close_reason: actionForm.value.closeReason.trim() } : {})
    })
    activeTicket.value = null
    MessagePlugin.success('售后工单已更新')
    await load()
  } catch (error: any) {
    if (error.response?.status === 409) { activeTicket.value = null; await load() }
  } finally { actionSaving.value = false }
}
function statusTheme(status: string): 'success' | 'primary' | 'warning' | 'default' {
  return status === 'resolved' ? 'success' : status === 'closed' ? 'default' : status === 'processing' ? 'primary' : 'warning'
}
onMounted(load)
</script>
<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">售后工作台</div>
        <div class="page-title-sub">跟进设备交付后的微调复查、维修与佩戴问题。</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-outline" @click="load"><AppIcon name="refresh" /> 刷新</button>
        <button v-permission="'after_sales:add'" class="btn btn-primary" @click="openCreate"><AppIcon name="plus" /> 新建售后工单</button>
      </div>
    </div>
    <div class="panel" :aria-busy="loading">
      <div class="filter-bar list-toolbar">
        <h3>售后工单</h3><span class="list-count">{{ tickets.length }} 条</span>
      </div>
      <div class="panel-body">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="min-width: 90px;">工单</th>
              <th style="min-width: 140px;">患者</th>
              <th style="min-width: 110px;">履约单</th>
              <th style="min-width: 300px;">问题</th>
              <th style="min-width: 140px;">复查日期</th><th style="min-width: 130px;">处理技师</th>
              <th style="min-width: 110px;">状态</th>
              <th style="min-width: 260px;">处理结果 / 关闭说明</th>
              <th style="min-width: 160px;">最近更新</th>
              <th style="width: 260px; min-width: 260px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ticket in tickets" :key="ticket.id">
              <td><span class="record-number">#{{ ticket.id }}</span></td>
              <td><span class="patient-name">{{ ticket.patient_name || '—' }}</span></td>
              <td>#{{ ticket.fulfillment_case_id || '—' }}</td>
              <td><div class="issue-cell"><b>{{ ticket.issue_type }}</b><small>{{ ticket.description }}</small></div></td>
              <td>{{ ticket.next_service_date ? String(ticket.next_service_date).slice(0,10) : '—' }}</td><td>{{ ticket.technician_name || '待分配' }}</td>
              <td><t-tag :theme="statusTheme(ticket.status)" size="small" variant="light">{{ labels[ticket.status] || ticket.status }}</t-tag></td>
              <td><div class="result-cell">{{ ticket.resolution || '未填写' }}</div><div v-if="adjustmentRecord(ticket)" class="adjustment-record">
                <span>{{ adjustmentRecord(ticket).before_advancement }} → {{ adjustmentRecord(ticket).adjusted_advancement }} mm · {{ adjustmentRecord(ticket).operator_name }}</span>
                <span v-if="adjustmentRecord(ticket).needs_follow_up">下次 {{ adjustmentRecord(ticket).next_adjust_date }} · 工单 #{{ adjustmentRecord(ticket).next_ticket_id }}</span>
                <span v-else>无需再复查</span>
              </div><small v-if="ticket.resolved_at" class="result-time">解决于 {{ formatShanghaiDateTime(ticket.resolved_at) }}</small></td>
              <td>{{ formatShanghaiDateTime(ticket.updated_at) }}</td>
              <td style="text-align: right;">
                <div class="actions">
                  <button v-permission="'after_sales:edit'" v-if="['pending','assigned','processing'].includes(ticket.status)" class="btn btn-xs btn-outline" @click="openAction(ticket, 'assigned')">{{ ticket.assigned_technician_id ? '转派' : '分配' }}</button>
                  <button v-permission="'after_sales:edit'" v-if="ticket.status === 'assigned'" class="btn btn-xs btn-primary" @click="openAction(ticket, 'processing')">开始处理</button>
                  <button v-permission="'after_sales:edit'" v-if="ticket.status === 'processing'" class="btn btn-xs btn-success" @click="openAction(ticket, 'resolved')">{{ ticket.issue_type === '微调复查' ? '完成微调' : '解决' }}</button>
                  <button v-permission="'after_sales:edit'" v-if="['pending','assigned','processing','resolved'].includes(ticket.status)" class="btn btn-xs btn-outline" @click="openAction(ticket, 'closed')">关闭</button>
                  <span v-if="ticket.status === 'closed'" class="result-time">已归档</span>
                </div>
              </td>
            </tr>
            <tr v-if="!tickets.length"><td colspan="10" class="empty">暂无售后工单。</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <t-dialog v-model:visible="visible" header="新建售后工单" :on-confirm="create"><div class="form"><div class="full"><label>搜索履约单<input v-model="caseSearch" placeholder="患者、档案号、订单号" @keyup.enter="searchCases"></label><button class="btn btn-outline" @click="searchCases">搜索</button><t-pagination :current="casePage" :page-size="20" :total="caseTotal" :show-page-size="false" @change="changeCasePage" /></div><label>履约单<select v-model="form.fulfillment_case_id"><option value="">请选择</option><option v-for="item in cases" :key="item.id" :value="String(item.id)">{{caseLabel(item)}}</option></select></label><label>处理技师<select v-model="form.assigned_technician_id"><option value="">暂不分配</option><option v-for="item in admins" :key="item.id" :value="String(item.id)">{{staffName(item)}}</option></select></label><label>问题类型<input v-model="form.issue_type" placeholder="如：设备异常、佩戴不适"></label><label class="full">问题说明<textarea v-model="form.description" rows="4"/></label></div></t-dialog>
  <t-dialog :visible="!!activeTicket" :header="actionTitle" top="8vh" width="min(560px, calc(100vw - 32px))" :close-on-overlay-click="false" @close="() => { if (!actionSaving) activeTicket = null }">
    <form v-if="activeTicket" id="after-sales-action" @submit.prevent="submitAction">
      <div class="ticket-summary">工单 #{{ activeTicket.id }} · {{ activeTicket.patient_name }} · {{ labels[activeTicket.status] }}</div>
      <div class="action-form">
        <template v-if="action === 'assigned'">
          <label>处理技师</label><t-select v-model="actionForm.technicianId" :options="technicianOptions" placeholder="请选择处理技师" :disabled="actionSaving" />
        </template>
        <p v-if="action === 'processing'">确认由 {{ activeTicket.technician_name || '已分配技师' }} 开始处理此工单？</p>
        <template v-if="action === 'resolved'">
          <template v-if="isAdjustment">
            <div class="device-summary"><b>{{ activeTicket.device_name_snapshot || '患者设备' }}</b><span>当前下颌前移量 {{ activeTicket.current_advancement ?? '—' }} mm</span></div>
            <label>调整后下颌前移量（mm） <span class="required">*</span></label>
            <t-input-number v-model="actionForm.advancement" :min="0" :max="15" :step="0.1" :decimal-places="2" :disabled="actionSaving" style="width: 100%" />
          </template>
          <label>处理结果 <span class="required">*</span></label><t-textarea v-model="actionForm.resolution" :maxlength="5000" :autosize="{ minRows: 3, maxRows: 6 }" :disabled="actionSaving" placeholder="填写实际处理措施与结果" />
          <template v-if="isAdjustment">
            <label>后续复查 <span class="required">*</span></label>
            <t-radio-group v-model="actionForm.followUp" class="followup-options" :disabled="actionSaving"><t-radio-button value="continue">继续复查</t-radio-button><t-radio-button value="none">无需再复查</t-radio-button></t-radio-group>
            <template v-if="actionForm.followUp === 'continue'"><label>下次复查日期 <span class="required">*</span></label><t-date-picker v-model="actionForm.nextDate" format="YYYY-MM-DD" :disable-date="(date: Date) => date <= new Date(today() + 'T23:59:59')" :disabled="actionSaving" style="width: 100%" /></template>
          </template>
        </template>
        <template v-if="action === 'closed'">
          <t-alert v-if="activeTicket.status !== 'resolved'" theme="warning" message="工单尚未解决，此操作将提前关闭工单。" />
          <div v-if="activeTicket.resolution" class="result-cell">处理结果：{{ activeTicket.resolution }}</div>
          <label>{{ activeTicket.status === 'resolved' ? '关闭说明（选填）' : '提前关闭原因（必填）' }}</label>
          <t-textarea v-model="actionForm.closeReason" :maxlength="1000" :autosize="{ minRows: 3, maxRows: 8 }" :disabled="actionSaving" />
        </template>
      </div>
    </form>
    <template #footer><t-button variant="outline" :disabled="actionSaving" @click="activeTicket = null">取消</t-button><t-button type="submit" form="after-sales-action" :loading="actionSaving">{{ actionTitle }}</t-button></template>
  </t-dialog>
</template>
<style scoped>
.page-container { min-width: 0; }
.result-cell { max-width: 400px; max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.result-time { display: block; font-size: 12px; color: #9CA3AF; margin-top: 6px; }
.ticket-summary { margin-bottom: 20px; color: #6B7280; font-size: 13px; }
.action-form { display: grid; gap: 12px; }
.action-form label { font-size: 14px; color: #374151; }
.device-summary { display:flex; flex-direction:column; gap:8px; padding:16px; background:var(--td-bg-color-secondarycontainer); border-radius:8px; font-size:14px; }
.device-summary span { color:var(--td-text-color-secondary); }
.followup-options { display:flex; width:100%; }
.followup-options :deep(.t-radio-button) { flex:1; display:flex; justify-content:center; }
#after-sales-action { max-height:calc(84vh - 140px); overflow-y:auto; padding:0 2px 4px; }
.adjustment-record { display:grid; gap:4px; font-size:12px; color:var(--td-text-color-secondary); margin-top:8px; }
.required { color: #d54941; }
.page-title-row { min-height: 50px; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.list-toolbar { min-height: 71px; box-sizing: border-box; flex-wrap: nowrap; }
.list-toolbar h3 { margin: 0; font-size: 13px; font-weight: 600; color: #374151; }
.list-count { font-size: 12px; color: #9CA3AF; white-space: nowrap; }
.record-number { font-family: monospace; font-weight: 600; color: var(--primary-500); }
.patient-name { color: #1F2937; font-weight: 600; }
.issue-cell { max-width: 400px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.issue-cell b, .issue-cell small { display: block; }
.issue-cell b { font-weight: 600; }
.issue-cell small { color: #9CA3AF; font-size: 12px; }
.actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
.data-table .empty { text-align: center; color: #9CA3AF !important; }
.form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 12px 0; }
.form label { display: flex; flex-direction: column; gap: 6px; color: #374151; font-size: 13px; font-weight: 600; }
.form .full { grid-column: 1 / -1; }
.form input, .form select, .form textarea { width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; font: inherit; font-weight: 400; color: #1F2937; background: #fff; outline: none; }
.form input, .form select { height: 36px; }
.form input:focus, .form select:focus, .form textarea:focus { border-color: var(--primary-500); box-shadow: 0 0 0 2px rgba(59,107,245,.1); }
</style>
