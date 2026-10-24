<script setup lang="ts">
import { ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { brandPromoterQr } from '@/utils/promoterQr'
import ImageUploadField from '@/components/ImageUploadField.vue'
import AppIcon from '@/components/AppIcon.vue'
const props=defineProps<{ promoterId?: string; status?: string }>()
const emit=defineEmits(['saved'])
const visible=ref(false),busy=ref(false),qr=ref(''),qrCode=ref(''),qrVisible=ref(false),resetVisible=ref(false),password=ref('')
const emptyForm=()=>({nickname:'',avatar_url:'',phone:'',login_name:'',password:''})
const emptyErrors=()=>({nickname:'',phone:'',login_name:'',password:''})
const form=ref(emptyForm())
const errors=ref(emptyErrors())
type FieldName=keyof ReturnType<typeof emptyErrors>
function validateField(field:FieldName){
  const value=String(form.value[field]||'').trim()
  if(field==='nickname')return value?'':'请输入推广员姓名'
  if(field==='phone')return !value||/^1[3-9]\d{9}$/.test(value)?'':'请输入有效的11位手机号'
  if(field==='login_name')return /^[a-zA-Z0-9_@.\-]{4,64}$/.test(value)?'':'请输入4-64位字母、数字或 _ @ . -'
  return value.length>=8&&value.length<=64&&/[A-Za-z]/.test(value)&&/[0-9]/.test(value)?'':'请输入8-64位且包含字母和数字的密码'
}
function validateForm(){
  const next=emptyErrors()
  ;(Object.keys(next) as FieldName[]).forEach(field=>{next[field]=validateField(field)})
  errors.value=next
  return !Object.values(next).some(Boolean)
}
watch(form,()=>{(Object.keys(errors.value) as FieldName[]).forEach(field=>{if(errors.value[field])errors.value[field]=validateField(field)})},{deep:true})
watch(visible,(opened)=>{if(!opened){form.value=emptyForm();errors.value=emptyErrors()}})
async function create(){if(busy.value||!validateForm())return;busy.value=true;try{const r:any=await request.post('/api/admin/distribution/promoters',form.value);visible.value=false;emit('saved');MessagePlugin.success('推广员已创建');if(r.data?.qr?.image){qr.value=await brandPromoterQr(r.data.qr.image);qrCode.value=r.data.qr.code||'';qrVisible.value=true}else MessagePlugin.warning(r.data?.qrError||'小程序码暂未生成，可稍后重试')}finally{busy.value=false}}
async function showQr(){busy.value=true;try{const r:any=await request.get(`/api/admin/distribution/promoters/${props.promoterId}/qr`);qr.value=await brandPromoterQr(r.data.image);qrCode.value=r.data.code||'';qrVisible.value=true}finally{busy.value=false}}
async function reset(){if(busy.value)return;busy.value=true;try{await request.put(`/api/admin/distribution/promoters/${props.promoterId}/password`,{password:password.value});password.value='';resetVisible.value=false;MessagePlugin.success('密码已重置')}finally{busy.value=false}}
async function toggle(){await request.put(`/api/admin/distribution/promoters/${props.promoterId}/status`,{status:props.status==='active'?'disabled':'active'});emit('saved')}
</script>
<template>
  <span v-if="promoterId" class="actions">
    <button class="btn btn-xs btn-outline" :disabled="busy" @click="showQr">小程序码</button>
    <button class="btn btn-xs btn-outline" @click="resetVisible=true">重置密码</button>
    <button class="btn btn-xs btn-outline" @click="toggle">{{status==='active'?'停用':'启用'}}</button>
  </span>
  <button v-else class="btn btn-primary" @click="visible=true">添加推广员</button>
  <t-dialog v-model:visible="visible" header="添加推广员" width="640px" :confirm-btn="{content:'创建',loading:busy}" @confirm="create">
    <t-form :data="form" label-width="100px">
      <t-form-item label="头像（选填）">
        <ImageUploadField
          v-model="form.avatar_url"
          label="头像"
          context="promoter-avatar"
          :max-size-mb="2"
          ratio-label="1:1"
          :ratio="1"
          :min-width="240"
          :min-height="240"
          preview-ratio="1 / 1"
        />
      </t-form-item>
      <t-form-item label="推广员姓名" :status="errors.nickname?'error':undefined" :tips="errors.nickname"><t-input v-model="form.nickname" :maxlength="100" placeholder="请输入推广员姓名" /></t-form-item>
      <t-form-item label="联系电话" :status="errors.phone?'error':undefined" :tips="errors.phone"><t-input v-model="form.phone" :maxlength="11" placeholder="选填，请输入11位手机号" /></t-form-item>
      <t-form-item label="登录账号" :status="errors.login_name?'error':undefined" :tips="errors.login_name"><t-input v-model="form.login_name" placeholder="4-64位字母、数字或_@.-" /></t-form-item>
      <t-form-item label="登录密码" :status="errors.password?'error':undefined" :tips="errors.password"><t-input v-model="form.password" type="password" placeholder="8-64位，包含字母和数字" /></t-form-item>
    </t-form>
  </t-dialog>
  <t-dialog v-model:visible="resetVisible" header="重置推广员密码" attach="body" :z-index="4000" @confirm="reset"><t-input v-model="password" type="password" placeholder="8-64位字母数字密码，旧登录将失效" /></t-dialog>
  <t-dialog
    v-model:visible="qrVisible"
    header="预约推广小程序码"
    attach="body"
    width="min(440px, calc(100vw - 32px))"
    placement="center"
    :z-index="4000"
    :footer="false"
    destroy-on-close
  >
    <div class="qr-dialog-content">
      <div class="qr-image-wrap">
        <img :src="qr" alt="预约推广小程序码">
      </div>
      <div class="qr-description">患者使用微信扫码后进入预约流程</div>
      <div v-if="qrCode" class="qr-code-text" style="margin-top: 8px; font-size: 13px; color: #4B5563; font-family: monospace; background: #F3F4F6; padding: 4px 10px; border-radius: 4px; word-break: break-all;">
        推广编码：{{ qrCode }}
      </div>
      <a :href="qr" download="预约推广小程序码.png" class="qr-download-button">
        <AppIcon name="download" />
        下载小程序码
      </a>
    </div>
  </t-dialog>
</template>
<style scoped>
.actions { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }

.qr-dialog-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 4px 0 8px;
  overflow: hidden;
  box-sizing: border-box;
}

.qr-image-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(300px, 100%);
  aspect-ratio: 1;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  box-sizing: border-box;
}

.qr-image-wrap img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-description {
  color: #6b7280;
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}

.qr-download-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 148px;
  height: 40px;
  padding: 0 18px;
  border-radius: 6px;
  color: #fff;
  background: #3b6bf5;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  box-sizing: border-box;
}

.qr-download-button:hover {
  background: #2f5bd8;
}
</style>
