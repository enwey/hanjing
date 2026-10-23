<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()
const isSubmitting = ref(false)
const loginForm = ref({ account: '', password: '' })
const rules = {
  account: [{ required: true, message: '请输入管理员账号', type: 'error', trigger: 'submit' }],
  password: [{ required: true, message: '请输入密码', type: 'error', trigger: 'submit' }]
}
async function handleLogin({ validateResult }: any) {
  if (validateResult !== true || isSubmitting.value) return
  isSubmitting.value = true
  try {
    const res: any = await request.post('/api/admin/login', {
      username: loginForm.value.account, password: loginForm.value.password
    })
    localStorage.setItem('auth_token', res.data.token)
    localStorage.setItem('user_info', JSON.stringify(res.data.user))
    MessagePlugin.success('登录成功')
    router.push('/dashboard')
  } catch {
    // The response interceptor displays authentication errors.
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="login-wrapper">
    <div class="login-background">
      <div class="glow-orb color-1"></div>
      <div class="glow-orb color-2"></div>
    </div>
    
    <div class="login-card">
      <div class="login-brand">
        <span class="brand-logo">
          <img class="brand-logo-image" src="/brand-koala.png" alt="兴康明诊所" />
        </span>
        <div class="brand-title">
          兴康明诊所
          <small>睡眠健康管理后台</small>
        </div>
      </div>

      <div style="margin-bottom: 24px; font-size: 16px; font-weight: 600; color: #1E293B; text-align: center; letter-spacing: 1px;">管理员登录</div>

      <t-form :data="loginForm" :rules="rules" label-width="0" @submit="handleLogin">
        <!-- Password Login Form -->
        <template v-if="true">
          <t-form-item name="account">
            <t-input v-model="loginForm.account" placeholder="请输入管理员账号" size="large">
              <template #prefix-icon>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #64748B;">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </template>
            </t-input>
          </t-form-item>

          <t-form-item name="password" style="margin-top: 16px;">
            <t-input v-model="loginForm.password" type="password" placeholder="请输入密码" size="large">
              <template #prefix-icon>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #64748B;">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </template>
            </t-input>
          </t-form-item>
        </template>

        <t-form-item style="margin-top: 32px;">
          <t-button theme="primary" type="submit" block size="large" :loading="isSubmitting" :disabled="isSubmitting">
            {{ isSubmitting ? '登录中…' : '立即登录' }}
          </t-button>
        </t-form-item>
      </t-form>
      
      <div class="login-footer">
        © 2026 兴康明诊所 · 睡眠呼吸障碍无创阻鼾方案
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0F172A;
  z-index: 1;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
}
.login-background {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 1;
}
.glow-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.25;
}
.glow-orb.color-1 {
  width: 500px;
  height: 500px;
  background: #3B6BF5;
  top: -100px;
  left: -100px;
}
.glow-orb.color-2 {
  width: 600px;
  height: 600px;
  background: #1A9D5C;
  bottom: -150px;
  right: -150px;
}
.login-card {
  position: relative;
  z-index: 2;
  width: 400px;
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
}
@media (max-width: 480px) {
  .login-card {
    padding: 28px 24px;
  }
}
.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}
.brand-logo {
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.brand-logo-image {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: block;
  object-fit: cover;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
}
.brand-title {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  font-size: 18px;
  font-weight: 700;
  color: #1E293B;
}
.brand-title small {
  font-size: 11px;
  color: #64748B;
  font-weight: 400;
  margin-top: 2px;
}
.login-footer {
  margin-top: 32px;
  text-align: center;
  font-size: 11px;
  color: #94A3B8;
  border-top: 1px solid #E2E8F0;
  padding-top: 16px;
}
</style>
