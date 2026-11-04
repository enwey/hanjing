<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
const emit = defineEmits(['cleaned'])
type Group = { id: string; label: string; description: string }
type Plan = { database: string; token: string; total: number; tables: Array<{table:string;label:string;count:number}>; updates: Array<{table:string;label:string;count:number}> }
const groups=ref<Group[]>([]), selected=ref<string[]>([]), loading=ref(false), running=ref(false)
const plan=ref<Plan|null>(null), confirmation=ref(''), visible=ref(false), result=ref(''), loadError=ref(false)
const selectedMenuNames=computed(()=>groups.value.filter(group=>selected.value.includes(group.id)).map(group=>group.label).join('、'))
const canExecute=computed(()=>!!plan.value && confirmation.value==='确认清理' && !running.value && plan.value.total>0)
watch(selected,()=>{plan.value=null;confirmation.value='';result.value=''}, {deep:true})
async function load(){loadError.value=false;try{const r:any=await request.get('/api/admin/database/temporary-cleanup');groups.value=r.data.groups}catch{loadError.value=true}}
onMounted(load)
async function preview(){if(!selected.value.length)return;loading.value=true;result.value='';try{const r:any=await request.post('/api/admin/database/temporary-cleanup/preview',{groups:selected.value},{timeout:120000});plan.value=r.data;confirmation.value='';visible.value=true}catch{plan.value=null}finally{loading.value=false}}
async function execute(){if(!canExecute.value)return;running.value=true;try{const r:any=await request.post('/api/admin/database/temporary-cleanup/execute',{token:plan.value!.token,confirmation:confirmation.value},{timeout:120000});result.value=`已清理 ${r.data.total} 条记录，涉及 ${r.data.tables.length} 张业务表。`;visible.value=false;plan.value=null;MessagePlugin.success('运行数据清理完成');emit('cleaned')}catch{plan.value=null;visible.value=false;MessagePlugin.warning('本次确认已失效，请重新预览并核对清理结果')}finally{running.value=false}}
</script>
<template>
  <section class="panel cleanup-panel">
    <div class="panel-header"><div><div class="panel-title">清理运行数据 <span class="cleanup-badge">临时工具</span></div><p class="cleanup-subtitle">选择要清理数据的后台菜单，相关记录会一并处理。仅超级管理员可操作。</p></div></div>
    <div class="cleanup-body">
      <div class="cleanup-notice">保留角色、成员、系统设置、微信通知配置及日志、门店、医生和患者登录账号。“分销总览 / 提现审核”仅清流水；“推广员账号与绑定关系”会删除推广端账号、推广码及绑定关系。商品、分类和文章可单独勾选清理，关联业务会列入确认清单。清理不可撤销，请先备份；不会向微信发起退款，也不会删除服务器上的附件文件。</div>
      <div v-if="loadError" class="cleanup-error">加载清理选项失败 <button class="btn btn-outline" @click="load">重新加载</button></div>
      <div class="cleanup-section-title">选择要清理的菜单数据</div>
      <div class="cleanup-options">
        <label v-for="group in groups" :key="group.id" class="cleanup-option" :class="{'is-selected':selected.includes(group.id)}">
          <input v-model="selected" type="checkbox" :value="group.id" :disabled="loading||running" />
          <div><strong>{{ group.label }}</strong><p>{{ group.description }}</p></div>
        </label>
      </div>
      <div class="cleanup-actions"><span>{{ result || (selected.length ? `已选择：${selectedMenuNames}` : '请选择需要清理数据的菜单') }}</span><button class="btn btn-danger" :disabled="!selected.length||loading||running" @click="preview">{{ loading ? '正在核对关联数据…' : '预览清理范围' }}</button></div>
    </div>
    <t-dialog v-model:visible="visible" header="确认清理运行数据" :width="820" :footer="false" :close-on-overlay-click="false" :close-on-esc-keydown="!running" :close-btn="!running">
      <div v-if="plan" class="cleanup-confirm">
        <p class="cleanup-selection"><strong>所选菜单：</strong>{{ selectedMenuNames }}</p>
        <p class="cleanup-danger">当前数据库：{{ plan.database || '—' }}。将永久删除以下 {{ plan.total }} 条记录。关联数据已包含在清单中，请确认已完成备份。</p>
        <div class="cleanup-table-scroll"><table class="cleanup-table"><thead><tr><th>业务 / 数据表</th><th>记录数</th></tr></thead><tbody><tr v-for="item in plan.tables" :key="item.table"><td>{{ item.label }}<small v-if="item.label!==item.table">{{ item.table }}</small></td><td>{{ item.count }}</td></tr><tr v-if="!plan.tables.length"><td colspan="2">所选业务暂无可清理数据</td></tr></tbody></table></div>
        <div v-if="plan.updates.length" class="cleanup-updates"><strong>同步处理</strong><p v-for="(item,index) in plan.updates" :key="index">{{ item.label }}</p></div>
        <label class="cleanup-confirm-label">输入“确认清理”后执行<input v-model="confirmation" :disabled="running" placeholder="确认清理" autocomplete="off" /></label>
        <div class="cleanup-dialog-actions"><button class="btn btn-outline" :disabled="running" @click="visible=false">取消</button><button class="btn btn-danger" :disabled="!canExecute" @click="execute">{{ running?'正在清理…':'立即清理' }}</button></div>
      </div>
    </t-dialog>
  </section>
