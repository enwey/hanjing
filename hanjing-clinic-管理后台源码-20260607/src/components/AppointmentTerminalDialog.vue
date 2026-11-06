<script setup lang="ts">
import { computed, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { hasPermission } from '@/utils/permission'
const emit = defineEmits<{ changed: [] }>()
const visible = ref(false), busy = ref(false), loading = ref(false)
const id = ref(''), target = ref<'cancelled' | 'no_show'>('cancelled')
const data = ref<any>(), error = ref(''), confirmed = ref(false)
const action = ref<'refund' | 'waive'>('refund')
const charges = computed(() => (data.value?.charges || []).filter((c:any) => ['paid','refund_pending'].includes(c.status)))
const offline = computed(() => charges.value.some((c:any) => !['wechat','wechat_native'].includes(c.payment_method)))
const amount = computed(() => charges.value.reduce((n:number,c:any) => n + Number(c.consult_fee) + Number(c.deposit_amount),0))
const blocked = computed(() => !!data.value?.legacy_order_id || (data.value?.charges || []).some((c:any)=>['refunding','refund_waived','refunded'].includes(c.status)))
const allowed = computed(() => !charges.value.length || hasPermission('appointment:refund'))
async function open(value:string|number,status:'cancelled'|'no_show',initialAction:'refund'|'waive'='refund') {
  if(busy.value)return
  id.value=String(value);target.value=status;data.value=undefined;error.value='';confirmed.value=false;action.value=initialAction;visible.value=true;loading.value=true
  try { const result:any=await request.get('/api/admin/appointments/'+id.value+'/charges');data.value=result.data }
  catch {error.value='费用信息加载失败，请关闭后重试'} finally {loading.value=false}
}
async function submit() {
  if(busy.value || loading.value || !data.value || blocked.value || !allowed.value)return
  if(action.value==='refund' && offline.value && !confirmed.value)return
  busy.value=true;error.value=''
  try {
    const result:any=await request.put('/api/admin/appointments/'+id.value,{
      status:target.value,
      ...(charges.value.length ? {refund_action:action.value,offline_confirmed:confirmed.value} : {})
    })
    emit('changed')
    if(result.data?.refund_errors?.length){error.value=result.message;data.value=undefined;return}
    MessagePlugin.success(charges.value.length ? action.value==='waive' ? '已标记未到诊，无需退款' : charges.value.some((c:any)=>['wechat','wechat_native'].includes(c.payment_method)) ? '预约已处理，微信退款以实际到账结果为准' : '预约已处理，退款已登记' : '预约已处理')
    visible.value=false
  } catch(e:any) {error.value=e?.response?.data?.message || e?.message || '处理失败，请核对后重试'} finally {busy.value=false}
}
defineExpose({open})
</script>
<template>
  <t-dialog v-model:visible="visible" :header="target==='cancelled'?'取消预约':'标记未到诊'" width="520px" :footer="null" :close-on-overlay-click="!busy" :close-on-esc-keydown="!busy" :close-btn="!busy">
    <div class="terminal-body">
      <p v-if="loading">正在核对预约费用…</p>
      <template v-else-if="data">
        <div class="terminal-summary"><span>{{ data.appointment?.patient_name }} · {{ data.appointment?.appointment_no }}</span><strong v-if="charges.length">待退费用 ¥{{ (amount / 100).toFixed(2) }}</strong></div>
        <p v-if="blocked">{{ data.legacy_order_id ? '该预约有关联订单，请先在原订单中处理退款。' : '该预约已有退款处理结果，请在收费与退款中查看。' }}</p>
        <template v-else>
          <div v-if="target==='no_show' && charges.length" class="terminal-options">
            <button :class="{selected:action==='refund'}" :disabled="busy" @click="action='refund';confirmed=false">办理退款</button>
            <button :class="{selected:action==='waive'}" :disabled="busy" @click="action='waive';confirmed=false">无需退款</button>
          </div>
          <p v-if="!charges.length">确认{{ target==='cancelled'?'取消该预约':'标记该患者未到诊' }}？当前没有需要退还的预约费用。</p>
          <p v-else-if="action==='waive'">确认该预约无需退款，已收费用将保留，不会发起退款请求。</p>
          <template v-else>
            <p v-if="charges.some((c:any)=>['wechat','wechat_native'].includes(c.payment_method))">确认后，微信支付费用将原路退回，到账时间以微信处理结果为准。</p>
            <label v-if="offline" class="terminal-confirm"><input v-model="confirmed" type="checkbox" :disabled="busy"> 已将现金或线下款项退还患者</label>
          </template>
          <p v-if="!allowed">当前账号没有退款处理权限，请联系有权限的工作人员处理。</p>
        </template>
      </template>
      <p v-if="error" class="terminal-error">{{ error }}</p>
      <div class="terminal-footer">
        <t-button variant="outline" :disabled="busy" @click="visible=false">返回</t-button>
        <t-button theme="primary" :loading="busy" :disabled="loading || !data || blocked || !allowed || (action==='refund' && offline && !confirmed)" @click="submit">{{ charges.length ? action==='waive'?'确认无需退款':'确认并退款': '确认' }}</t-button>
      </div>
    </div>
  </t-dialog>
</template>
<style scoped>
.terminal-body{display:flex;flex-direction:column;gap:18px}.terminal-body p{margin:0;line-height:1.7;color:#64748b}.terminal-summary{display:flex;flex-direction:column;gap:12px;background:#f5f7fb;padding:16px;border-radius:8px}.terminal-summary strong{font-size:22px;color:var(--primary-500)}.terminal-options{display:flex;gap:12px}.terminal-options button{flex:1;padding:12px;border:1px solid #dce2eb;border-radius:8px;background:white;cursor:pointer}.terminal-options .selected{border-color:var(--primary-500);color:var(--primary-500);background:#f3f6ff}.terminal-confirm{display:flex;gap:10px;align-items:center;background:#f5f7fb;padding:14px;border-radius:8px}.terminal-footer{display:flex;justify-content:flex-end;gap:12px;border-top:1px solid #edf0f5;padding-top:18px}.terminal-body .terminal-error{color:#d93036}
</style>
