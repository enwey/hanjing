<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { today, moldDescription, exportManifest } from './delivery'
const emit = defineEmits(['changed'])
const batches=ref<any[]>([]), ready=ref<any[]>([]), selected=ref<number[]>([]), returns=ref<number[]>([])
const page=ref(1), total=ref(0), readyPage=ref(1), readyTotal=ref(0)
const date=ref(today()), factory=ref(''), createVisible=ref(false), detailVisible=ref(false), busy=ref(false), detail=ref<any>(null)
const canReceive=(item:any)=>['awaiting_return','pending','shipped','received','producing','exception'].includes(item.status)
const batchLabel=(b:any)=>b.status==='cancelled'?'已取消':Number(b.returned_count)===Number(b.item_count)?'全部回货':'待回货'
async function load(){const r:any=await request.get('/api/admin/fulfillment/batches',{params:{page:page.value,pageSize:50}});batches.value=r.data||[];total.value=Number(r.pagination?.total||0)}
async function loadReady(){const r:any=await request.get('/api/admin/fulfillment/ready-molds',{params:{date:date.value||undefined,page:readyPage.value,pageSize:50}});ready.value=r.data||[];readyTotal.value=Number(r.pagination?.total||0)}
async function guarded(fn:()=>Promise<void>){try{await fn()}catch(e:any){MessagePlugin.error(e.message||'操作失败')}}
function changePage(info:any){page.value=info.current;guarded(load)}
function changeReadyPage(info:any){readyPage.value=info.current;guarded(loadReady)}
function filterReady(){readyPage.value=1;selected.value=[];guarded(loadReady)}
function selectPage(checked:boolean){const ids=ready.value.map(r=>r.id);selected.value=checked?[...new Set([...selected.value,...ids])]:selected.value.filter(id=>!ids.includes(id))}
async function openCreate(){factory.value='';date.value=today();readyPage.value=1;selected.value=[];await guarded(async()=>{await loadReady();createVisible.value=true})}
async function openDetail(id:number){await guarded(async()=>{const r:any=await request.get(`/api/admin/fulfillment/batches/${id}`);detail.value=r.data;returns.value=[];detailVisible.value=true})}
async function download(){if(!detail.value)return;await guarded(()=>exportManifest(detail.value))}
async function create(){
 if(!factory.value.trim()||!selected.value.length)return MessagePlugin.warning('请填写工厂并勾选口模')
 if(selected.value.length>100)return MessagePlugin.warning('每批最多选择100件口模')
 if(busy.value)return;busy.value=true
 try{const r:any=await request.post('/api/admin/fulfillment/batches',{factory_name:factory.value,case_ids:selected.value});createVisible.value=false;await load();emit('changed');detail.value=null;const d:any=await request.get(`/api/admin/fulfillment/batches/${r.data.id}`);detail.value=d.data;returns.value=[];detailVisible.value=true;await download();MessagePlugin.success('送厂清单已生成，可在批次详情重新下载')}
 catch(e:any){MessagePlugin.error(e.message||'生成清单失败')}finally{busy.value=false}
}
function receive(ids:number[]){
 if(!ids.length||busy.value)return
 const dialog=DialogPlugin.confirm({header:'确认回货',body:`确认所选 ${ids.length} 件设备已回货并验收通过？`,confirmBtn:'确认回货',onConfirm:async()=>{
 if(busy.value)return
 busy.value=true
 try{await request.post('/api/admin/fulfillment/receipts',{case_ids:ids,confirmed:true});dialog.hide();await load();await openDetail(detail.value.id);emit('changed');MessagePlugin.success('回货已确认')}
 catch(e:any){MessagePlugin.error(e.message||'确认失败')}finally{busy.value=false}
 }})
}
onMounted(()=>guarded(load))
defineExpose({load,openDetail})
</script>
<template>
 <div class="panel">
  <div class="filter-bar"><strong>送厂批次</strong><div class="actions"><button class="btn btn-outline" @click="guarded(load)">刷新</button><button v-permission="'fulfillment:batch'" class="btn btn-primary" @click="openCreate">汇总送厂 / 下载 Excel</button></div></div>
  <div class="panel-body"><table class="data-table"><thead><tr><th>批次编号</th><th>制作工厂</th><th>口模数量</th><th>回货进度</th><th>状态</th><th>操作</th></tr></thead><tbody>
  <tr v-for="b in batches" :key="b.id"><td>{{b.batch_no}}</td><td>{{b.factory_name}}</td><td>{{b.item_count}}</td><td>{{b.returned_count}} / {{b.item_count}}</td><td>{{batchLabel(b)}}</td><td><button class="btn btn-xs btn-outline" @click="openDetail(b.id)">批次详情</button></td></tr>
  <tr v-if="!batches.length"><td colspan="6" class="empty">暂无送厂清单</td></tr></tbody></table></div>
  <t-pagination :current="page" :page-size="50" :total="total" :show-page-size="false" @change="changePage" />
 </div>
 <t-dialog v-model:visible="createVisible" header="汇总送厂" width="min(1000px,94vw)" placement="center" :footer="false">
  <div class="batch-body"><div class="filters"><label>取模日期<input v-model="date" type="date" @change="filterReady"></label><button class="btn btn-outline" @click="date='';filterReady()">全部待送厂（含往日）</button><label>制作工厂<input v-model="factory" maxlength="150" placeholder="填写工厂名称"></label></div>
  <table class="data-table"><thead><tr><th><input type="checkbox" :checked="!!ready.length&&ready.every(r=>selected.includes(r.id))" @change="selectPage(($event.target as HTMLInputElement).checked)"></th><th>患者 / 档案号</th><th>口模编号</th><th>取模说明</th></tr></thead><tbody><tr v-for="r in ready" :key="r.id"><td><input v-model="selected" type="checkbox" :value="r.id"></td><td>{{r.patient_name}}<small>{{r.patient_no}}</small></td><td>{{r.mold_no}}</td><td><div class="text-cell">{{moldDescription(r.details)}}</div></td></tr><tr v-if="!ready.length"><td colspan="4" class="empty">暂无待送厂口模</td></tr></tbody></table>
  <t-pagination :current="readyPage" :page-size="50" :total="readyTotal" :show-page-size="false" @change="changeReadyPage" /></div>
  <div class="footer"><span>已选择 {{selected.length}} 件</span><button class="btn btn-outline" @click="createVisible=false">取消</button><button class="btn btn-primary" :disabled="busy" @click="create">汇总并下载 Excel</button></div>
 </t-dialog>
 <t-dialog v-model:visible="detailVisible" header="送厂清单与回货确认" width="min(1100px,94vw)" placement="center" :footer="false">
  <template v-if="detail"><div class="batch-body"><div class="batch-summary"><b>{{detail.batch_no}} · {{detail.factory_name}}</b></div>
  <div v-if="detail.status!=='cancelled'" class="actions"><label class="select-all"><input type="checkbox" :checked="detail.items.some(canReceive)&&detail.items.filter(canReceive).every((i:any)=>returns.includes(i.fulfillment_case_id))" @change="returns=($event.target as HTMLInputElement).checked?detail.items.filter(canReceive).map((i:any)=>i.fulfillment_case_id):[]">全选待回货</label><button v-permission="'fulfillment:receipt'" class="btn btn-primary" :disabled="busy||!returns.length" @click="receive([...returns])">确认所选回货（{{returns.length}}）</button></div>
  <section v-for="item in detail.items" :key="item.id" class="item-card"><div class="item-header"><label class="select-all"><input v-if="canReceive(item)&&detail.status!=='cancelled'" v-model="returns" type="checkbox" :value="item.fulfillment_case_id"><b>{{item.snapshot?.patient_name || item.snapshot?.patient_ref || '患者'}} · 交付单 #{{item.fulfillment_case_id}}</b></label><t-tag>{{item.status==='returned'?'已回货':item.status==='retake'?'已重新取模':item.status==='cancelled'?'已取消':'待回货'}}</t-tag></div>
  <template v-if="item.snapshot"><p>口模：{{item.snapshot.mold.mold_no}} · {{item.snapshot.mold.taken_date}}</p><h4>取模说明</h4><p>{{moldDescription(item.snapshot.mold)}}</p></template>
  <p v-if="item.receipt">确认人：{{item.receipt.receiver_name}}</p><div class="actions"><button v-permission="'fulfillment:receipt'" v-if="canReceive(item)&&detail.status!=='cancelled'" class="btn btn-primary" :disabled="busy" @click="receive([item.fulfillment_case_id])">确认回货</button></div></section></div>
  <div class="footer"><button class="btn btn-outline" @click="detailVisible=false">关闭</button><button v-permission="'fulfillment:export'" v-if="detail.status!=='cancelled'" class="btn btn-primary" @click="download">下载 Excel 清单</button></div></template>
 </t-dialog>
