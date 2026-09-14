<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { clearPromoterAuth, getPromoterToken, getPromoterUser, setPromoterAuth } from '@/utils/auth'
import request from '@/utils/request'

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)
const currentUser = ref(getPromoterUser())

const user = computed(() => {
  return currentUser.value || {
    name: '推广人员',
    role_name: '推广端账号'
  }
})

const menuGroups = [
  {
    title: '推广工作台',
    items: [
      { path: '/dashboard', label: '推广概览', icon: 'chart' },
      { path: '/promoters', label: '我的团队', icon: 'team' },
      { path: '/patients', label: '我的患者', icon: 'patient' },
      { path: '/commissions', label: '我的佣金', icon: 'money' },
      { path: '/withdraws', label: '我的提现', icon: 'card' }
    ]
  }
]

const activeMenu = computed(() => {
  return menuGroups.flatMap(group => group.items).find(item => route.path === item.path || route.path.startsWith(`${item.path}/`))
})

const breadcrumbs = computed(() => [
  { label: '鼾静推广端', path: '/dashboard' },
  { label: activeMenu.value?.label || String(route.meta.title || '推广概览'), path: route.path }
])

const userInitial = computed(() => {
  const name = user.value.nickname || user.value.name || '推'
  return name.slice(0, 1)
})

const isPasswordVisible = ref(false)
const isSavingPassword = ref(false)
const isProfileVisible = ref(false)
const isLoadingProfile = ref(false)
const isSavingProfile = ref(false)
const passwordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const profileForm = ref({
  nickname: '',
  phone: '',
  role_name: '',
  levelLabel: '',
  inviteCode: ''
})

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

function showChangePasswordDialog() {
  passwordForm.value = {
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  }
  isPasswordVisible.value = true
}

async function showProfileDialog() {
  isProfileVisible.value = true
  isLoadingProfile.value = true
  try {
    const res: any = await request.get('/api/promoter/me')
    profileForm.value = {
      nickname: res.data.nickname || '',
      phone: res.data.phone || '',
      role_name: res.data.role_name || '',
      levelLabel: res.data.levelLabel || '',
      inviteCode: res.data.inviteCode || ''
    }
  } catch (_error) {
    MessagePlugin.error('加载个人资料失败')
  } finally {
    isLoadingProfile.value = false
  }
}

async function handleSaveProfile() {
  isSavingProfile.value = true
  try {
    const res: any = await request.put('/api/promoter/profile', {
      nickname: profileForm.value.nickname
    })
    const currentUser = getPromoterUser() || {}
    const nextUser = {
      ...currentUser,
      nickname: profileForm.value.nickname,
      phone: profileForm.value.phone
    }
    setPromoterAuth(getPromoterToken(), nextUser)
    currentUser.value = nextUser
    MessagePlugin.success(res.message || '资料已保存')
    isProfileVisible.value = false
  } catch (_error) {
    MessagePlugin.error('保存个人资料失败')
  } finally {
    isSavingProfile.value = false
  }
}

async function handleSavePassword() {
  if (!passwordForm.value.oldPassword) {
    MessagePlugin.warning('请输入原始密码')
    return
  }
  if (!passwordForm.value.newPassword) {
    MessagePlugin.warning('请输入新密码')
    return
  }
  if (passwordForm.value.newPassword.length < 6) {
    MessagePlugin.warning('新密码长度不能少于 6 位')
    return
  }
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    MessagePlugin.warning('两次输入的新密码不一致')
    return
  }

  isSavingPassword.value = true
  try {
    const res: any = await request.put('/api/promoter/password', {
      oldPassword: passwordForm.value.oldPassword,
      newPassword: passwordForm.value.newPassword,
      confirmPassword: passwordForm.value.confirmPassword
    })
    MessagePlugin.success(res.message || '修改密码成功，请重新登录')
    isPasswordVisible.value = false
    setTimeout(() => {
      logout()
    }, 800)
  } catch (error: any) {
    MessagePlugin.error(error.response?.data?.message || '原始密码不正确或修改密码失败')
  } finally {
    isSavingPassword.value = false
  }
}
</script>

