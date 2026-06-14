<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'

const router = useRouter()
const route = useRoute()
const isSidebarCollapsed = ref(false)

const isMenuCollapsed = computed(() => isSidebarCollapsed.value)

const menuGroups = [
  {
    title: '概览',
    items: [
      { path: '/dashboard', label: '数据看板', icon: '📊' }
    ]
  },
  {
    title: '业务管理',
    items: [
      { path: '/appointment', label: '预约管理', icon: '📅', badge: '12', badgeColor: 'red' },
      { path: '/queue', label: '排队分诊', icon: '📣' },
      { path: '/patient', label: '患者管理', icon: '🧑‍⚕️' },
      { path: '/doctor', label: '医生管理', icon: '👨‍⚕️' },
      { path: '/store', label: '门店管理', icon: '🏥' },
      { path: '/order', label: '订单管理', icon: '📦' }
    ]
  },
  {
    title: '分销管理',
    items: [
      { path: '/distribution', label: '分销总览', icon: '💰' },
      { path: '/promoter', label: '推广员管理', icon: '👥' },
      { path: '/withdraw', label: '提现审核', icon: '💳', badge: '5', badgeColor: 'gold' },
      { path: '/products', label: '推广商品', icon: '🛍️' }
    ]
  },
  {
    title: '内容',
    items: [
      { path: '/content', label: '科普文章', icon: '📝' },
      { path: '/banner', label: '轮播图管理', icon: '🎨' }
    ]
  },
  {
    title: '系统',
    items: [
      { path: '/settings', label: '系统设置', icon: '⚙️' },
      { path: '/permission', label: '权限管理', icon: '🔐' },
      { path: '/log', label: '操作日志', icon: '📋' }
    ]
  }
]

const currentActiveMenu = computed(() => {
  const path = route.path
  
  // Create a helper to check if a path is in the menu groups
  const isInMenu = (targetPath: string) => {
    for (const group of menuGroups) {
      for (const item of group.items) {
        if (targetPath === item.path) {
          return true
        }
      }
    }
    return false
  }

  // 1. Check if the current path is in the menu
  if (isInMenu(path)) {
    return path
  }

  // Helper to substitute :params in parent path pattern
  const resolvePath = (pathPattern: string, params: Record<string, any>) => {
    let resolved = pathPattern
    for (const [key, value] of Object.entries(params)) {
      resolved = resolved.replace(`:${key}`, String(value))
    }
    return resolved
  }

  const routes = router.getRoutes()
  const findRouteByPath = (targetPath: string) => {
    let matched = routes.find(r => r.path === targetPath)
    if (matched) return matched
    try {
      const resolved = router.resolve(targetPath)
      if (resolved && resolved.matched.length > 0) {
        return resolved.matched[resolved.matched.length - 1]
      }
    } catch (e) {}
    for (const r of routes) {
      const regexPattern = '^' + r.path.replace(/\/:[^/]+/g, '/[^/]+') + '$'
      if (new RegExp(regexPattern).test(targetPath)) {
        return r
      }
    }
    return null
  }

  // 2. Traverse up parentPath from route meta
  let tempPath = path
  let currentRecord = routes.find(r => r.name === route.name) || findRouteByPath(tempPath)
  let depth = 0
  const maxDepth = 10

  while (tempPath && tempPath !== '/' && depth < maxDepth) {
    depth++
    const parentPathPattern = currentRecord?.meta?.parentPath as string
    if (parentPathPattern) {
      const nextPath = resolvePath(parentPathPattern, route.params)
      if (nextPath && nextPath !== tempPath) {
        if (isInMenu(nextPath)) {
          return nextPath
        }
        tempPath = nextPath
        currentRecord = findRouteByPath(tempPath)
      } else {
        break
      }
    } else {
      break
    }
  }

  // 3. Fallback: prefix match
  let bestMatch = ''
  for (const group of menuGroups) {
    for (const item of group.items) {
      if (path.startsWith(item.path)) {
        if (item.path.length > bestMatch.length) {
          bestMatch = item.path
        }
      }
    }
  }

  return bestMatch || path
})


