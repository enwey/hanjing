<script setup lang="ts">
import { ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { moldDescription, downloadMoldFile } from './delivery'
const emit = defineEmits(['saved'])
const visible = ref(false), busy = ref(false), editable = ref(false), caseId = ref(0), revision = ref(0)
const clinical = ref<any>({}), files = ref<any[]>([]), form = ref<any>({})
async function open(item: any) {
  try {
    const r: any = await request.get(`/api/admin/fulfillment/cases/${item.id}/mold`), d = r.data
    caseId.value = item.id; revision.value = d.profile?.revision || 0; editable.value = d.editable
    clinical.value = d.clinical; files.value = d.files || []
    form.value = { description: moldDescription(d.profile?.details || d.mold || {}) }
    visible.value = true
  } catch (e: any) { MessagePlugin.error(e.message || '加载取模资料失败') }
}
async function save(complete: boolean) {
  if (busy.value) return
  busy.value = true
  try {
    await request.post(`/api/admin/fulfillment/cases/${caseId.value}/mold`, { details: form.value, revision: revision.value, complete })
    MessagePlugin.success(complete ? '取模已完成，进入待送厂' : '草稿已保存'); visible.value = false; emit('saved')
  } catch (e: any) { MessagePlugin.error(e.message || '保存失败') } finally { busy.value = false }
}
async function download(file: any) { try { await downloadMoldFile(caseId.value, file) } catch { MessagePlugin.error('下载失败') } }
defineExpose({ open })
</script>
<template>
  <t-dialog v-model:visible="visible" header="取模与制作资料" width="min(720px, 94vw)" placement="center" :footer="false">
    <div class="mold-body">
      <section class="requirements">
        <h3>医生治疗要求（只读）</h3>
        <p>{{ clinical.medical_record?.prescription || '尚未关联医生处方，请核对制作要求后再确认取模。' }}</p>
        <p v-if="clinical.medical_record?.doctor_advice">医嘱：{{ clinical.medical_record.doctor_advice }}</p>
        <div v-for="t in clinical.treatments" :key="t.id">
          <p>{{ t.device_product_name || t.device_model }} · 初始前移量 {{ t.initial_advancement ?? '未记录' }} mm</p>
          <p v-for="a in t.adjustments?.filter((a:any) => a.medical_record_id === clinical.medical_record?.id)" :key="a.id">调整至 {{ a.adjusted_advancement }} mm：{{ a.instructions || '无补充说明' }}</p>
        </div>
      </section>
      <label class="description-label" for="mold-description">取模说明</label>
      <textarea id="mold-description" v-model="form.description" :disabled="!editable || busy" rows="8" maxlength="5000" placeholder="请填写取模情况、制作要求及需要注意的事项"></textarea>
      <div class="word-count">{{ form.description?.length || 0 }} / 5000</div>
      <div v-for="file in files" :key="file.id" class="file-row"><span>{{ file.name }}</span><button class="btn btn-xs btn-outline" @click="download(file)">下载</button></div>
    </div>
    <div class="footer"><span v-if="!editable">当前环节资料已锁定</span><button class="btn btn-outline" @click="visible = false">关闭</button><template v-if="editable"><button v-permission="'fulfillment:mold'" class="btn btn-outline" :disabled="busy" @click="save(false)">暂存草稿</button><button v-permission="'fulfillment:mold'" class="btn btn-primary" :disabled="busy" @click="save(true)">确认取模完成</button></template></div>
  </t-dialog>
</template>
<style scoped>
.mold-body{max-height:65vh;overflow:auto;padding:4px}.requirements{background:var(--td-brand-color-light, #EEF4FF);padding:14px;border-radius:8px;margin-bottom:18px}.requirements h3{font-size:14px;margin:0 0 8px}.requirements p{white-space:pre-wrap;margin:6px 0;font-size:13px}.description-label{display:block;font-size:14px;font-weight:600;margin-bottom:8px}textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #D1D5DB;border-radius:8px;font:inherit;font-size:14px;line-height:1.7;resize:vertical;min-height:180px;background:#fff}textarea:focus{outline:none;border-color:var(--td-brand-color,#3B6BF5)}textarea:disabled{background:#F8FAFC;color:#374151}.word-count{text-align:right;color:#9CA3AF;font-size:12px;margin-top:6px}.footer,.file-row{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:16px}.file-row{justify-content:space-between;font-size:13px}button:disabled{opacity:.5;cursor:not-allowed}
</style>
