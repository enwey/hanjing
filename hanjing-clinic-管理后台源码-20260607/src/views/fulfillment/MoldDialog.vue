<script setup lang="ts">
import { ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { today, downloadMoldFile } from './delivery'
const emit = defineEmits(['saved'])
const visible = ref(false), busy = ref(false), editable = ref(false), caseId = ref(0), revision = ref(0)
const clinical = ref<any>({}), files = ref<any[]>([]), form = ref<any>({})
async function open(item: any) {
  try {
    const r: any = await request.get(`/api/admin/fulfillment/cases/${item.id}/mold`), d = r.data
    caseId.value = item.id; revision.value = d.profile?.revision || 0; editable.value = d.editable
    clinical.value = d.clinical; files.value = d.files || []
    form.value = { mold_no: d.mold?.mold_no || '', storage_location: d.mold?.storage_location || '', taken_date: today(), method: '',
      parameters: [{ name: '', value: '', unit: '' }], wear_hours: '', wear_period: '', adaptation: '', requirements: '', note: '', file_ids: [], ...d.profile?.details }
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
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) { MessagePlugin.warning('单文件不能超过 5MB'); input.value = ''; return }
  busy.value = true
  try {
    const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) })
    const r: any = await request.post(`/api/admin/fulfillment/cases/${caseId.value}/mold-files`, { name: file.name, base64 })
    files.value.push(r.data); form.value.file_ids.push(r.data.id)
  } catch (e: any) { MessagePlugin.error(e.message || '上传失败') } finally { busy.value = false; input.value = '' }
}
async function download(file: any) { try { await downloadMoldFile(caseId.value, file) } catch { MessagePlugin.error('下载失败') } }
defineExpose({ open })
</script>
<template>
  <t-dialog v-model:visible="visible" header="取模与制作资料" width="min(980px, 94vw)" placement="center" :footer="false">
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
      <fieldset :disabled="!editable || busy" class="mold-form">
        <label>口模编号 *<input v-model="form.mold_no" maxlength="80"></label>
        <label>口模存放位置 *<input v-model="form.storage_location" maxlength="150"></label>
        <label>取模日期 *<input v-model="form.taken_date" type="date"></label>
        <label>取模方式 *<select v-model="form.method"><option value="">请选择</option><option>实体口模</option><option>数字扫描</option><option>实体口模 + 数字扫描</option></select></label>
        <div class="full">
          <label>取模参数 *（按实际测量填写）</label>
          <div v-for="(p, index) in form.parameters" :key="index" class="parameter-row">
            <input v-model="p.name" placeholder="参数名称" maxlength="80"><input v-model="p.value" placeholder="测量值" maxlength="200"><input v-model="p.unit" placeholder="单位" maxlength="30">
            <button class="btn btn-xs btn-outline" @click="form.parameters.splice(index, 1)">移除</button>
          </div>
          <button v-if="editable" class="btn btn-xs btn-outline" @click="form.parameters.push({ name: '', value: '', unit: '' })">添加参数</button>
        </div>
        <label>每日计划佩戴时长（小时）*<input v-model="form.wear_hours" type="number" min="0.1" max="24" step="0.1"></label>
        <label>计划佩戴时段 *<input v-model="form.wear_period" placeholder="按医生要求填写" maxlength="150"></label>
        <label class="full">适应期要求<textarea v-model="form.adaptation" rows="2" maxlength="2000" /></label>
        <label class="full">设备规格 / 工厂制作要求 *<textarea v-model="form.requirements" rows="3" maxlength="2000" /></label>
        <label class="full">取模备注 / 注意事项<textarea v-model="form.note" rows="2" maxlength="2000" /></label>
        <div class="full"><label>照片 / 扫描附件（勾选随本次口模送厂的文件）</label><input v-if="editable" type="file" accept=".jpg,.jpeg,.png,.pdf,.stl,.ply" @change="upload"><small>单文件不超过 5MB；计划佩戴时长不是患者实际打卡时长。</small></div>
      </fieldset>
      <div v-for="file in files" :key="file.id" class="file-row"><label><input v-model="form.file_ids" type="checkbox" :value="file.id" :disabled="!editable || busy"> {{ file.name }}</label><button class="btn btn-xs btn-outline" @click="download(file)">下载</button></div>
    </div>
    <div class="footer"><span v-if="!editable">当前环节资料已锁定</span><button class="btn btn-outline" @click="visible = false">关闭</button><template v-if="editable"><button class="btn btn-outline" :disabled="busy" @click="save(false)">暂存草稿</button><button class="btn btn-primary" :disabled="busy" @click="save(true)">确认取模完成</button></template></div>
  </t-dialog>
</template>
<style scoped>
.mold-body{max-height:65vh;overflow:auto;padding:4px}.requirements{background:#EEF4FF;padding:14px;border-radius:8px;margin-bottom:16px}.requirements h3{font-size:14px;margin:0 0 8px}.requirements p{white-space:pre-wrap;margin:6px 0;font-size:13px}.mold-form{border:0;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:14px}.mold-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:#374151}.full{grid-column:1/-1}input:not([type=checkbox]),select,textarea{box-sizing:border-box;width:100%;padding:8px 12px;border:1px solid #D1D5DB;border-radius:8px;font:inherit;font-size:13px;background:#fff}.parameter-row{display:grid;grid-template-columns:2fr 2fr 1fr auto;gap:8px;margin:8px 0}.footer,.file-row{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:16px}.file-row{justify-content:space-between;font-size:13px}small{display:block;color:#9CA3AF;margin-top:6px}button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:650px){.mold-form{grid-template-columns:1fr}.parameter-row{grid-template-columns:1fr 1fr}}
</style>