<template>
  <div class="portal-layout">
    <button
      class="sidebar-toggle-btn"
      type="button"
      :style="{ left: collapsed ? '52px' : '180px' }"
      title="隐藏/展开菜单栏"
      @click="collapsed = !collapsed"
    >
      <svg v-if="!collapsed" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
      <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </button>

    <aside :class="['portal-sidebar', collapsed ? 'is-collapsed' : '']">
      <div class="portal-brand">
        <div class="portal-brand-logo">
          <img class="portal-brand-logo-image" src="/brand-koala.png" alt="鼾静推广端" />
        </div>
        <div class="portal-brand-text" :class="{ 'is-hidden': collapsed }">
          鼾静推广
          <small>推广端 v1.0</small>
        </div>
      </div>

      <div class="portal-menu">
        <div v-for="group in menuGroups" :key="group.title" class="portal-menu-group">
          <div v-if="!collapsed" class="portal-menu-group-title">{{ group.title }}</div>
          <button
            v-for="item in group.items"
            :key="item.path"
            :class="['portal-menu-item', route.path === item.path ? 'is-active' : '']"
            :title="collapsed ? item.label : ''"
            @click="navigate(item.path)"
          >
            <span class="nav-icon">
              <AppIcon :name="item.icon" :size="16" />
            </span>
            <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
          </button>
        </div>
      </div>
    </aside>

    <div class="portal-main">
      <header class="portal-header">
        <div class="topbar-breadcrumb">
          <template v-for="(item, index) in breadcrumbs" :key="`${item.path}-${index}`">
            <span
              v-if="index < breadcrumbs.length - 1"
              class="breadcrumb-link"
              @click="navigate(item.path)"
            >
              {{ item.label }}
            </span>
            <span v-else class="current">{{ item.label }}</span>
            <span v-if="index < breadcrumbs.length - 1" class="sep">/</span>
          </template>
        </div>

        <div class="topbar-right">
          <t-popup trigger="click" placement="bottom-right" overlay-class-name="user-popup-overlay">
            <div class="topbar-user">
              <div class="topbar-avatar">{{ userInitial }}</div>
              <div class="topbar-user-info">
                <div class="topbar-user-name">
                  <span>{{ user.nickname || user.name || '推广人员' }}</span>
                  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="topbar-user-arrow">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                <div class="topbar-user-role">{{ user.role_name || '推广端账号' }}</div>
              </div>
            </div>
            <template #content>
              <div class="user-dropdown-menu">
                <div class="user-dropdown-header">
                  <div class="header-avatar">{{ userInitial }}</div>
                  <div class="header-info">
                    <div class="header-name">{{ user.nickname || user.name || '推广人员' }}</div>
                    <div class="header-role-badge">{{ user.role_name || '推广端账号' }}</div>
                  </div>
                </div>
                <div class="user-menu-divider"></div>
                <div class="user-menu-item" @click="showProfileDialog">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="menu-icon">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <span>个人资料</span>
                </div>
                <div class="user-menu-item" @click="showChangePasswordDialog">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="menu-icon">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <span>修改密码</span>
                </div>
                <div class="user-menu-divider"></div>
                <div class="user-menu-item logout" @click="logout">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="menu-icon">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                  <span>退出登录</span>
                </div>
              </div>
            </template>
          </t-popup>
        </div>
      </header>

      <main class="portal-content">
        <router-view />
      </main>
    </div>

    <t-dialog
      v-model:visible="isProfileVisible"
      header="个人资料"
      width="560px"
      confirm-btn="保存资料"
      cancel-btn="取消"
      :confirm-loading="isSavingProfile"
      @confirm="handleSaveProfile"
      @cancel="isProfileVisible = false"
    >
      <div v-if="isLoadingProfile" class="profile-dialog-empty">正在加载资料...</div>
      <div v-else class="profile-dialog-form">
        <div class="dialog-field">
          <span>昵称</span>
          <t-input v-model="profileForm.nickname" placeholder="请输入昵称" clearable />
        </div>
        <div class="dialog-field">
          <span>手机号</span>
          <t-input :value="profileForm.phone" readonly />
        </div>
        <div class="dialog-field">
          <span>角色</span>
          <t-input :value="profileForm.role_name" readonly />
        </div>
        <div class="dialog-field">
          <span>推广等级</span>
          <t-input :value="profileForm.levelLabel" readonly />
        </div>
        <div class="dialog-field">
          <span>邀请码</span>
          <t-input :value="profileForm.inviteCode" readonly />
        </div>
      </div>
    </t-dialog>

    <t-dialog
      v-model:visible="isPasswordVisible"
      header="修改密码"
      width="450px"
      confirm-btn="确认修改"
      cancel-btn="取消"
      :confirm-loading="isSavingPassword"
      @confirm="handleSavePassword"
      @cancel="isPasswordVisible = false"
    >
      <div class="password-dialog-form">
        <div class="dialog-field">
          <span>原始密码</span>
          <t-input v-model="passwordForm.oldPassword" type="password" placeholder="请输入原始密码" clearable />
        </div>
        <div class="dialog-field">
          <span>新密码</span>
          <t-input v-model="passwordForm.newPassword" type="password" placeholder="请输入新密码 (不少于6位)" clearable />
        </div>
        <div class="dialog-field">
          <span>确认新密码</span>
          <t-input v-model="passwordForm.confirmPassword" type="password" placeholder="请再次输入新密码进行确认" clearable />
        </div>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
.portal-layout {
  position: relative;
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #f9fafb;
}

.portal-sidebar {
  width: 192px;
  height: 100vh;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #0f172a;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  transition: width 0.2s ease-in-out;
  overflow: hidden;
}

.portal-sidebar.is-collapsed {
  width: 64px;
}