const breadcrumbs = computed(() => {
  const currentPath = route.path
  
  if (route.name === 'login') return []
  
  const items: Array<{ label: string; path: string }> = []
  const routes = router.getRoutes()
  
  // Helper to substitute :params in parent path pattern
  const resolvePath = (pathPattern: string, params: Record<string, any>) => {
    let resolved = pathPattern
    for (const [key, value] of Object.entries(params)) {
      resolved = resolved.replace(`:${key}`, String(value))
    }
    return resolved
  }
  
  // Helper to find route definition matching the path
  const findRouteByPath = (targetPath: string) => {
    // 1. Exact path match
    let matched = routes.find(r => r.path === targetPath)
    if (matched) return matched
    
    // 2. Router resolve match
    try {
      const resolved = router.resolve(targetPath)
      if (resolved && resolved.matched.length > 0) {
        return resolved.matched[resolved.matched.length - 1]
      }
    } catch (e) {
      // ignore
    }
    
    // 3. Fallback parameter pattern matching
    for (const r of routes) {
      const regexPattern = '^' + r.path.replace(/\/:[^/]+/g, '/[^/]+') + '$'
      if (new RegExp(regexPattern).test(targetPath)) {
        return r
      }
    }
    
    return null
  }
  
  let tempPath = currentPath
  let currentRecord = routes.find(r => r.name === route.name) || findRouteByPath(tempPath)
  
  let depth = 0
  const maxDepth = 10
  
  while (tempPath && tempPath !== '/' && depth < maxDepth) {
    depth++
    
    const title = (currentRecord?.meta?.title as string) || ''
    if (title && title !== '登录') {
      items.unshift({
        label: title,
        path: tempPath
      })
    }
    
    const parentPathPattern = currentRecord?.meta?.parentPath as string
    if (parentPathPattern) {
      const nextPath = resolvePath(parentPathPattern, route.params)
      if (nextPath && nextPath !== tempPath) {
        tempPath = nextPath
        currentRecord = findRouteByPath(tempPath)
      } else {
        break
      }
    } else {
      break
    }
  }
  
  // Prepend Home link
  items.unshift({ label: '首页', path: '/dashboard' })
  
  // De-duplicate by path keys
  const uniqueItems: typeof items = []
  const seenPaths = new Set()
  for (const item of items) {
    if (!seenPaths.has(item.path)) {
      seenPaths.add(item.path)
      uniqueItems.push(item)
    }
  }
  
  return uniqueItems
})

function navigate(path: string) {
  router.push(path)
}

function logout() {
  localStorage.removeItem('auth_token')
  MessagePlugin.success('已成功安全退出登录')
  router.push('/login')
}
</script>