</template>
<style scoped>
.select-all{display:flex;flex-direction:row;align-items:center;gap:8px}.actions,.filters,.footer,.files{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.footer{justify-content:flex-end;margin-top:16px}.filter-bar strong{font-size:13px}.batch-body{max-height:65vh;overflow:auto;padding:4px}.filters{margin-bottom:16px;align-items:flex-end}label{display:flex;flex-direction:column;gap:6px;font-size:13px}input:not([type=checkbox]),textarea{padding:8px 12px;border:1px solid #D1D5DB;border-radius:8px;font:inherit;box-sizing:border-box;width:100%}small{display:block;color:#9CA3AF;font-size:11px}.empty{text-align:center;color:#9CA3AF!important}.text-cell{max-width:240px;white-space:pre-wrap;overflow-wrap:anywhere}.item-card{border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin-top:12px;font-size:13px}.item-header{display:flex;justify-content:space-between;gap:12px}.item-card dl{display:grid;grid-template-columns:1fr 1fr;gap:12px}.item-card dt,h4{color:#6B7280;font-size:12px;margin:12px 0 6px}.item-card dd{margin:0}.item-card p,.item-card dd{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}.item-card .actions{justify-content:flex-end;margin-top:12px}.feedback{background:#FFFBEB;padding:10px}.batch-summary{font-size:13px}.action-form{display:grid;gap:14px}.action-form .check{flex-direction:row;align-items:center}.action-form p{color:#6B7280;font-size:12px}button:disabled{opacity:.5;cursor:not-allowed}
</style>
