<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
const loading=ref(false),tickets=ref<any[]>([]),cases=ref<any[]>([]),admins=ref<any[]>([]),visible=ref(false)
const form=ref<any>({fulfillment_case_id:'',issue_type:'',description:'',assigned_technician_id:''})
const caseSearch=ref(''),casePage=ref(1),caseTotal=ref(0)
async function loadCases(){try{const r:any=await request.get('/api/admin/fulfillment/cases',{params:{page:casePage.value,pageSize:20,search:caseSearch.value.trim()||undefined}});cases.value=r.data||[];caseTotal.value=Number(r.pagination?.total||0)}catch{cases.value=[];caseTotal.value=0;MessagePlugin.error('加载履约单失败')}}
function searchCases(){casePage.value=1;form.value.fulfillment_case_id='';loadCases()}
function changeCasePage(info:any){casePage.value=info.current;form.value.fulfillment_case_id='';loadCases()}
const labels:Record<string,string>={pending:'待处理',assigned:'已分配',processing:'处理中',resolved:'已解决',closed:'已关闭'}
const staffName=(x:any)=>x.real_name||x.name||x.username
const caseLabel=(x:any)=>`#${x.id} · ${x.patient_name||'患者'} · ${x.order_no||'订单'}`
async function load(){loading.value=true;try{const[a,c]:any[]=await Promise.all([request.get('/api/admin/after-sales-tickets'),request.get('/api/admin/fulfillment/technicians')]);if(a.code===200)tickets.value=a.data||[];if(c.code===200)admins.value=c.data||[]}catch(e){console.error(e);MessagePlugin.error('加载售后工单失败')}finally{loading.value=false}}
function openCreate(){form.value={fulfillment_case_id:'',issue_type:'',description:'',assigned_technician_id:''};caseSearch.value='';casePage.value=1;loadCases();visible.value=true}
async function create(){if(!form.value.fulfillment_case_id||!form.value.issue_type||!form.value.description)return MessagePlugin.warning('请填写履约单、问题类型和问题说明');try{const r:any=await request.post('/api/admin/after-sales-tickets',{...form.value,fulfillment_case_id:Number(form.value.fulfillment_case_id),assigned_technician_id:form.value.assigned_technician_id?Number(form.value.assigned_technician_id):undefined});if(r.code!==200)throw new Error(r.message);MessagePlugin.success('售后工单已创建');visible.value=false;await load()}catch(e:any){MessagePlugin.error(e.message||'创建售后工单失败')}}
async function resolve(ticket:any){const resolution=window.prompt('请输入处理结果（可留空）');if(resolution===null)return;try{const r:any=await request.put(`/api/admin/after-sales-tickets/${ticket.id}`,{status:'resolved',resolution});if(r.code!==200)throw new Error(r.message);MessagePlugin.success('售后工单已解决');await load()}catch(e:any){MessagePlugin.error(e.message||'更新失败')}}
onMounted(load)
</script>
<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">售后工作台</div>
        <div class="page-title-sub">独立处理已交付设备的异常、维修与佩戴问题。</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-outline" @click="load"><AppIcon name="refresh" /> 刷新</button>
        <button class="btn btn-primary" @click="openCreate"><AppIcon name="plus" /> 新建售后工单</button>
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
              <th style="min-width: 130px;">处理技师</th>
              <th style="min-width: 110px;">状态</th>
              <th style="width: 110px; min-width: 110px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ticket in tickets" :key="ticket.id">
              <td><span class="record-number">#{{ ticket.id }}</span></td>
              <td><span class="patient-name">{{ ticket.patient_name || '—' }}</span></td>
              <td>#{{ ticket.fulfillment_case_id || '—' }}</td>
              <td><div class="issue-cell"><b>{{ ticket.issue_type }}</b><small>{{ ticket.description }}</small></div></td>
              <td>{{ ticket.technician_name || '待分配' }}</td>
              <td><t-tag :theme="ticket.status === 'resolved' ? 'success' : 'warning'" size="small" variant="light">{{ labels[ticket.status] || ticket.status }}</t-tag></td>
              <td style="text-align: right;">
                <div class="actions"><button v-if="!['resolved', 'closed'].includes(ticket.status)" class="btn btn-xs btn-success" @click="resolve(ticket)">解决</button></div>
              </td>
            </tr>
            <tr v-if="!tickets.length"><td colspan="7" class="empty">暂无售后工单。</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <t-dialog v-model:visible="visible" header="新建售后工单" :on-confirm="create"><div class="form"><div class="full"><label>搜索履约单<input v-model="caseSearch" placeholder="患者、档案号、订单号" @keyup.enter="searchCases"></label><button class="btn btn-outline" @click="searchCases">搜索</button><t-pagination :current="casePage" :page-size="20" :total="caseTotal" :show-page-size="false" @change="changeCasePage" /></div><label>履约单<select v-model="form.fulfillment_case_id"><option value="">请选择</option><option v-for="item in cases" :key="item.id" :value="String(item.id)">{{caseLabel(item)}}</option></select></label><label>处理技师<select v-model="form.assigned_technician_id"><option value="">暂不分配</option><option v-for="item in admins" :key="item.id" :value="String(item.id)">{{staffName(item)}}</option></select></label><label>问题类型<input v-model="form.issue_type" placeholder="如：设备异常、佩戴不适"></label><label class="full">问题说明<textarea v-model="form.description" rows="4"/></label></div></t-dialog>
</template>
<style scoped>
.page-container { min-width: 0; }
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
