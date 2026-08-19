<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { clearPromoterAuth, getPromoterUser } from '@/utils/auth'

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)

const user = computed(() => {
  return getPromoterUser() || {
    name: '推广人员',
    role_name: '推广端账号'
  }
})

const menus = [
  { path: '/dashboard', label: '推广概览', icon: 'chart' },
  { path: '/promoters', label: '我的团队', icon: 'team' },
  { path: '/commissions', label: '我的佣金', icon: 'money' },
  { path: '/withdraws', label: '我的提现', icon: 'card' },
  { path: '/products', label: '推广商品', icon: 'bag' },
  { path: '/profile', label: '个人中心', icon: 'user' }
]

function navigate(path: string) {
  if (route.path !== path) {
    router.push(path)
  }
}

function logout() {
  clearPromoterAuth()
  MessagePlugin.success('已退出推广端登录')
  router.push('/login')
}
</script>

<template>
  <div class="portal-layout">
    <aside :class="['portal-sidebar', collapsed ? 'is-collapsed' : '']">
      <div class="portal-brand">
        <img class="portal-brand-logo" src="/brand-koala.png" alt="鼾静推广端" />
        <div v-if="!collapsed" class="portal-brand-text">
          <strong>鼾静推广端</strong>
          <span>推广数据工作台</span>
        </div>
      </div>

      <div class="portal-menu">
        <button
          v-for="item in menus"
          :key="item.path"
          :class="['portal-menu-item', route.path === item.path ? 'is-active' : '']"
          @click="navigate(item.path)"
        >
          <AppIcon :name="item.icon" :size="18" />
          <span v-if="!collapsed">{{ item.label }}</span>
        </button>
      </div>

      <button class="portal-collapse" @click="collapsed = !collapsed">
        <span class="portal-collapse-arrow">{{ collapsed ? '>' : '<' }}</span>
        <span v-if="!collapsed">收起菜单</span>
      </button>
    </aside>

    <div class="portal-main">
      <header class="portal-header">
        <div>
          <div class="portal-header-title">{{ route.meta.title }}</div>
          <div class="portal-header-sub">推广员独立工作台，仅展示当前推广员本人的团队、佣金、提现和商品数据</div>
        </div>
        <div class="portal-header-user">
          <div class="portal-user-meta">
            <strong>{{ user.nickname || user.name || '推广人员' }}</strong>
            <span>{{ user.role_name || '推广端账号' }}</span>
          </div>
          <button class="btn btn-outline btn-sm" @click="logout">退出登录</button>
        </div>
      </header>

      <main class="portal-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.portal-layout {
  display: flex;
  min-height: 100vh;
  background: #f6f8fb;
}

.portal-sidebar {
  width: 248px;
  background: linear-gradient(180deg, #0f172a 0%, #111c34 100%);
  color: #fff;
  padding: 24px 18px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  transition: width 0.2s ease;
}

.portal-sidebar.is-collapsed {
  width: 84px;
}

.portal-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.portal-brand-logo {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  object-fit: cover;
  box-shadow: 0 10px 24px rgba(59, 107, 245, 0.24);
}

.portal-brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.portal-brand-text strong {
  font-size: 16px;
  line-height: 1.2;
}

.portal-brand-text span {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.68);
}

.portal-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.portal-menu-item {
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  border-radius: 14px;
  height: 46px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.portal-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.portal-menu-item.is-active {
  background: linear-gradient(135deg, #3b6bf5, #2a52d4);
  color: #fff;
  box-shadow: 0 12px 24px rgba(59, 107, 245, 0.28);
}

.portal-collapse {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.86);
  cursor: pointer;
}

.portal-collapse-arrow {
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.portal-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.portal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px 18px;
}

.portal-header-title {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
}

.portal-header-sub {
  font-size: 13px;
  color: #94a3b8;
  margin-top: 4px;
}

.portal-header-user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.portal-user-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.portal-user-meta strong {
  font-size: 14px;
  color: #111827;
}

.portal-user-meta span {
  font-size: 12px;
  color: #94a3b8;
}

.portal-content {
  flex: 1;
  padding: 0 28px 28px;
}
</style>
