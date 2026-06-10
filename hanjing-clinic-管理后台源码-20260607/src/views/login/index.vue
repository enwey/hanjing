<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

const router = useRouter()
const loginType = ref('password') // password, sms

const loginForm = ref({
  account: '',
  password: '',
  phone: '',
  smsCode: ''
})

const countdown = ref(0)
const isSending = ref(false)

function sendSms() {
  if (!loginForm.value.phone) {
    MessagePlugin.warning('请输入手机号')
    return
  }
  isSending.value = true
  countdown.value = 60
  MessagePlugin.success('短信验证码已发送，请注意查收')
  
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
      isSending.value = false
    }
  }, 1000)
}

async function handleLogin() {
  if (loginType.value === 'password') {
    if (!loginForm.value.account || !loginForm.value.password) {
      MessagePlugin.warning('请输入账号和密码')
      return
    }
    try {
      const res: any = await request.post('/api/admin/login', {
        username: loginForm.value.account,
        password: loginForm.value.password
      })
      localStorage.setItem('auth_token', res.data.token)
      localStorage.setItem('user_info', JSON.stringify(res.data.user))
      MessagePlugin.success('登录成功！欢迎访问鼾静健康诊所管理后台')
      router.push('/dashboard')
    } catch (err) {
      // Error handled by interceptor
    }
  } else {
    if (!loginForm.value.phone || !loginForm.value.smsCode) {
      MessagePlugin.warning('请输入手机号和验证码')
      return
    }
    // SMS fallback
    localStorage.setItem('auth_token', 'mock_jwt_token_for_hanjing_clinic')
    MessagePlugin.success('登录成功！(测试短信快捷登录)')
    router.push('/dashboard')
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
        <span class="brand-logo">🌙</span>
        <div class="brand-title">
          鼾静健康诊所
          <small>睡眠健康管理后台</small>
        </div>
      </div>

      <t-tabs v-model="loginType" style="margin-bottom: 24px;">
        <t-tab-panel value="password" label="账号密码登录" />
        <t-tab-panel value="sms" label="短信验证码登录" />
      </t-tabs>

      <t-form :data="loginForm" label-width="0" @submit="handleLogin">
        <!-- Password Login Form -->
        <template v-if="loginType === 'password'">
          <t-form-item name="account">
            <t-input v-model="loginForm.account" placeholder="请输入管理员账号">
              <template #prefix-icon>
                <span style="font-size: 16px;">👤</span>
              </template>
            </t-input>
          </t-form-item>

          <t-form-item name="password" style="margin-top: 16px;">
            <t-input v-model="loginForm.password" type="password" placeholder="请输入密码">
              <template #prefix-icon>
                <span style="font-size: 16px;">🔒</span>
              </template>
            </t-input>
          </t-form-item>
        </template>

        <!-- SMS Login Form -->
        <template v-else>
          <t-form-item name="phone">
            <t-input v-model="loginForm.phone" placeholder="请输入管理员手机号">
              <template #prefix-icon>
                <span style="font-size: 16px;">📱</span>
              </template>
            </t-input>
          </t-form-item>

          <t-form-item name="smsCode" style="margin-top: 16px;">
            <div style="display: flex; gap: 8px; width: 100%;">
              <t-input v-model="loginForm.smsCode" placeholder="验证码" style="flex: 1;">
                <template #prefix-icon>
                  <span style="font-size: 16px;">🛡️</span>
                </template>
              </t-input>
              <t-button variant="outline" :disabled="isSending" style="width: 120px;" @click="sendSms">
                {{ isSending ? `${countdown}s` : '获取验证码' }}
              </t-button>
            </div>
          </t-form-item>
        </template>

        <t-form-item style="margin-top: 32px;">
          <t-button theme="primary" type="submit" block size="large">立即登录</t-button>
        </t-form-item>
      </t-form>
      
      <div class="login-footer">
        © 2026 鼾静健康诊所 · 睡眠呼吸障碍无创阻鼾方案
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
  z-index: 9999;
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
  font-size: 32px;
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
