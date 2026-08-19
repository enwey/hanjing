<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { getPromoterUser, setPromoterAuth, getPromoterToken } from '@/utils/auth'

const loading = ref(false)
const saving = ref(false)
const form = ref({
  nickname: '',
  phone: '',
  role_name: '',
  levelLabel: '',
  inviteCode: ''
})

async function loadProfile() {
  loading.value = true
  try {
    const res: any = await request.get('/api/promoter/me')
    form.value = {
      nickname: res.data.nickname || '',
      phone: res.data.phone || '',
      role_name: res.data.role_name || '',
      levelLabel: res.data.levelLabel || '',
      inviteCode: res.data.inviteCode || ''
    }
  } catch (_error) {
    MessagePlugin.error('加载个人资料失败')
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  saving.value = true
  try {
    const res: any = await request.put('/api/promoter/profile', {
      nickname: form.value.nickname
    })
    const currentUser = getPromoterUser() || {}
    setPromoterAuth(getPromoterToken(), { ...currentUser, nickname: form.value.nickname, phone: form.value.phone })
    MessagePlugin.success(res.message || '资料已保存')
  } catch (_error) {
    MessagePlugin.error('保存个人资料失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadProfile)
</script>

<template>
  <section class="profile-card">
    <div class="profile-header">
      <div>
        <div class="profile-title">账号资料</div>
        <div class="profile-sub">维护当前推广员昵称，手机号作为登录账号展示，不在此处修改。</div>
      </div>
    </div>

    <div v-if="loading" class="profile-empty">正在加载资料...</div>

    <div v-else class="profile-form">
      <label class="profile-field">
        <span>昵称</span>
        <input v-model="form.nickname" />
      </label>
      <label class="profile-field is-readonly">
        <span>手机号</span>
        <input :value="form.phone" readonly />
      </label>
      <label class="profile-field is-readonly">
        <span>角色</span>
        <input :value="form.role_name" readonly />
      </label>
      <label class="profile-field is-readonly">
        <span>推广等级</span>
        <input :value="form.levelLabel" readonly />
      </label>
      <label class="profile-field is-readonly">
        <span>邀请码</span>
        <input :value="form.inviteCode" readonly />
      </label>
    </div>

    <div class="profile-actions">
      <button class="btn btn-primary" :disabled="saving" @click="saveProfile">
        {{ saving ? '保存中...' : '保存资料' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.profile-card {
  background: #fff;
  border-radius: 18px;
  border: 1px solid #eef2f7;
  padding: 24px;
}

.profile-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.profile-sub {
  font-size: 13px;
  color: #94a3b8;
  margin-top: 6px;
}

.profile-empty {
  color: #94a3b8;
  padding: 40px 0;
}

.profile-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 24px;
}

.profile-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-field span {
  font-size: 13px;
  color: #64748b;
}

.profile-field input {
  height: 42px;
  border-radius: 12px;
  border: 1px solid #dbe3ef;
  padding: 0 14px;
  outline: none;
}

.profile-field.is-readonly input {
  background: #f8fafc;
  color: #64748b;
}

.profile-actions {
  margin-top: 28px;
}
</style>