</template>
<style scoped>
.cleanup-section-title{font-weight:600;margin-bottom:12px}.cleanup-selection{margin:0 0 14px;line-height:1.7}.cleanup-panel{margin-bottom:24px}.cleanup-badge{font-size:12px;font-weight:400;background:#fff4e5;color:#9a6700;padding:3px 8px;border-radius:4px;margin-left:8px}.cleanup-subtitle{font-size:13px;color:#6b7280;margin:8px 0 0}.cleanup-body{padding:24px}.cleanup-notice{padding:12px 16px;background:#fff8eb;color:#876321;border-radius:8px;line-height:1.7;font-size:13px;margin-bottom:18px}.cleanup-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cleanup-option{display:flex;gap:12px;align-items:flex-start;border:1px solid #e5e7eb;border-radius:8px;padding:16px;cursor:pointer}.cleanup-option input{margin-top:4px;accent-color:var(--primary-500);width:16px;height:16px;flex-shrink:0}.cleanup-option p{margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.6}.cleanup-option strong{font-size:14px}.cleanup-option.is-selected{border-color:var(--primary-500);background:var(--primary-50,#eef3ff)}.cleanup-actions{display:flex;justify-content:space-between;align-items:center;margin-top:20px;gap:12px;color:#6b7280}.cleanup-danger{color:#b91c1c;background:#fff1f2;padding:12px 16px;border-radius:8px;line-height:1.6;margin:0 0 16px}.cleanup-table-scroll{max-height:280px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px}.cleanup-table{width:100%;border-collapse:collapse}.cleanup-table th,.cleanup-table td{padding:10px 14px;text-align:left;border-bottom:1px solid #f0f2f5}.cleanup-table th{background:#f8fafc;position:sticky;top:0}.cleanup-table th:last-child,.cleanup-table td:last-child{text-align:right}.cleanup-table small{display:block;color:#9ca3af;margin-top:3px}.cleanup-updates{margin:16px 0;color:#6b7280;font-size:13px}.cleanup-updates p{margin:6px 0}.cleanup-confirm-label{display:block;margin-top:16px;font-size:14px}.cleanup-confirm-label input{display:block;width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:6px;margin-top:8px}.cleanup-dialog-actions{display:flex;justify-content:flex-end;gap:12px;border-top:1px solid #eef0f4;padding-top:16px;margin-top:20px}.cleanup-error{padding:12px;color:#b91c1c}@media(max-width:900px){.cleanup-options{grid-template-columns:1fr}}
</style>