<template>
  <t-layout class="app-layout">
    <!-- Floating toggle button placed exactly between left sidebar and right content area -->
    <div 
      v-if="route.name !== 'login'"
      class="sidebar-toggle-btn"
      @click="isSidebarCollapsed = !isSidebarCollapsed"
      :style="{ left: isMenuCollapsed ? '52px' : '180px' }"
      title="隐藏/展开菜单栏"
    >
      <svg v-if="!isSidebarCollapsed" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
      <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </div>

    <!-- Mockup Dark Sidebar (Using t-aside to force row direction in TDesign Layout) -->
    <t-aside 
      v-if="route.name !== 'login'"
      :width="isMenuCollapsed ? '64px' : '192px'" 
      class="app-sidebar" 
      :class="{ collapsed: isMenuCollapsed }"
    >
      <t-menu
        theme="dark"
        :value="currentActiveMenu"
        :collapsed="isMenuCollapsed"
        style="width: 100%; height: 100%; display: flex; flex-direction: column; background: #0F172A;"
      >
        <template #logo>
          <div class="sidebar-logo">
            <div class="sidebar-logo-icon">💤</div>
            <div class="sidebar-logo-text" :class="{ 'logo-hidden': isMenuCollapsed }">
              鼾静健康
              <small>管理后台 v1.0</small>
            </div>
          </div>
        </template>

        <t-menu-group v-for="group in menuGroups" :key="group.title" :title="group.title">
          <t-menu-item 
            v-for="item in group.items" 
            :key="item.path" 
            :value="item.path"
            @click="navigate(item.path)"
          >
            <template #icon>
              <t-tooltip :content="item.label" placement="right" :disabled="!isMenuCollapsed">
                <span class="nav-icon" style="display: inline-flex; align-items: center; justify-content: center;">
                  <!-- 数据看板 📊 -->
                  <svg v-if="item.icon === '📊'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                  <!-- 预约管理 📅 -->
                  <svg v-else-if="item.icon === '📅'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <!-- 患者管理 🧑‍⚕️ -->
                  <svg v-else-if="item.icon === '🧑‍⚕️'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <!-- 医生管理 👨‍⚕️ -->
                  <svg v-else-if="item.icon === '👨‍⚕️'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                  </svg>
                  <!-- 门店管理 🏥 -->
                  <svg v-else-if="item.icon === '🏥'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                  <!-- 订单管理 📦 -->
                  <svg v-else-if="item.icon === '📦'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8"></polyline>
                    <rect x="1" y="3" width="22" height="5"></rect>
                    <line x1="10" y1="12" x2="14" y2="12"></line>
                  </svg>
                  <!-- 分销总览 💰 -->
                  <svg v-else-if="item.icon === '💰'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                  <!-- 推广员管理 👥 -->
                  <svg v-else-if="item.icon === '👥'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <!-- 提现审核 💳 -->
                  <svg v-else-if="item.icon === '💳'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                    <line x1="1" y1="10" x2="23" y2="10"></line>
                  </svg>
                  <!-- 推广商品 🛍️ -->
                  <svg v-else-if="item.icon === '🛍️'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                  </svg>
                  <!-- 科普文章 📝 -->
                  <svg v-else-if="item.icon === '📝'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <!-- 轮播图管理 🎨 -->
                  <svg v-else-if="item.icon === '🎨'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  <!-- 系统设置 ⚙️ -->
                  <svg v-else-if="item.icon === '⚙️'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  <!-- 权限管理 🔐 -->
                  <svg v-else-if="item.icon === '🔐'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <!-- 操作日志 📋 -->
                  <svg v-else-if="item.icon === '📋'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                  </svg>
                  <!-- Fallback -->
                  <span v-else>{{ item.icon }}</span>
                </span>
              </t-tooltip>
            </template>
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
              <span>{{ item.label }}</span>
              <span v-if="item.badge && !isMenuCollapsed" class="nav-badge" :class="item.badgeColor">{{ item.badge }}</span>
            </div>
          </t-menu-item>
        </t-menu-group>

      </t-menu>
    </t-aside>

    <!-- Main Content -->
    <t-layout style="flex: 1; height: 100vh; display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
      <t-header v-if="route.name !== 'login'" class="topbar">
        <div class="topbar-breadcrumb">
          <template v-for="(item, index) in breadcrumbs" :key="index">
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
          <div class="topbar-search">🔍 搜索预约/患者/订单...</div>
          <button class="topbar-icon-btn">
            🔔<span class="dot"></span>
          </button>
          <button class="topbar-icon-btn" style="margin-right: 4px;">💬</button>
          
          <div class="topbar-user">
            <div class="topbar-avatar">管</div>
            <div class="topbar-user-info">
              <div class="topbar-user-name">管理员</div>
              <div class="topbar-user-role">超级管理员</div>
            </div>
            <span class="topbar-logout-btn" title="安全退出" @click="logout">⏻</span>
          </div>
        </div>
      </t-header>
      <t-content :class="{ 'app-content': route.name !== 'login' }">
        <router-view v-slot="{ Component }">
          <transition name="fade-transform" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </transition>
        </router-view>
      </t-content>
    </t-layout>
  </t-layout>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif; background: #F9FAFB; }
.app-layout { height: 100vh; width: 100vw; display: flex; flex-direction: row !important; position: relative; overflow: hidden; }

/* === Sidebar CSS Styles === */
.app-sidebar {
  width: 192px;
  background: #0F172A;
  display: flex;
  flex-direction: column;
  height: 100vh;
  flex-shrink: 0;
  border-right: 1px solid rgba(255,255,255,0.06);
  transition: width 0.2s ease-in-out !important;
}
.app-sidebar.collapsed {
  width: 64px !important;
}

/* Customize TDesign Menu dark theme to match our aesthetic */
.app-sidebar .t-menu {
  background-color: #0F172A !important;
  font-family: inherit;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: none !important;
}

