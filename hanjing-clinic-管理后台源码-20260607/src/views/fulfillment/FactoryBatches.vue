<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { today, shanghaiTime, itemLabels, exportManifest, downloadMoldFile } from './delivery'
const emit = defineEmits(['changed'])
const batches = ref<any[]>([]), ready = ref<any[]>([]), selected = ref<number[]>([])
const date = ref(today()), factory = ref(''), createVisible = ref(false), detailVisible = ref(false), busy = ref(false), detail = ref<any>(null)
const actionVisible = ref(false), action = ref(''), activeItem = ref<any>(null), form = ref<any>({})
const actionName = computed(() => ({ship:'确认寄出',received:'登记工厂签收',producing:'登记制作 / 恢复制作',exception:'登记工厂异常',retake:'退回重新取模',receipt:'设备回店验收'} as any)[action.value])
const batchLabel = (b:any) => b.status==='draft'?'待寄出':b.status==='cancelled'?'已取消':b.returned_count===b.item_count?'全部回货':b.returned_count+b.retake_count===b.item_count?'已结束（含重新取模）':'已寄出'
async function load() { try { const r:any=await request.get('/api/admin/fulfillment/batches'); batches.value=r.data || [] } catch(e:any) { MessagePlugin.error(e.message || '加载批次失败') } }
async function loadReady() { try { const r:any=await request.get('/api/admin/fulfillment/ready-molds',{params:{date:date.value || undefined}}); ready.value=r.data || []; selected.value=[] } catch(e:any) { MessagePlugin.error(e.message || '加载待送厂口模失败') } }
async function openCreate() { factory.value='';date.value=today();await loadReady();createVisible.value=true }
async function openDetail(id:number) { try { const r:any=await request.get(`/api/admin/fulfillment/batches/${id}`);detail.value=r.data;detailVisible.value=true } catch(e:any) { MessagePlugin.error(e.message || '加载批次详情失败') } }
async function refresh() { await load(); if(detailVisible.value)await openDetail(detail.value.id);emit('changed') }
async function create() {
  if(!factory.value.trim() || !selected.value.length)return MessagePlugin.warning('请填写工厂并勾选口模')
  if(busy.value)return;busy.value=true
  try { const r:any=await request.post('/api/admin/fulfillment/batches',{factory_name:factory.value,case_ids:selected.value});createVisible.value=false;await load();emit('changed');await openDetail(r.data.id);MessagePlugin.success('批次已创建，请核对实物后确认寄出') }
  catch(e:any){MessagePlugin.error(e.message || '创建失败')}finally{busy.value=false}
}
async function cancel() {
  if(!window.confirm('取消此未寄出的批次，并将全部口模退回待送厂？'))return
  busy.value=true
  try{await request.post(`/api/admin/fulfillment/batches/${detail.value.id}/cancel`);await refresh()}catch(e:any){MessagePlugin.error(e.message||'取消失败')}finally{busy.value=false}
}
function openAction(type:string,item:any=null){action.value=type;activeItem.value=item;form.value={carrier:'',tracking_no:'',confirmed:false,feedback:'',device_serial_no:'',storage_location:'',note:''};actionVisible.value=true}
async function saveAction(){
  if(busy.value)return;busy.value=true
  try{
    if(action.value==='ship')await request.post(`/api/admin/fulfillment/batches/${detail.value.id}/ship`,form.value)
    else if(action.value==='receipt')await request.post(`/api/admin/fulfillment/cases/${activeItem.value.fulfillment_case_id}/device-receipt`,form.value)
    else await request.post(`/api/admin/fulfillment/batches/${detail.value.id}/items/${activeItem.value.id}/progress`,{action:action.value,feedback:form.value.feedback})
    actionVisible.value=false;MessagePlugin.success('已保存');await refresh()
  }catch(e:any){MessagePlugin.error(e.message||'操作失败')}finally{busy.value=false}
}
async function download(item:any,file:any){try{await downloadMoldFile(item.fulfillment_case_id,file)}catch{MessagePlugin.error('下载失败')}}
onMounted(load)
defineExpose({load,openDetail})
</script>
<template>
  <div class="panel">
    <div class="filter-bar"><strong>送厂批次</strong><div class="actions"><button class="btn btn-outline" @click="load">刷新</button><button class="btn btn-primary" @click="openCreate">汇总口模 / 新建批次</button></div></div>
    <div class="panel-body"><table class="data-table" v-resizable><thead><tr><th>批次编号</th><th>制作工厂</th><th>口模数量</th><th>回货进度</th><th>状态</th><th>快递 / 运单</th><th style="width:120px;min-width:120px;text-align:right">操作</th></tr></thead><tbody>
      <tr v-for="b in batches" :key="b.id"><td>{{ b.batch_no }}</td><td>{{ b.factory_name }}</td><td>{{ b.item_count }}</td><td>{{ b.returned_count }} / {{ b.item_count }}</td><td><t-tag size="small" variant="light">{{ batchLabel(b) }}</t-tag></td><td>{{ b.carrier || '未寄出' }}<small>{{ b.tracking_no }}</small></td><td style="text-align:right"><button class="btn btn-xs btn-outline" @click="openDetail(b.id)">批次详情</button></td></tr>
      <tr v-if="!batches.length"><td colspan="7" class="empty">暂无送厂批次</td></tr>
    </tbody></table></div>
  </div>
  <t-dialog v-model:visible="createVisible" header="汇总待送厂口模" width="min(1000px, 94vw)" placement="center" :footer="false">
    <div class="batch-body">
      <div class="filters"><label>取模日期<input v-model="date" type="date" @change="loadReady"></label><button class="btn btn-outline" @click="date='';loadReady()">全部待送厂（含往日）</button><label>制作工厂 *<input v-model="factory" maxlength="150" placeholder="填写工厂名称"></label></div>
      <div class="panel-body"><table class="data-table"><thead><tr><th><input type="checkbox" :checked="!!ready.length && selected.length===ready.length" @change="selected=($event.target as HTMLInputElement).checked?ready.map(r=>r.id):[]"></th><th>患者 / 档案号</th><th>口模编号</th><th>取模日期</th><th>存放位置</th><th>制作要求</th></tr></thead><tbody>
        <tr v-for="r in ready" :key="r.id"><td><input v-model="selected" type="checkbox" :value="r.id"></td><td>{{ r.patient_name }}<small>{{ r.patient_no }}</small></td><td>{{ r.mold_no }}</td><td>{{ r.details.taken_date }}</td><td>{{ r.details.storage_location }}</td><td><div class="text-cell">{{ r.details.requirements }}</div></td></tr>
        <tr v-if="!ready.length"><td colspan="6" class="empty">暂无符合日期的待送厂口模；需先确认完成取模资料。</td></tr>
      </tbody></table></div>
    </div>
    <div class="footer"><span>已选择 {{ selected.length }} 件</span><button class="btn btn-outline" @click="createVisible=false">关闭</button><button class="btn btn-primary" :disabled="busy" @click="create">生成待寄批次</button></div>
  </t-dialog>
  <t-dialog v-model:visible="detailVisible" header="送厂批次与制作清单" width="min(1100px, 94vw)" placement="center" :footer="false">
    <template v-if="detail">
      <div class="batch-body">
        <div class="batch-summary"><b>{{ detail.batch_no }} · {{ detail.factory_name }}</b><p>{{ detail.status==='draft'?'待寄出 · 当前清单为预览，确认寄出时锁定资料':detail.status==='cancelled'?'此批次已取消':'已寄出 · 以下为寄出时的资料快照' }}</p><p v-if="detail.sent_at">{{ detail.carrier }} · {{ detail.tracking_no }} · {{ shanghaiTime(detail.sent_at) }} · 寄件人：{{ detail.sender_name || '未记录' }}</p></div>
        <section v-for="item in detail.items" :key="item.id" class="item-card">
          <div class="item-header"><b>交付单 #{{ item.fulfillment_case_id }} · {{ item.snapshot?.patient_ref || '已取消' }}</b><t-tag size="small" variant="light">{{ itemLabels[item.status] }}</t-tag></div>
          <template v-if="item.snapshot">
            <dl><div><dt>口模编号 / 日期 / 方式</dt><dd>{{ item.snapshot.mold.mold_no }} · {{ item.snapshot.mold.taken_date }} · {{ item.snapshot.mold.method }}</dd></div><div><dt>取模技师 / 口模存放位置</dt><dd>{{ item.snapshot.technician_name || '未记录' }} / {{ item.snapshot.mold.storage_location }}</dd></div><div><dt>计划佩戴</dt><dd>{{ item.snapshot.mold.wear_hours }} 小时 / 日 · {{ item.snapshot.mold.wear_period }}</dd></div><div><dt>适应期要求</dt><dd>{{ item.snapshot.mold.adaptation || '未填写' }}</dd></div></dl>
            <h4>设备商品 / 绑定设备参数</h4><p v-for="(p,i) in item.snapshot.products" :key="'p'+i">{{ p.product_name }} ×{{ p.quantity }}</p><p v-for="(d,i) in item.snapshot.devices" :key="'d'+i">{{ d.name }} · 初始前移 {{ d.initial_advancement ?? '未记录' }} mm<span v-for="(a,j) in d.adjustments" :key="j">；本次调整 {{ a.adjusted_advancement }} mm：{{ a.instructions }}</span></p>
            <h4>取模参数</h4><p v-for="(p,i) in item.snapshot.mold.parameters" :key="i">{{ p.name }}：{{ p.value }} {{ p.unit }}</p>
            <h4>工厂制作要求</h4><p>{{ item.snapshot.mold.requirements }}</p>
            <h4>医生治疗处方 / 医嘱</h4><p>{{ item.snapshot.prescription || '未关联处方' }}</p><p>{{ item.snapshot.doctor_advice }}</p>
            <h4>取模备注</h4><p>{{ item.snapshot.mold.note || '无' }}</p>
            <div class="files"><button v-for="f in item.snapshot.files" :key="f.id" class="btn btn-xs btn-outline" @click="download(item,f)">下载 {{ f.name }}</button></div>
          </template>
          <p v-if="item.feedback" class="feedback">工厂反馈：{{ item.feedback }}</p>
          <div v-if="item.receipt" class="receipt"><h4>设备回店验收</h4><p>设备编号：{{ item.receipt.device_serial_no }} · 存放位置：{{ item.receipt.storage_location }}</p><p>验收人：{{ item.receipt.receiver_name }} · {{ shanghaiTime(item.receipt.received_at) }}</p><p v-if="item.receipt.note">{{ item.receipt.note }}</p></div>
          <div v-if="detail.status==='shipped'" class="actions">
            <button v-if="item.status==='shipped'" class="btn btn-xs btn-primary" @click="openAction('received',item)">工厂签收</button>
            <button v-if="['received','exception'].includes(item.status)" class="btn btn-xs btn-primary" @click="openAction('producing',item)">制作 / 恢复制作</button>
            <button v-if="['shipped','received','producing'].includes(item.status)" class="btn btn-xs btn-warning" @click="openAction('exception',item)">登记异常</button>
            <button v-if="['shipped','received','producing','exception'].includes(item.status)" class="btn btn-xs btn-outline" @click="openAction('retake',item)">重新取模</button>
            <button v-if="['received','producing'].includes(item.status)" class="btn btn-xs btn-success" @click="openAction('receipt',item)">此件回货验收</button>
          </div>
        </section>
      </div>
      <div class="footer"><button class="btn btn-outline" @click="detailVisible=false">关闭</button><button v-if="detail.status!=='cancelled'" class="btn btn-outline" @click="exportManifest(detail)">导出制作清单 CSV</button><template v-if="detail.status==='draft'"><button class="btn btn-outline" :disabled="busy" @click="cancel">取消批次</button><button class="btn btn-primary" @click="openAction('ship')">确认寄出</button></template></div>
    </template>
  </t-dialog>
  <t-dialog v-model:visible="actionVisible" :header="actionName" placement="center" :footer="false">
    <div class="action-form">
      <template v-if="action==='ship'"><label>快递公司 *<input v-model="form.carrier" maxlength="100"></label><label>快递单号 *<input v-model="form.tracking_no" maxlength="100"></label><label class="check"><input v-model="form.confirmed" type="checkbox"> 已逐件核对口模及制作资料，并确认实物已寄出</label></template>
      <template v-else-if="action==='receipt'"><label>设备编号 *<input v-model="form.device_serial_no" maxlength="100"></label><label>设备存放位置 *<input v-model="form.storage_location" maxlength="150"></label><label>验收备注<textarea v-model="form.note" rows="3" /></label><p>仅将此件标记为验收通过；发现问题请关闭后登记异常。</p></template>
      <label v-else>工厂反馈 / 原因<textarea v-model="form.feedback" rows="4" maxlength="2000" /></label>
    </div><div class="footer"><button class="btn btn-outline" @click="actionVisible=false">取消</button><button class="btn btn-primary" :disabled="busy" @click="saveAction">确认</button></div>
  </t-dialog>
