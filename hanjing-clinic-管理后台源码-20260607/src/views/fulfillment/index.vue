<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import ClinicalDetails from './ClinicalDetails.vue'
import MoldDialog from './MoldDialog.vue'
import FactoryBatches from './FactoryBatches.vue'
const view = ref('cases'), moldDialog = ref<any>(null), batchPanel = ref<any>(null)
async function refresh() { await load(); await batchPanel.value?.load() }
async function openBatch(item:any) { view.value='batches'; await nextTick(); if(item.factory_batch_id)await batchPanel.value?.openDetail(item.factory_batch_id) }
const loading=ref(false), cases=ref<any[]>([]), admins=ref<any[]>([]), events=ref<any[]>([]), eventsVisible=ref(false), detailVisible=ref(false), detail=ref<any>(null), actionVisible=ref(false), actionType=ref(''), activeCase=ref<any>(null)
const form=ref<any>({technician_id:'',mold_no:'',storage_location:'',carrier:'',tracking_no:'',device_serial_no:'',note:''})
const labels:Record<string,string>={pending_assignment:'待分配技师',assigned:'待取模',mold_taken:'待送厂',mold_batched:'批次待寄出',mold_shipped:'待工厂签收',factory_received:'工厂已签收',producing:'制作中',factory_exception:'工厂异常',device_received:'待通知试戴',ready_for_fitting:'待试戴',fitted:'已完成'}
const actionTitle=computed(()=>({assign:'分配技师',mold:'登记取模',shipment:'发模登记',receipt:'设备收货入库',fitting:'完成试戴'} as any)[actionType.value]||'')
const staffName=(item:any)=>item.real_name||item.name||item.username
const genderLabel=(value:any)=>({1:'男',2:'女',male:'男',female:'女',男:'男',女:'女'} as any)[value]||'未记录'
const avatarColor=(name:string)=>['#5A85F5','#7C5CE0','#E6875A','#37A88D','#D96886'][String(name||'').charCodeAt(0)%5]
async function load(){loading.value=true;try{const [a,b]:any[]=await Promise.all([request.get('/api/admin/fulfillment/cases'),request.get('/api/admin/fulfillment/technicians')]);if(a.code===200)cases.value=a.data||[];if(b.code===200)admins.value=b.data||[]}catch(e){console.error(e);MessagePlugin.error('加载履约数据失败')}finally{loading.value=false}}
function openAction(type:string,item:any){activeCase.value=item;actionType.value=type;form.value={technician_id:item.technician_id||'',mold_no:'',storage_location:'',carrier:'',tracking_no:'',device_serial_no:'',note:''};actionVisible.value=true}
async function saveAction(){if(!activeCase.value)return;const path:any={assign:'/assign',mold:'/mold',shipment:'/mold-shipment',receipt:'/device-receipt',fitting:'/fitting'};const payload={...form.value,technician_id:form.value.technician_id?Number(form.value.technician_id):undefined};try{const r:any=await request.post(`/api/admin/fulfillment/cases/${activeCase.value.id}${path[actionType.value]}`,payload);if(r.code!==200)throw new Error(r.message);MessagePlugin.success('操作已保存');actionVisible.value=false;await load()}catch(e:any){MessagePlugin.error(e.message||'操作失败')}}
async function notify(item:any){try{const r:any=await request.post(`/api/admin/fulfillment/cases/${item.id}/notify-fitting`);if(r.code!==200)throw new Error(r.message);MessagePlugin.success('已通知患者试戴');await load()}catch(e:any){MessagePlugin.error(e.message||'通知失败')}}
async function showEvents(item:any){try{const r:any=await request.get(`/api/admin/fulfillment/cases/${item.id}/events`);if(r.code!==200)throw new Error(r.message);events.value=r.data||[];eventsVisible.value=true}catch(e:any){MessagePlugin.error(e.message||'获取履约记录失败')}}
async function showDetail(item:any){detail.value=null;try{const r:any=await request.get(`/api/admin/fulfillment/cases/${item.id}/detail`);if(r.code!==200)throw new Error(r.message);detail.value=r.data;detailVisible.value=true}catch(e:any){MessagePlugin.error(e.message||'获取履约资料失败')}}
const formatTime=(v:string)=>v?String(v).replace('T',' ').slice(0,16):'—'
onMounted(load)
</script>
<template>
  <div class="page-container">
    <div class="page-title-row">
      <div>
        <div class="page-title">交付管理</div>
        <div class="page-title-sub">管理阻鼾器取模、制作交付与试戴履约记录</div>
      </div>
      <div class="header-actions">
        <button class="btn btn-outline" @click="refresh"><AppIcon name="refresh" /> 刷新</button>
      </div>
    </div>
    <div class="filter-tabs"><button class="filter-tab" :class="{active:view==='cases'}" @click="view='cases'">患者交付</button><button class="filter-tab" :class="{active:view==='batches'}" @click="view='batches'">送厂批次</button></div>
    <FactoryBatches v-if="view==='batches'" ref="batchPanel" @changed="load" />
    <div v-else class="panel" :aria-busy="loading">
      <div class="filter-bar list-toolbar">
        <h3>履约队列</h3><span class="list-count">{{ cases.length }} 条</span>
      </div>
      <div class="panel-body">
        <table class="data-table" v-resizable>
          <thead>
            <tr>
              <th style="min-width: 90px;">履约单</th>
              <th style="min-width: 260px;">患者信息</th>
              <th style="min-width: 220px;">阻鼾器商品</th>
              <th style="min-width: 280px;">治疗处方 / 方案</th>
              <th style="min-width: 320px;">绑定物理阻鼾器 / 初始下颌前移量</th>
              <th style="min-width: 110px;">技师</th>
              <th style="min-width: 130px;">当前环节</th>
              <th style="min-width: 220px;">履约信息</th>
              <th style="width: 370px; min-width: 370px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in cases" :key="item.id">
              <td><span class="record-number">#{{ item.id }}</span></td>
              <td>
                <div class="patient">
                  <div class="avatar" :style="{ background: avatarColor(item.patient_name) }">{{ (item.patient_name || '—').slice(0, 1) }}</div>
                  <div class="patient-text">
                    <b>{{ item.patient_name || '—' }}</b>
                    <small>{{ item.patient_no || '—' }} · {{ genderLabel(item.patient_gender) }} · {{ item.patient_phone || '未留手机号' }}</small>
                  </div>
                </div>
              </td>
              <td><div class="clinical-cell">{{ item.device_product_names || item.devices?.map((d:any) => d.device_product_name || d.device_model).join('；') || '未记录阻鼾器商品' }}</div></td>
              <td><div class="clinical-cell prescription-cell">{{ item.prescription || '未关联处方' }}</div></td>
              <td>
                <div class="clinical-cell">
                  <div v-for="(device, index) in item.devices" :key="index">
                    <b>{{ device.device_product_name || device.device_model }}</b>
                    <small>初始下颌前移量：{{ device.initial_advancement ?? '未记录' }} mm</small>
                  </div>
                  <span v-if="!item.devices?.length">未关联设备</span>
                </div>
              </td>
              <td>{{ item.technician_name || '待分配' }}</td>
              <td><t-tag :theme="item.status === 'fitted' ? 'success' : 'primary'" size="small" variant="light">{{ labels[item.status] || item.status }}</t-tag></td>
              <td>
                <small>订单：{{ item.order_no || '—' }}</small>
                <small v-if="item.mold_no">模具：{{ item.mold_no }}</small>
                <small v-if="item.mold_tracking_no">快递：{{ item.mold_tracking_no }}</small>
                <small v-if="item.factory_batch_no">送厂批次：{{ item.factory_batch_no }}</small>
                <small v-if="item.device_serial_no">设备：{{ item.device_serial_no }}</small>
              </td>
              <td style="text-align: right;">
                <div class="actions">
                  <button class="btn btn-xs btn-outline" @click="showDetail(item)">履约资料</button>
                  <button v-if="item.status === 'pending_assignment'" class="btn btn-xs btn-primary" @click="openAction('assign', item)">分配</button>
                  <button v-if="item.status === 'assigned'" class="btn btn-xs btn-primary" @click="moldDialog.open(item)">取模</button>
                  <button v-else-if="item.status!=='pending_assignment'" class="btn btn-xs btn-outline" @click="moldDialog.open(item)">取模资料</button>
                  <button v-if="['mold_taken','mold_batched','mold_shipped','factory_received','producing','factory_exception'].includes(item.status)" class="btn btn-xs btn-primary" @click="openBatch(item)">送厂批次</button>
                  <button v-if="['factory_received','producing'].includes(item.status)" class="btn btn-xs btn-success" @click="openAction('receipt', item)">收货</button>
                  <button v-if="item.status === 'device_received'" class="btn btn-xs btn-primary" @click="notify(item)">通知试戴</button>
                  <button v-if="item.status === 'ready_for_fitting'" class="btn btn-xs btn-success" @click="openAction('fitting', item)">完成试戴</button>
                  <button class="btn btn-xs btn-outline" @click="showEvents(item)">记录</button>
                </div>
              </td>
            </tr>
            <tr v-if="!cases.length"><td colspan="9" class="empty">暂无履约单。</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
 <MoldDialog ref="moldDialog" @saved="load" />
 <t-dialog v-model:visible="actionVisible" :header="actionTitle" :on-confirm="saveAction"><div class="form"><label v-if="actionType==='assign'">负责技师<select v-model="form.technician_id"><option value="">请选择</option><option v-for="item in admins" :key="item.id" :value="String(item.id)">{{staffName(item)}}</option></select></label><template v-if="actionType==='mold'"><label>模具编号<input v-model="form.mold_no"></label><label>存放位置<input v-model="form.storage_location"></label></template><template v-if="actionType==='shipment'"><label>快递公司<input v-model="form.carrier"></label><label>快递单号<input v-model="form.tracking_no"></label></template><template v-if="actionType==='receipt'"><label>设备序列号<input v-model="form.device_serial_no"></label><label>入库位置<input v-model="form.storage_location"></label></template><template v-if="actionType==='fitting'"><label>操作技师<select v-model="form.technician_id"><option value="">请选择</option><option v-for="item in admins" :key="item.id" :value="String(item.id)">{{staffName(item)}}</option></select></label></template><label class="full">备注 / 结果<textarea v-model="form.note" rows="3"/></label></div></t-dialog>
 <t-dialog v-model:visible="eventsVisible" header="履约记录" :footer="false"><div v-for="event in events" :key="event.id" class="event"><b>{{event.event_type}}</b><span>{{event.actor_name||'系统'}} · {{formatTime(event.created_at)}}</span><p>{{event.detail||'—'}}</p></div><p v-if="!events.length" class="empty">暂无记录</p></t-dialog>
 <t-dialog v-model:visible="detailVisible" header="履约资料 · 门诊诊疗与病历建档" placement="center" width="min(1200px, 94vw)" :footer="false"><ClinicalDetails v-if="detail" :data="detail" /></t-dialog>