/* Ensure t-menu__content stretches to occupy full width so badge aligns to the right */
.app-sidebar:not(.collapsed) .t-menu__content {
  flex: 1 !important;
  display: flex !important;
  align-items: center !important;
  width: 100% !important;
  overflow: hidden !important;
}
.app-sidebar.collapsed .t-menu__content {
  display: none !important;
}

/* Hide TDesign's default active indicator bar */
.app-sidebar .t-menu__item.t-is-active::after {
  display: none !important;
}

/* Scrollbar styling for the sidebar menu */
.app-sidebar .t-menu::-webkit-scrollbar {
  width: 4px;
}
.app-sidebar .t-menu::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}
.app-sidebar .t-menu::-webkit-scrollbar-track {
  background: transparent;
}

.app-sidebar:not(.collapsed) .t-menu-group__title {
  font-size: 10px !important;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(148,163,184,0.5) !important;
  padding: 16px 24px 8px !important;
  line-height: 1 !important;
}
.app-sidebar.collapsed .t-menu-group__title {
  display: none !important;
}

/* Universal menu item styles */
.app-sidebar .t-menu__item {
  height: 40px !important;
  line-height: 40px !important;
  border-radius: 8px !important;
  color: #94A3B8 !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  position: relative;
  overflow: hidden;
}
.app-sidebar:not(.collapsed) .t-menu__item:hover {
  background-color: #1E293B !important;
  color: #e2e8f0 !important;
  transform: translateX(4px);
}
.app-sidebar:not(.collapsed) .t-menu__item.t-is-active {
  background-color: rgba(59,107,245,0.15) !important;
  color: #fff !important;
  font-weight: 600 !important;
  transform: translateX(4px);
}
.app-sidebar.collapsed .t-menu__item:hover,
.app-sidebar.collapsed .t-menu__item.t-is-active {
  background-color: #1E293B !important;
  color: #fff !important;
}
.app-sidebar .t-menu__item.t-is-active .nav-icon {
  color: #5A85F5 !important;
}
.app-sidebar:not(.collapsed) .t-menu__item.t-is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 15%;
  height: 70%;
  width: 3px;
  background-color: #3B6BF5;
  border-radius: 9999px;
}

/* Fade Transform Routing Transition */
.fade-transform-enter-active,
.fade-transform-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-transform-enter-from {
  opacity: 0;
  transform: translateX(-15px);
}
.fade-transform-leave-to {
  opacity: 0;
  transform: translateX(15px);
}

/* Expanded state item size and spacing */
.app-sidebar:not(.collapsed) .t-menu__item {
  margin: 4px 12px !important;
  width: calc(100% - 24px) !important;
  padding: 0 12px !important;
}

