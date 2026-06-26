<script setup lang="ts">
import { ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  defaultName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:visible', 'success'])

const createForm = ref({
  name: '',
  phone: '',
  gender: '男',
  age: 30,
  level: '普通',
  source: '门店',
  tagsInput: '',
  medicalHistoryInput: ''
})

watch(() => props.visible, (val) => {
  if (val) {
    createForm.value = {
      name: '',
      phone: '',
      gender: '男',
      age: 30,
      level: '普通',
      source: '门店',
      tagsInput: '',
      medicalHistoryInput: ''
    }
  }
})

const loading = ref(false)

async function handleConfirm() {
  if (!createForm.value.name.trim()) {
    MessagePlugin.warning('请填写患者姓名')
    return
  }
  if (!createForm.value.phone.trim()) {
    MessagePlugin.warning('请填写患者手机号')
    return
  }
  if (!/^1[3-9]\d{9}$/.test(createForm.value.phone.trim())) {
    MessagePlugin.warning('请输入正确的11位手机号')
    return
  }

  loading.value = true
  try {
    const res: any = await request.post('/api/admin/patients', {
      name: createForm.value.name.trim(),
      phone: createForm.value.phone.trim(),
      gender: createForm.value.gender,
      age: parseInt(createForm.value.age as any) || null,
      level: createForm.value.level,
      source: createForm.value.source,
      tagsInput: createForm.value.tagsInput.trim(),
      medicalHistoryInput: createForm.value.medicalHistoryInput.trim()
    })
    
    emit('success', res.data)
    emit('update:visible', false)
  } catch (error: any) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog
    :visible="visible"
    header="新患者建档"
    width="520px"
    confirm-btn="确认建档"
    cancel-btn="取消"
    :confirm-loading="loading"
    @update:visible="val => emit('update:visible', val)"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  >
    <div class="dialog-body-form">
      <div class="form-group">
        <label class="form-label">姓名<span class="required">*</span></label>
        <input type="text" class="form-control" v-model="createForm.name" placeholder="请输入患者姓名">
      </div>
      <div class="form-group">
        <label class="form-label">手机号<span class="required">*</span></label>
        <input type="text" class="form-control" v-model="createForm.phone" placeholder="请输入11位手机号">
      </div>
      <div class="form-group">
        <label class="form-label">性别</label>
        <t-radio-group v-model="createForm.gender">
          <t-radio value="男">男</t-radio>
          <t-radio value="女">女</t-radio>
        </t-radio-group>
      </div>
      <div class="form-group">
        <label class="form-label">年龄</label>
        <input type="number" class="form-control" v-model.number="createForm.age" placeholder="请输入年龄">
      </div>
      <div class="form-group">
        <label class="form-label">会员等级</label>
        <select class="form-control" v-model="createForm.level">
          <option value="普通">普通</option>
          <option value="VIP">VIP</option>
          <option value="SVIP">SVIP</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">来源渠道</label>
        <select class="form-control" v-model="createForm.source">
          <option value="小程序">小程序</option>
          <option value="分销">分销</option>
          <option value="转介绍">转介绍</option>
          <option value="门店">门店</option>
          <option value="直播">直播</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">患者标签</label>
        <input type="text" class="form-control" v-model="createForm.tagsInput" placeholder="请输入标签，英文/中文逗号分隔">
      </div>
      <div class="form-group">
        <label class="form-label">既往病史</label>
        <textarea class="form-control" style="height: auto; min-height: 80px;" v-model="createForm.medicalHistoryInput" placeholder="请输入既往病史，英文/中文逗号分隔"></textarea>
      </div>
    </div>
  </t-dialog>
</template>

<style scoped>
.dialog-body-form {
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.required {
  color: #EF4444;
  margin-left: 2px;
}

.form-control {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  font-size: 13px;
  color: #1F2937;
  outline: none;
  background: #fff;
  transition: all 150ms ease;
  height: 36px;
  box-sizing: border-box;
}

.form-control:focus {
  border-color: var(--primary-500, #3B6BF5);
  box-shadow: 0 0 0 2px rgba(59, 107, 245, 0.1);
}

textarea.form-control {
  height: auto;
  min-height: 80px;
}

select.form-control {
  appearance: auto;
}
</style>
