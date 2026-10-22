<script setup lang="ts">
import { ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
const props=defineProps<{ promoterId?: string; status?: string }>()
const emit=defineEmits(['saved'])
const visible=ref(false),busy=ref(false),qr=ref(''),qrVisible=ref(false),resetVisible=ref(false),password=ref('')
const form=ref({nickname:'',phone:'',login_name:'',password:''})
async function create(){if(busy.value)return;busy.value=true;try{const r:any=await request.post('/api/admin/distribution/promoters',form.value);visible.value=false;form.value={nickname:'',phone:'',login_name:'',password:''};emit('saved');MessagePlugin.success('推广员已创建');if(r.data?.qr?.image){qr.value=r.data.qr.image;qrVisible.value=true}else MessagePlugin.warning(r.data?.qrError||'小程序码暂未生成，可稍后重试')}finally{busy.value=false}}
async function showQr(){busy.value=true;try{const r:any=await request.get(`/api/admin/distribution/promoters/${props.promoterId}/qr`);qr.value=r.data.image;qrVisible.value=true}finally{busy.value=false}}
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
  <t-dialog v-model:visible="visible" header="添加后台推广员" :confirm-btn="{content:'创建',loading:busy}" @confirm="create">
    <t-form label-width="100px">
      <t-form-item label="姓名"><t-input v-model="form.nickname" :maxlength="100" /></t-form-item>
      <t-form-item label="联系方式"><t-input v-model="form.phone" :maxlength="11" /></t-form-item>
      <t-form-item label="推广登录账号"><t-input v-model="form.login_name" placeholder="4-64位字母、数字或_@.-" /></t-form-item>
      <t-form-item label="登录密码"><t-input v-model="form.password" type="password" placeholder="8-64位，包含字母和数字" /></t-form-item>
    </t-form>
  </t-dialog>
  <t-dialog v-model:visible="resetVisible" header="重置推广员密码" @confirm="reset"><t-input v-model="password" type="password" placeholder="8-64位字母数字密码，旧登录将失效" /></t-dialog>
  <t-dialog v-model:visible="qrVisible" header="预约推广小程序码" :footer="false"><img :src="qr" alt="预约推广小程序码" style="width:100%;max-width:360px" /><a :href="qr" download="推广小程序码.png" class="btn btn-primary">下载小程序码</a></t-dialog>
</template>
<style scoped>
.actions { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
</style>