</template>
<style scoped>
.actions,.filters,.footer,.files{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.footer{justify-content:flex-end;margin-top:16px}.filter-bar strong{font-size:13px}.batch-body{max-height:65vh;overflow:auto;padding:4px}.filters{margin-bottom:16px;align-items:flex-end}label{display:flex;flex-direction:column;gap:6px;font-size:13px}input:not([type=checkbox]),textarea{padding:8px 12px;border:1px solid #D1D5DB;border-radius:8px;font:inherit;box-sizing:border-box;width:100%}small{display:block;color:#9CA3AF;font-size:11px}.empty{text-align:center;color:#9CA3AF!important}.text-cell{max-width:240px;white-space:pre-wrap;overflow-wrap:anywhere}.item-card{border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin-top:12px;font-size:13px}.item-header{display:flex;justify-content:space-between;gap:12px}.item-card dl{display:grid;grid-template-columns:1fr 1fr;gap:12px}.item-card dt,h4{color:#6B7280;font-size:12px;margin:12px 0 6px}.item-card dd{margin:0}.item-card p,.item-card dd{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}.item-card .actions{justify-content:flex-end;margin-top:12px}.feedback{background:#FFFBEB;padding:10px}.batch-summary{font-size:13px}.action-form{display:grid;gap:14px}.action-form .check{flex-direction:row;align-items:center}.action-form p{color:#6B7280;font-size:12px}button:disabled{opacity:.5;cursor:not-allowed}
</style>
