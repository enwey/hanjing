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
        <img class="brand-logo-image" src="/brand-koala.png" alt="鼾静推广端" />
        <div class="brand-title">
          鼾静推广端
          <small>PC 端推广数据工作台</small>
        </div>
      </div>

      <div class="login-heading">
        <strong>欢迎回来</strong>
        <span>请输入推广员绑定手机号和登录密码，登录后可查看您的团队成员、推广佣金、提现记录和推广商品。</span>
      </div>

      <t-form :data="loginForm" :rules="rules" label-width="0" @submit="handleLogin">
        <t-form-item name="phone">
          <t-input v-model="loginForm.phone" placeholder="请输入绑定的手机号" size="large" />
        </t-form-item>
        <t-form-item name="password" style="margin-top: 16px;">
          <t-input v-model="loginForm.password" type="password" placeholder="请输入登录密码" size="large" />
        </t-form-item>

        <t-form-item style="margin-top: 28px;">
          <t-button theme="primary" type="submit" block size="large">登录推广端</t-button>
        </t-form-item>
      </t-form>

      <div class="login-helper">
        如未设置登录密码，请先前往小程序「我的-设置-账号安全」完成设置。
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  overflow: hidden;
}

.login-background {
  position: absolute;
  inset: 0;
}

.glow-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(120px);
  opacity: 0.22;
}

.color-1 {
  width: 520px;
  height: 520px;
  top: -80px;
  left: -80px;
  background: #3b6bf5;
}

.color-2 {
  width: 640px;
  height: 640px;
  right: -160px;
  bottom: -180px;
  background: #1a9d5c;
}

.login-card {
  position: relative;
  z-index: 1;
  width: 430px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  padding: 36px;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-logo-image {
  width: 58px;
  height: 58px;
  border-radius: 16px;
  object-fit: cover;
}

.brand-title {
  display: flex;
  flex-direction: column;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

.brand-title small {
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  margin-top: 3px;
}

.login-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 28px 0 22px;
}

.login-heading strong {
  font-size: 20px;
  color: #111827;
}

.login-heading span {
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.6;
}

.login-helper {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: #64748b;
}

</style>