.portal-brand {
  height: 64px;
  min-height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid #1e293b;
  box-sizing: border-box;
}

.portal-sidebar.is-collapsed .portal-brand {
  justify-content: center;
  padding: 0;
  gap: 0;
}

.portal-brand-logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #3b6bf5;
  overflow: hidden;
}

.portal-brand-logo-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.portal-brand-text {
  max-width: 120px;
  overflow: hidden;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  transition: opacity 0.2s ease-in-out, max-width 0.2s ease-in-out;
}

.portal-brand-text.is-hidden {
  max-width: 0;
  opacity: 0;
}

.portal-brand-text small {
  display: block;
  margin-top: 2px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 400;
}

.portal-menu {
  flex: 1;
  padding: 8px 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.portal-menu::-webkit-scrollbar {
  width: 4px;
}

.portal-menu::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.portal-menu-group-title {
  padding: 16px 24px 8px;
  color: rgba(148, 163, 184, 0.5);
  font-size: 10px;
  letter-spacing: 1px;
  line-height: 1;
}

.portal-menu-item {
  position: relative;
  width: calc(100% - 24px);
  height: 40px;
  margin: 4px 12px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  cursor: pointer;
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.portal-menu-item:hover {
  background: #1e293b;
  color: #e2e8f0;
  transform: translateX(4px);
}

.portal-menu-item.is-active {
  background: rgba(59, 107, 245, 0.15);
  color: #fff;
  font-weight: 600;
  transform: translateX(4px);
}

.portal-menu-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 15%;
  width: 3px;
  height: 70%;
  border-radius: 999px;
  background: #3b6bf5;
}

.portal-menu-item.is-active .nav-icon {
  color: #5a85f5;
}

.nav-icon {
  width: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  line-height: 1;
}

.portal-sidebar.is-collapsed .portal-menu-item {
  width: 40px;
  height: 40px;
  padding: 0;
  justify-content: center;
  transform: none;
}

.portal-sidebar.is-collapsed .portal-menu-item.is-active::before {
  display: none;
}

.portal-sidebar.is-collapsed .nav-icon {
  width: 100%;
  height: 100%;
  margin-right: 0;
}

.portal-main {
  flex: 1;
  min-width: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.portal-header {
  height: 64px;
  min-height: 64px;
  max-height: 64px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  box-sizing: border-box;
  z-index: 50;
}

.topbar-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #9ca3af;
  font-size: 13px;
}

.topbar-breadcrumb .breadcrumb-link {
  cursor: pointer;
  transition: color 150ms;
}

.topbar-breadcrumb .breadcrumb-link:hover {
  color: #3b6bf5;
  text-decoration: underline;
}

.topbar-breadcrumb .current {
  color: #1f2937;
  font-weight: 600;
}

.topbar-breadcrumb .sep {
  color: #d1d5db;
}

.topbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.topbar-user {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 32px;
  padding-left: 16px;
  border-left: 1px solid #e5e7eb;
  cursor: pointer;
  user-select: none;
}

.topbar-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #5a85f5, #2a52d4);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
}

.topbar-user-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.topbar-user-name {
  color: #1f2937;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  display: flex;
  align-items: center;
  gap: 4px;
}

.topbar-user-arrow {
  opacity: 0.7;
}

.topbar-user-role {
  margin-top: 1px;
  color: #9ca3af;
  font-size: 11px;
  line-height: 1.2;
}

.portal-content {
  flex: 1;
  padding: 24px 32px 48px;
  overflow: auto;
  background: #f9fafb;
}

.sidebar-toggle-btn {
  position: absolute;
  top: 20px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1000;
  color: #4b5563;
  transition: left 0.2s ease-in-out, background-color 0.15s, color 0.15s, box-shadow 0.15s;
}

.sidebar-toggle-btn:hover {
  background: #3b6bf5;
  color: #fff;
  border-color: #3b6bf5;
  box-shadow: 0 4px 12px rgba(59, 107, 245, 0.25);
}

.user-dropdown-menu {
  width: 220px;
  padding: 8px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
}

.user-dropdown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
}

.header-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5a85f5, #2a52d4);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.header-info {
  min-width: 0;
}

.header-name {
  color: #0f172a;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-role-badge {
  margin-top: 2px;
  color: #64748b;
  font-size: 12px;
}

.user-menu-divider {
  height: 1px;
  margin: 6px 4px;
  background: #f1f5f9;
}

.user-menu-item {
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: #475569;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.user-menu-item:hover {
  background: #f8fafc;
  color: #3b6bf5;
}

.user-menu-item.logout:hover {
  background: #fef2f2;
  color: #ef4444;
}

.menu-icon {
  flex-shrink: 0;
}

.password-dialog-form,
.profile-dialog-form {
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-dialog-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.profile-dialog-empty {
  padding: 36px 0;
  text-align: center;
  color: #94a3b8;
}

.dialog-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dialog-field span {
  color: #4b5563;
  font-size: 13px;
  font-weight: 500;
}
</style>