</template>
<style scoped>
.page-container { min-width: 0; }
.page-title-row { min-height: 50px; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.list-toolbar { min-height: 71px; box-sizing: border-box; flex-wrap: nowrap; }
.list-toolbar h3 { margin: 0; font-size: 13px; font-weight: 600; color: #374151; }
.list-count { font-size: 12px; color: #9CA3AF; white-space: nowrap; }
.record-number { font-family: monospace; font-weight: 600; color: var(--primary-500); }
.patient { display: flex; align-items: center; gap: 10px; min-width: 0; overflow: hidden; }
.avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 12px; flex-shrink: 0; }
.patient-text { min-width: 0; overflow: hidden; }
.patient-text b { color: #1F2937; font-weight: 600; }
.patient-text small { font-size: 11px; }
.patient-text b, .patient-text small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.data-table b, .data-table small { display: block; }
.data-table small { color: #9CA3AF; font-size: 12px; line-height: 1.6; }
.data-table .patient-text small { font-size: 11px; line-height: 22px; }
.clinical-cell { max-width: 288px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
.prescription-cell { max-width: 248px; }
.actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
.data-table .empty { text-align: center; color: #9CA3AF !important; }
.form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 12px 0; }
.form label { display: flex; flex-direction: column; gap: 6px; color: #374151; font-size: 13px; font-weight: 600; }
.form .full { grid-column: 1 / -1; }
.form input, .form select, .form textarea { width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid #D1D5DB; border-radius: 8px; font: inherit; font-weight: 400; color: #1F2937; background: #fff; outline: none; }
.form input, .form select { height: 36px; }
.form input:focus, .form select:focus, .form textarea:focus { border-color: var(--primary-500); box-shadow: 0 0 0 2px rgba(59,107,245,.1); }
.event { padding: 12px 0; border-bottom: 1px solid #eef2f7; }
.event b { color: #1e40af; }
.event span { margin-left: 10px; font-size: 12px; color: #94a3b8; }
.event p { margin: 6px 0 0; color: #64748b; font-size: 12px; word-break: break-all; }
.empty { text-align: center; color: #9CA3AF; }
</style>
