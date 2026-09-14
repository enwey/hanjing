<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'
import { setPromoterAuth } from '@/utils/auth'

const router = useRouter()
const loginForm = ref({
  phone: '',
  password: ''
})

const rules = {
  phone: [
    { required: true, message: '请输入手机号', type: 'error', trigger: 'submit' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确手机号', type: 'error', trigger: 'submit' }
  ],
  password: [{ required: true, message: '请输入登录密码', type: 'error', trigger: 'submit' }]
}

async function handleLogin({ validateResult }: any) {
  if (validateResult !== true) return

  const res: any = await request.post('/api/promoter/login', {
    phone: loginForm.value.phone,
    password: loginForm.value.password
  })
  setPromoterAuth(res.data.token, res.data.user)
  MessagePlugin.success('登录成功')
  router.push('/dashboard')
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
          <img class="brand-logo-image" src="/brand-koala.png" alt="鼾静推广端" />
        </span>
        <div class="brand-title">
          鼾静推广端
          <small>推广数据工作台</small>
        </div>
      </div>

      <div class="login-heading">推广员登录</div>

      <t-form :data="loginForm" :rules="rules" label-width="0" @submit="handleLogin">
        <t-form-item name="phone">
          <t-input v-model="loginForm.phone" placeholder="请输入绑定的手机号" size="large">
            <template #prefix-icon>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #64748B;">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </template>
          </t-input>
        </t-form-item>
        <t-form-item name="password" style="margin-top: 16px;">
          <t-input v-model="loginForm.password" type="password" placeholder="请输入登录密码" size="large">
            <template #prefix-icon>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: #64748B;">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </template>
          </t-input>
        </t-form-item>

        <t-form-item style="margin-top: 32px;">
          <t-button theme="primary" type="submit" block size="large">立即登录</t-button>
        </t-form-item>
      </t-form>

      <div class="login-footer">
        © 2026 鼾静健康诊所 · 推广数据工作台
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}

.glow-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.25;
}

.color-1 {
  width: 500px;
  height: 500px;
  top: -100px;
  left: -100px;
  background: #3B6BF5;
}

.color-2 {
  width: 600px;
  height: 600px;
  right: -150px;
  bottom: -150px;
  background: #1A9D5C;
}

.login-card {
  position: relative;
  z-index: 2;
  width: 400px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
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

.login-heading {
  margin-bottom: 24px;
  color: #1E293B;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  text-align: center;
}

.login-footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid #E2E8F0;
  color: #94A3B8;
  text-align: center;
  font-size: 11px;
}
</style>