/* Collapsed state item size and spacing */
.app-sidebar.collapsed .t-menu__item {
  width: 40px !important;
  height: 40px !important;
  margin: 4px 12px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.app-sidebar.collapsed .t-menu,
.app-sidebar.collapsed .t-menu-group,
.app-sidebar.collapsed .t-default-menu__inner,
.app-sidebar.collapsed .t-menu-group__list {
  padding: 0 !important;
  margin: 0 !important;
}

/* Align icons */
.app-sidebar .nav-icon {
  font-size: 16px !important;
  width: 20px !important;
  text-align: center !important;
  display: inline-block !important;
  flex-shrink: 0 !important;
  line-height: 1 !important;
}
.app-sidebar:not(.collapsed) .nav-icon {
  margin-right: 16px !important; /* 增加图标与文字的间距 */
}
.app-sidebar.collapsed .nav-icon {
  margin-right: 0 !important;
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

/* Sidebar Logo */
.sidebar-logo {
  height: 100% !important;
  margin-left: 0 !important; /* 强制覆盖 TDesign 对 logo 子元素的 margin-left */
  padding: 0 24px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important; /* align left */
  gap: 12px !important;
  flex-shrink: 0 !important;
  width: 100%;
  box-sizing: border-box !important;
}
.app-sidebar.collapsed .sidebar-logo {
  justify-content: center !important;
  padding: 0 !important;
  margin-left: 0 !important; /* 强制覆盖折叠状态下 TDesign 的 margin-left */
  gap: 0 !important;
}
.sidebar-logo-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: #3B6BF5;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; color: #fff;
  flex-shrink: 0;
}
.sidebar-logo-text {
  color: #fff; font-size: 16px; font-weight: 700; line-height: 1.2;
  transition: opacity 0.2s ease-in-out, max-width 0.2s ease-in-out;
  max-width: 150px;
  opacity: 1;
  overflow: hidden;
  white-space: nowrap;
}
.sidebar-logo-text.logo-hidden {
  max-width: 0;
  opacity: 0;
  display: none !important;
}
.sidebar-logo-text small { font-size: 11px; color: #94A3B8; font-weight: 400; display: block; margin-top: 2px; }

/* Badges styling from UI spec */
.nav-badge {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 9999px;
  font-weight: 600;
  line-height: 1;
}
.nav-badge.red { background: #EF4444; color: #fff; }
.nav-badge.blue { background: #3B6BF5; color: #fff; }
.nav-badge.gold { background: #F5A623; color: #fff; }

/* === Topbar User Info === */
.topbar-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-left: 16px;
  border-left: 1px solid #E5E7EB; /* vertical divider line */
  height: 32px;
}
.topbar-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5A85F5, #2A52D4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #fff;
  font-weight: 600;
  flex-shrink: 0;
}
.topbar-user-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.topbar-user-name {
  color: #1F2937;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
}
.topbar-user-role {
  color: #9CA3AF;
  font-size: 11px;
  line-height: 1.2;
  margin-top: 1px;
}
.topbar-logout-btn {
  color: #9CA3AF;
  font-size: 16px;
  cursor: pointer;
  margin-left: 8px;
  transition: all 0.15s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
}
.topbar-logout-btn:hover {
  color: #EF4444;
  background: #FEF2F2;
}

.app-sidebar .t-menu__logo {
  border-bottom: 1px solid #1E293B !important; /* 使用 Slate-800 边框提供清晰的视觉分割线 */
  height: 64px !important;
  min-height: 64px !important;
  max-height: 64px !important;
  padding: 0 !important;
  margin: 0 !important; /* 消除默认外边距 */
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
}
.app-sidebar:not(.collapsed) .t-menu__logo {
  justify-content: flex-start !important;
}
.app-sidebar .t-menu__operations {
  display: none !important; /* hide empty operations container */
}

/* === Topbar === */
.topbar {
  height: 64px !important;
  min-height: 64px !important;
  max-height: 64px !important;
  background: #fff !important;
  border-bottom: 1px solid #E5E7EB !important;
  display: flex !important;
  align-items: center !important;
  padding: 0 32px !important;
  position: sticky !important;
  top: 0 !important;
  z-index: 50 !important;
  line-height: normal !important;
  flex-shrink: 0 !important;
  box-sizing: border-box !important;
}
.topbar-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #9CA3AF;
}
.topbar-breadcrumb .breadcrumb-link {
  cursor: pointer;
  transition: color 150ms;
}
.topbar-breadcrumb .breadcrumb-link:hover {
  color: #3B6BF5;
  text-decoration: underline;
}
.topbar-breadcrumb .current {
  color: #1F2937;
  font-weight: 600;
}
.topbar-breadcrumb .sep {
  color: #D1D5DB;
}
.topbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
}
.topbar-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #F9FAFB;
  border: 1px solid #E5E7EB;
  border-radius: 9999px;
  font-size: 13px;
  color: #9CA3AF;
  width: 220px;
  cursor: text;
}
.topbar-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F9FAFB;
  font-size: 16px;
  cursor: pointer;
  position: relative;
  border: none;
  color: #4B5563;
}
.topbar-icon-btn .dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #EF4444;
  border: 2px solid #fff;
}

.app-content {
  background: #F9FAFB;
  padding: 24px 32px 48px;
  overflow-y: auto;
  overflow-x: auto;
  flex: 1;
}

/* Floating Sidebar Toggle Button */
.sidebar-toggle-btn {
  position: absolute;
  top: 20px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid #E5E7EB;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1000;
  color: #4B5563;
  transition: left 0.2s ease-in-out, background-color 0.15s, color 0.15s, box-shadow 0.15s;
}
.sidebar-toggle-btn:hover {
  background: #3B6BF5;
  color: #ffffff;
  border-color: #3B6BF5;
  box-shadow: 0 4px 12px rgba(59, 107, 245, 0.25);
}
</style>
