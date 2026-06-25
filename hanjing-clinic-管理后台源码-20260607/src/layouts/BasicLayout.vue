<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import request from '@/utils/request'

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
      { path: '/workbench', label: '接诊工作台', icon: '🩺' },
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

const userInfo = computed(() => {
  const userInfoRaw = localStorage.getItem('user_info')
  try {
    return userInfoRaw ? JSON.parse(userInfoRaw) : { name: '管理员', role_name: '超级管理员' }
  } catch {
    return { name: '管理员', role_name: '超级管理员' }
  }
})

const filteredMenuGroups = computed(() => {
  const userRole = userInfo.value.role_code || 'super_admin';
  if (userRole === 'super_admin') {
    return menuGroups;
  }
  
  return menuGroups.map(group => {
    const items = group.items.filter(item => {
      if (userRole === 'store_mgr') {
        return !['/permission', '/settings'].includes(item.path);
      }
      if (userRole === 'doctor') {
        return ['/dashboard', '/appointment', '/queue', '/workbench', '/patient', '/doctor'].includes(item.path);
      }
      return true;
    });
    return { ...group, items };
  }).filter(group => group.items.length > 0);
});

const currentActiveMenu = computed(() => {
  const path = route.path
  
  const isInMenu = (targetPath: string) => {
    for (const group of filteredMenuGroups.value) {
      for (const item of group.items) {
        if (targetPath === item.path) {
          return true
        }
      }
    }
    return false
  }

  if (isInMenu(path)) {
    return path
  }

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

  let bestMatch = ''
  for (const group of filteredMenuGroups.value) {
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
  
  const resolvePath = (pathPattern: string, params: Record<string, any>) => {
    let resolved = pathPattern
    for (const [key, value] of Object.entries(params)) {
      resolved = resolved.replace(`:${key}`, String(value))
    }
    return resolved
  }
  
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
  
  items.unshift({ label: '首页', path: '/dashboard' })
  
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

const isLogoutConfirmVisible = ref(false)

function logout() {
  isLogoutConfirmVisible.value = true
}

function handleConfirmLogout() {
  isLogoutConfirmVisible.value = false
  localStorage.removeItem('auth_token')
  localStorage.removeItem('user_info')
  MessagePlugin.success('已成功安全退出登录')
  router.push('/login')
}

// ==========================================
// 🔍 全局搜索功能逻辑
// ==========================================
const isSearchVisible = ref(false)
const searchKeyword = ref('')
const searchResults = ref({ patients: [], appointments: [], orders: [] })
const isSearching = ref(false)
const activeSearchTab = ref('all')

// 计算当前 Tab 下是否有搜索结果
const hasSearchResults = computed(() => {
  if (activeSearchTab.value === 'all') {
    return searchResults.value.patients.length > 0 || searchResults.value.appointments.length > 0 || searchResults.value.orders.length > 0
  }
  if (activeSearchTab.value === 'patient') return searchResults.value.patients.length > 0
  if (activeSearchTab.value === 'appointment') return searchResults.value.appointments.length > 0
  if (activeSearchTab.value === 'order') return searchResults.value.orders.length > 0
  return false
})

let searchTimeout: any = null
watch(searchKeyword, (newVal) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  if (!newVal.trim()) {
    searchResults.value = { patients: [], appointments: [], orders: [] }
    return
  }
  searchTimeout = setTimeout(() => {
    handleSearch()
  }, 300)
})

// 监听弹窗打开状态，关闭时重置搜索
watch(isSearchVisible, (isOpen) => {
  if (!isOpen) {
    searchKeyword.value = ''
    searchResults.value = { patients: [], appointments: [], orders: [] }
    activeSearchTab.value = 'all'
  }
})

async function handleSearch() {
  if (!searchKeyword.value.trim()) return
  isSearching.value = true
  try {
    const res = await request.get(`/api/admin/global-search?q=${encodeURIComponent(searchKeyword.value)}`)
    if (res && res.code === 200) {
      searchResults.value = res.data
    }
  } catch (error) {
    console.error('Search error:', error)
  } finally {
    isSearching.value = false
  }
}

function selectSearchResult(type: string, id: any) {
  isSearchVisible.value = false
  if (type === 'patient') {
    router.push(`/patient/detail/${id}`)
  } else if (type === 'appointment') {
    router.push(`/appointment/detail/${id}`)
  } else if (type === 'order') {
    router.push(`/order/detail/${id}`)
  }
}

// ==========================================
// 🔔 消息通知功能逻辑
// ==========================================
const isNotifVisible = ref(false)
const notifStats = ref({ withdrawCount: 0, appointmentCount: 0, orderCount: 0 })
const totalNotifCount = computed(() => notifStats.value.withdrawCount + notifStats.value.appointmentCount + notifStats.value.orderCount)

async function fetchNotifStats() {
  try {
    const res = await request.get('/api/admin/notifications/stats')
    if (res && res.code === 200) {
      notifStats.value = res.data
    }
  } catch (error) {
    console.error('Fetch notification stats error:', error)
  }
}

function handleNotifClick(type: string) {
  isNotifVisible.value = false
  if (type === 'withdraw') {
    router.push('/withdraw')
  } else if (type === 'appointment') {
    router.push('/appointment')
  } else if (type === 'order') {
    router.push('/order')
  }
}

// ==========================================
// 💬 私信与 IM 沟通逻辑
// ==========================================
const isChatVisible = ref(false)
const chatUsers = ref<any[]>([])
const selectedUserId = ref<number | null>(null)
const chatMessages = ref<any[]>([])
const chatInputText = ref('')
const isSendingMsg = ref(false)
const chatMessagesContainer = ref<HTMLElement | null>(null)
const searchUserQuery = ref('')

const filteredChatUsers = computed(() => {
  if (!searchUserQuery.value.trim()) return chatUsers.value
  const q = searchUserQuery.value.trim().toLowerCase()
  return chatUsers.value.filter(u => 
    (u.name && u.name.toLowerCase().includes(q)) || 
    (u.phone && u.phone.includes(q)) ||
    (u.lastMsg && u.lastMsg.toLowerCase().includes(q))
  )
})

function useQuickReply(text: string) {
  chatInputText.value = text
}

async function fetchChatUsers() {
  try {
    const res = await request.get('/api/admin/im/users')
    if (res && res.code === 200) {
      chatUsers.value = res.data
    }
  } catch (error) {
    console.error('Fetch chat users error:', error)
  }
}

async function selectChatUser(userId: number) {
  selectedUserId.value = userId
  await fetchChatMessages()
  // 标记该用户本地已读
  const user = chatUsers.value.find(u => u.id === userId)
  if (user) user.unread = 0
}

async function fetchChatMessages() {
  if (!selectedUserId.value) return
  try {
    const res = await request.get(`/api/admin/im/messages?patient_id=${selectedUserId.value}`)
    if (res && res.code === 200) {
      chatMessages.value = res.data
      scrollToBottom()
    }
  } catch (error) {
    console.error('Fetch chat messages error:', error)
  }
}

async function sendChatMessage() {
  if (!selectedUserId.value || !chatInputText.value.trim()) return
  const text = chatInputText.value.trim()
  chatInputText.value = ''
  isSendingMsg.value = true
  
  // 先把自己的消息推上去
  chatMessages.value.push({
    sender: 'doctor',
    text: text,
    time: '刚刚'
  })
  scrollToBottom()

  try {
    const res = await request.post('/api/admin/im/send', {
      patient_id: selectedUserId.value,
      text: text
    })
    if (res && res.code === 200) {
      // 成功后，等待几秒轮询或者检查回复
      setTimeout(async () => {
        await fetchChatMessages()
        await fetchChatUsers() // 刷新左侧会话列表
      }, 1500)
    }
  } catch (error) {
    console.error('Send message error:', error)
  } finally {
    isSendingMsg.value = false
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (chatMessagesContainer.value) {
      chatMessagesContainer.value.scrollTop = chatMessagesContainer.value.scrollHeight
    }
  })
}

// 开启 IM 轮询
let chatInterval: any = null
watch(isChatVisible, (isOpen) => {
  if (isOpen) {
    fetchChatUsers()
    chatInterval = setInterval(() => {
      fetchChatUsers()
      if (selectedUserId.value) {
        fetchChatMessages()
      }
    }, 4000)
  } else {
    if (chatInterval) clearInterval(chatInterval)
    selectedUserId.value = null
    chatMessages.value = []
  }
})

// ==========================================
// 生命周期挂载
// ==========================================
let notifInterval: any = null
onMounted(() => {
  fetchNotifStats()
  notifInterval = setInterval(() => {
    fetchNotifStats()
  }, 20000)
})

onUnmounted(() => {
  if (notifInterval) clearInterval(notifInterval)
  if (chatInterval) clearInterval(chatInterval)
})
</script>

<template>
  <t-layout class="app-layout">
    <div 
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

    <t-aside 
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

        <t-menu-group v-for="group in filteredMenuGroups" :key="group.title" :title="group.title">
          <t-menu-item 
            v-for="item in group.items" 
            :key="item.path" 
            :value="item.path"
            @click="navigate(item.path)"
          >
            <template #icon>
              <t-tooltip :content="item.label" placement="right" :disabled="!isMenuCollapsed">
                <span class="nav-icon" style="display: inline-flex; align-items: center; justify-content: center;">
                  <svg v-if="item.icon === '📊'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                  <svg v-else-if="item.icon === '📅'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <svg v-else-if="item.icon === '📣'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                  </svg>
                  <svg v-else-if="item.icon === '🩺'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4.8 3h14.4"></path>
                    <path d="M4.8 3v4.8c0 4.8 7.2 4.8 7.2 9.6v1.8"></path>
                    <path d="M19.2 3v4.8c0 3.6-3.6 4.8-4.8 6.4"></path>
                    <circle cx="12" cy="21" r="2"></circle>
                  </svg>
                  <svg v-else-if="item.icon === '🧑‍⚕️'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <svg v-else-if="item.icon === '👨‍⚕️'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                  </svg>
                  <svg v-else-if="item.icon === '🏥'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                  <svg v-else-if="item.icon === '📦'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8"></polyline>
                    <rect x="1" y="3" width="22" height="5"></rect>
                    <line x1="10" y1="12" x2="14" y2="12"></line>
                  </svg>
                  <svg v-else-if="item.icon === '💰'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                  <svg v-else-if="item.icon === '👥'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <svg v-else-if="item.icon === '💳'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                    <line x1="1" y1="10" x2="23" y2="10"></line>
                  </svg>
                  <svg v-else-if="item.icon === '🛍️'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                  </svg>
                  <svg v-else-if="item.icon === '📝'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  <svg v-else-if="item.icon === '🎨'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  <svg v-else-if="item.icon === '⚙️'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  <svg v-else-if="item.icon === '🔐'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <svg v-else-if="item.icon === '📋'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                  </svg>
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

    <t-layout style="flex: 1; height: 100vh; display: flex; flex-direction: column; min-width: 0; overflow: hidden;">
      <t-header class="topbar">
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
          <!-- 🔍 全局搜索按钮 -->
          <div class="topbar-search" @click="isSearchVisible = true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon-svg">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span>搜索预约/患者/订单...</span>
          </div>

          <!-- 🔔 消息通知/待办 Popup -->
          <t-popup trigger="click" placement="bottom-right" v-model="isNotifVisible" overlay-class-name="notif-popup-overlay">
            <button class="topbar-icon-btn notif-btn">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="topbar-icon-svg">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              <span v-if="totalNotifCount > 0" class="dot"></span>
            </button>
            <template #content>
              <div class="notification-dropdown">
                <div class="notif-header">
                  <span>系统待办与通知</span>
                  <t-tag size="small" theme="danger" shape="round" v-if="totalNotifCount > 0">{{ totalNotifCount }}</t-tag>
                </div>
                <div class="notif-list">
                  <div class="notif-item notif-withdraw" @click="handleNotifClick('withdraw')" v-if="notifStats.withdrawCount > 0">
                    <div class="notif-icon-wrapper">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-svg-icon">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                        <line x1="1" y1="10" x2="23" y2="10"></line>
                      </svg>
                    </div>
                    <div class="notif-info">
                      <div class="notif-title">提现审批提醒</div>
                      <div class="notif-desc">有 {{ notifStats.withdrawCount }} 笔推广员提现申请等待您的审核。</div>
                    </div>
                  </div>
                  <div class="notif-item notif-appointment" @click="handleNotifClick('appointment')" v-if="notifStats.appointmentCount > 0">
                    <div class="notif-icon-wrapper">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-svg-icon">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                      </svg>
                    </div>
                    <div class="notif-info">
                      <div class="notif-title">挂号预约提醒</div>
                      <div class="notif-desc">有 {{ notifStats.appointmentCount }} 个患者挂号预约需要确认。</div>
                    </div>
                  </div>
                  <div class="notif-item notif-order" @click="handleNotifClick('order')" v-if="notifStats.orderCount > 0">
                    <div class="notif-icon-wrapper">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="notif-svg-icon">
                        <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"></line>
                        <polygon points="12 22.08 12 12 3 6.92 3 17.08 12 22.08"></polygon>
                        <polygon points="12 22.08 21 17.08 21 6.92 12 12 12 22.08"></polygon>
                        <polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12"></polygon>
                      </svg>
                    </div>
                    <div class="notif-info">
                      <div class="notif-title">订单发货提醒</div>
                      <div class="notif-desc">有 {{ notifStats.orderCount }} 笔支付成功的订单等待打单发货。</div>
                    </div>
                  </div>
                  <div class="notif-empty" v-if="totalNotifCount === 0">
                    <div class="notif-empty-icon">
                      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                      </svg>
                    </div>
                    <div class="notif-empty-text">暂无待办事项，工作井然有序</div>
                  </div>
                </div>
              </div>
            </template>
          </t-popup>

          <!-- 💬 私信与 IM 沟通按钮 -->
          <button class="topbar-icon-btn chat-btn" style="margin-right: 4px;" @click="isChatVisible = true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="topbar-icon-svg">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span v-if="chatUsers.some(u => u.unread)" class="chat-badge"></span>
          </button>
          
          <div class="topbar-user">
            <div class="topbar-avatar">{{ userInfo.name ? userInfo.name[0] : '管' }}</div>
            <div class="topbar-user-info">
              <div class="topbar-user-name">{{ userInfo.name || '管理员' }}</div>
              <div class="topbar-user-role">{{ userInfo.role_name || '超级管理员' }}</div>
            </div>
            <span class="topbar-logout-btn" title="安全退出" @click="logout">⏻</span>
          </div>
        </div>
      </t-header>
      <t-content class="app-content">
        <router-view v-slot="{ Component }">
          <transition name="fade-transform" mode="out-in">
            <component :is="Component" :key="route.fullPath" />
          </transition>
        </router-view>
      </t-content>
    </t-layout>

    <!-- ==========================================
         ⏻ 退出登录确认 Dialog
         ========================================== -->
    <t-dialog
      v-model:visible="isLogoutConfirmVisible"
      header="退出登录"
      theme="warning"
      confirm-btn="确认退出"
      cancel-btn="取消"
      @confirm="handleConfirmLogout"
      @cancel="isLogoutConfirmVisible = false"
    >
      <div style="padding: 12px 0; font-size: 14.5px; color: #374151;">
        您确定要安全退出当前系统账号吗？退出后将返回登录界面。
      </div>
    </t-dialog>

    <!-- ==========================================
         🔍 全局搜索 Dialog
         ========================================== -->
    <t-dialog
      v-model:visible="isSearchVisible"
      header="全局搜索"
      :footer="false"
      width="540px"
      destroy-on-close
    >
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <t-input
          v-model="searchKeyword"
          placeholder="输入患者姓名/手机号/预约单号/订单号进行搜索..."
          clearable
          auto-focus
          @change="handleSearch"
          @enter="handleSearch"
        >
          <template #prefix-icon>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #9CA3AF;">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </template>
        </t-input>

        <!-- 切换类型 Tab -->
        <t-tabs v-model="activeSearchTab" style="margin-bottom: 4px;">
          <t-tab-panel value="all" label="全部" />
          <t-tab-panel value="patient" :label="`患者档案 (${searchResults.patients.length})`" />
          <t-tab-panel value="appointment" :label="`预约记录 (${searchResults.appointments.length})`" />
          <t-tab-panel value="order" :label="`订单记录 (${searchResults.orders.length})`" />
        </t-tabs>

        <t-loading :loading="isSearching">
          <!-- 没有任何匹配（无关键字或当前 Tab 没有返回结果） -->
          <div v-if="!hasSearchResults" style="padding: 24px 0; text-align: center; color: #94A3B8; font-size: 13px;">
            {{ searchKeyword ? '该分类下无匹配搜索结果' : '请输入关键字开始搜索...' }}
          </div>
          
          <div v-else style="display: flex; flex-direction: column; gap: 16px; max-height: 400px; overflow-y: auto; padding-right: 8px;">
            <!-- Patients -->
            <div v-if="(activeSearchTab === 'all' || activeSearchTab === 'patient') && searchResults.patients.length > 0">
              <div style="font-size: 11px; font-weight: 600; color: #64748B; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">患者档案</div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div
                  v-for="p in searchResults.patients"
                  :key="p.id"
                  class="search-result-item"
                  @click="selectSearchResult('patient', p.id)"
                >
                  <div>
                    <strong style="color: #1E293B; font-size: 13px;">{{ p.name }}</strong>
                    <span style="font-size: 12px; color: #64748B; margin-left: 8px;">{{ p.phone }}</span>
                    <span style="font-size: 11px; color: #94A3B8; margin-left: 8px;">{{ p.gender === 1 ? '男' : '女' }} · {{ p.age }}岁</span>
                  </div>
                  <t-tag size="small" theme="primary" variant="light">{{ p.member_level === 'vip' ? 'VIP' : '普通' }}</t-tag>
                </div>
              </div>
            </div>

            <!-- Appointments -->
            <div v-if="(activeSearchTab === 'all' || activeSearchTab === 'appointment') && searchResults.appointments.length > 0">
              <div style="font-size: 11px; font-weight: 600; color: #64748B; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">预约记录</div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div
                  v-for="a in searchResults.appointments"
                  :key="a.id"
                  class="search-result-item"
                  @click="selectSearchResult('appointment', a.id)"
                >
                  <div>
                    <strong style="color: #1E293B; font-size: 13px;">{{ a.appointment_no }}</strong>
                    <span style="font-size: 12px; color: #64748B; margin-left: 8px;">患者: {{ a.patient_name }}</span>
                    <span style="font-size: 11px; color: #94A3B8; margin-left: 8px;">日期: {{ a.appointment_date }}</span>
                  </div>
                  <t-tag size="small" :theme="a.status === 'completed' ? 'success' : (a.status === 'pending' ? 'warning' : 'default')" variant="light">
                    {{ a.status === 'completed' ? '已就诊' : (a.status === 'pending' ? '待审核' : (a.status === 'confirmed' ? '已确认' : a.status)) }}
                  </t-tag>
                </div>
              </div>
            </div>

            <!-- Orders -->
            <div v-if="(activeSearchTab === 'all' || activeSearchTab === 'order') && searchResults.orders.length > 0">
              <div style="font-size: 11px; font-weight: 600; color: #64748B; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">订单记录</div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div
                  v-for="o in searchResults.orders"
                  :key="o.id"
                  class="search-result-item"
                  @click="selectSearchResult('order', o.id)"
                >
                  <div>
                    <strong style="color: #1E293B; font-size: 13px;">订单号: {{ o.order_no }}</strong>
                    <span style="font-size: 12px; color: #64748B; margin-left: 8px;">金额: ¥{{ (o.pay_amount / 100).toFixed(2) }}</span>
                  </div>
                  <t-tag size="small" :theme="o.status === 'shipped' || o.status === 'completed' ? 'success' : 'primary'" variant="light">
                    {{ o.status === 'paid' ? '待发货' : (o.status === 'shipped' ? '已发货' : (o.status === 'completed' ? '已完成' : o.status)) }}
                  </t-tag>
                </div>
              </div>
            </div>
          </div>
        </t-loading>
      </div>
    </t-dialog>

    <!-- ==========================================
         💬 私信与 IM Drawer
         ========================================== -->
    <t-drawer
      v-model:visible="isChatVisible"
      header="在线咨询（实时聊天）"
      size="960px"
      :footer="false"
      :body-style="{ padding: 0, overflow: 'hidden' }"
      destroy-on-close
    >
      <div class="chat-container">
        <!-- Sidebar -->
        <div class="chat-sidebar">
          <div class="chat-search-bar">
            <div class="chat-search-input-wrapper">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="chat-search-icon">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                v-model="searchUserQuery"
                type="text"
                placeholder="搜索患者姓名/电话..."
                class="chat-search-input"
              />
            </div>
          </div>
          <div class="chat-user-list">
            <div
              v-for="user in filteredChatUsers"
              :key="user.id"
              class="chat-user-item"
              :class="{ active: selectedUserId === user.id }"
              @click="selectChatUser(user.id)"
            >
              <div class="chat-avatar">{{ user.name ? user.name[0] : '患' }}</div>
              <div class="chat-user-detail">
                <div class="chat-user-top">
                  <span class="name">{{ user.name }}</span>
                  <span class="time">{{ user.time || '刚刚' }}</span>
                </div>
                <div class="chat-last-msg">{{ user.lastMsg }}</div>
              </div>
              <div v-if="user.unread" class="chat-unread-dot"></div>
            </div>
            <div v-if="filteredChatUsers.length === 0" class="chat-sidebar-empty">
              未找到相关患者
            </div>
          </div>
        </div>

        <!-- Main Chat Pane -->
        <div v-if="selectedUserId" class="chat-main">
          <div class="chat-header">
            <div class="chat-header-left">
              <span class="chat-online-pulse"></span>
              <strong class="chat-header-name">{{ chatUsers.find(u => u.id === selectedUserId)?.name || '沟通中' }}</strong>
              <span class="chat-header-desc">咨询通道 ({{ chatUsers.find(u => u.id === selectedUserId)?.phone }})</span>
            </div>
          </div>

          <div class="chat-messages" ref="chatMessagesContainer">
            <div
              v-for="(msg, index) in chatMessages"
              :key="index"
              class="chat-bubble-row"
              :class="{ mine: msg.sender !== 'patient' }"
            >
              <div class="chat-avatar-sm" :class="msg.sender === 'patient' ? 'patient-avatar' : 'doctor-avatar'">
                {{ msg.sender === 'patient' ? '患' : '医' }}
              </div>
              <div class="chat-bubble">
                {{ msg.text }}
              </div>
            </div>
          </div>

          <div class="chat-input-area">
            <!-- Quick Replies -->
            <div class="chat-quick-replies">
              <span class="quick-reply-label">快捷回复:</span>
              <span class="quick-reply-tag" @click="useQuickReply('您好，鼾静健康客服，请问有什么可以帮您？')">打招呼</span>
              <span class="quick-reply-tag" @click="useQuickReply('好的，已为您确认了该挂号预约，您可以前往“我的挂号”查看详细信息。')">确认预约</span>
              <span class="quick-reply-tag" @click="useQuickReply('您的订单已成功打单发货，快递单号已生成，请耐心等待配送。')">发货提醒</span>
              <span class="quick-reply-tag" @click="useQuickReply('请问您目前主要有哪些不适症状？使用止鼾设备后有什么改善吗？')">常规问询</span>
            </div>
            
            <t-textarea
              v-model="chatInputText"
              placeholder="请输入给患者的回复内容，按 Enter 键发送..."
              :autosize="{ minRows: 2, maxRows: 4 }"
              @enter="sendChatMessage"
            />
            <div class="chat-send-btn-row">
              <span class="chat-input-hint">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -1px;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                提示：支持自动模拟患者智能回复
              </span>
              <t-button theme="primary" size="medium" :loading="isSendingMsg" @click="sendChatMessage" class="chat-send-btn">
                <span>发送消息</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px;">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </t-button>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="chat-empty-state">
          <div class="chat-empty-icon-wrapper">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div class="chat-empty-title">在线咨询工作台</div>
          <div class="chat-empty-desc">选择左侧患者列表以开始实时双向聊天对话</div>
        </div>
      </div>
    </t-drawer>
  </t-layout>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
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
  margin-right: 16px !important;
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
  margin-left: 0 !important;
  padding: 0 24px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 12px !important;
  flex-shrink: 0 !important;
  width: 100%;
  box-sizing: border-box !important;
}
.app-sidebar.collapsed .sidebar-logo {
  justify-content: center !important;
  padding: 0 !important;
  margin-left: 0 !important;
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
  border-left: 1px solid #E5E7EB;
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

.app-sidebar .t-menu__logo,
.app-sidebar .t-default-menu__logo {
  border-bottom: 1px solid #1E293B !important;
  height: 64px !important;
  min-height: 64px !important;
  max-height: 64px !important;
  padding: 0 !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  display: flex !important;
  align-items: center !important;
}
.app-sidebar:not(.collapsed) .t-menu__logo,
.app-sidebar:not(.collapsed) .t-default-menu__logo {
  justify-content: flex-start !important;
}
.app-sidebar .t-menu__operations {
  display: none !important;
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
  cursor: pointer;
  transition: all 0.2s ease-in-out !important;
}
.topbar-search:hover {
  background: #EFF6FF !important;
  border-color: #3B6BF5 !important;
  color: #3B6BF5 !important;
}
.topbar-search .search-icon-svg {
  color: #9CA3AF;
  transition: color 0.15s ease-in-out;
}
.topbar-search:hover .search-icon-svg {
  color: #3B6BF5;
}

.topbar-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F9FAFB;
  cursor: pointer;
  position: relative;
  border: none;
  color: #64748B;
  transition: all 0.2s ease-in-out;
}
.topbar-icon-svg {
  transition: all 0.2s ease-in-out;
  color: #64748B;
}

/* 🔔 消息通知按钮 Hover 效果 */
.topbar-icon-btn.notif-btn:hover {
  background: #FFFBEB !important;
  color: #D97706 !important;
}
.topbar-icon-btn.notif-btn:hover .topbar-icon-svg {
  color: #D97706 !important;
  transform: rotate(15deg);
}

/* 💬 在线咨询按钮 Hover 效果 */
.topbar-icon-btn.chat-btn:hover {
  background: #ECFDF5 !important;
  color: #059669 !important;
}
.topbar-icon-btn.chat-btn:hover .topbar-icon-svg {
  color: #059669 !important;
  transform: scale(1.08);
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

/* === Global Search CSS === */
.search-result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #F8FAFC;
  border-radius: 8px;
  border: 1px solid #F1F5F9;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}
.search-result-item:hover {
  background: #EFF6FF;
  border-color: #BFDBFE;
}

/* === Notification Dropdown CSS === */
.notif-popup-overlay,
.notif-popup-overlay.t-popup__content,
.notif-popup-overlay .t-popup__content {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
}

.notification-dropdown {
  width: 340px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
  border: 1px solid #E2E8F0;
  overflow: hidden;
}
.notif-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  font-weight: 600;
  font-size: 14px;
  color: #0F172A;
  border-bottom: 1px solid #F1F5F9;
  background: #F8FAFC;
}
.notif-list {
  display: flex;
  flex-direction: column;
  max-height: 380px;
  overflow-y: auto;
}
.notif-item {
  display: flex;
  gap: 14px;
  padding: 14px 18px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-bottom: 1px solid #F1F5F9;
  text-align: left;
  position: relative;
  align-items: flex-start;
}
.notif-item:last-child {
  border-bottom: none;
}
.notif-item:hover {
  background: #F8FAFC;
}
.notif-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}
.notif-item:hover .notif-icon-wrapper {
  transform: scale(1.05);
}
.notif-item.notif-withdraw .notif-icon-wrapper {
  background-color: #EFF6FF;
  color: #2563EB;
}
.notif-item.notif-withdraw:hover {
  background: #F0F7FF;
}
.notif-item.notif-appointment .notif-icon-wrapper {
  background-color: #FEF3C7;
  color: #D97706;
}
.notif-item.notif-appointment:hover {
  background: #FFFBEB;
}
.notif-item.notif-order .notif-icon-wrapper {
  background-color: #ECFDF5;
  color: #059669;
}
.notif-item.notif-order:hover {
  background: #F0FDF4;
}
.notif-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.notif-title {
  font-weight: 600;
  font-size: 13px;
  color: #1E293B;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.notif-desc {
  font-size: 12px;
  color: #64748B;
  line-height: 1.5;
}
.notif-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
}
.notif-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background-color: #F0FDF4;
  color: #10B981;
  border-radius: 50%;
  margin-bottom: 16px;
  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.1);
}
.notif-empty-text {
  font-size: 13px;
  color: #64748B;
  font-weight: 500;
}

/* === IM Chat CSS === */
.chat-container {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: #ffffff;
}

.chat-sidebar {
  width: 280px;
  border-right: 1px solid #E2E8F0;
  display: flex;
  flex-direction: column;
  background: #F8FAFC;
  flex-shrink: 0;
}

.chat-search-bar {
  padding: 12px 16px;
  background: #ffffff;
  border-bottom: 1px solid #E2E8F0;
}

.chat-search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #F1F5F9;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.chat-search-input-wrapper:focus-within {
  background: #ffffff;
  border-color: #3B82F6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

.chat-search-icon {
  color: #94A3B8;
  flex-shrink: 0;
}

.chat-search-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: #1E293B;
  width: 100%;
}

.chat-search-input::placeholder {
  color: #94A3B8;
}

.chat-user-list {
  flex: 1;
  overflow-y: auto;
}

.chat-user-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #F1F5F9;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  text-align: left;
  border-left: 3px solid transparent;
}

.chat-user-item:hover {
  background: #F1F5F9;
}

.chat-user-item.active {
  background: #EFF6FF;
  border-left-color: #3B82F6;
}

.chat-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 15px;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.15);
}

.chat-user-detail {
  flex: 1;
  overflow: hidden;
}

.chat-user-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.chat-user-top .name {
  font-weight: 600;
  font-size: 13px;
  color: #0F172A;
}

.chat-user-top .time {
  font-size: 11px;
  color: #94A3B8;
}

.chat-last-msg {
  font-size: 12px;
  color: #64748B;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #EF4444;
  position: absolute;
  right: 16px;
  bottom: 18px;
  box-shadow: 0 0 0 2px #ffffff;
}

.chat-sidebar-empty {
  text-align: center;
  padding: 32px 16px;
  color: #94A3B8;
  font-size: 13px;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #F8FAFC;
}

.chat-header {
  padding: 16px 24px;
  border-bottom: 1px solid #E2E8F0;
  background: #ffffff;
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  z-index: 10;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-online-pulse {
  width: 8px;
  height: 8px;
  background-color: #10B981;
  border-radius: 50%;
  display: inline-block;
  position: relative;
}

.chat-online-pulse::after {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  background-color: #10B981;
  border-radius: 50%;
  animation: pulse-ring 1.25s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(0.33); opacity: 1; }
  80%, 100% { transform: scale(2.2); opacity: 0; }
}

.chat-header-name {
  font-size: 15px;
  font-weight: 600;
  color: #0F172A;
}

.chat-header-desc {
  font-size: 12px;
  color: #64748B;
  background: #F1F5F9;
  padding: 2px 8px;
  border-radius: 4px;
}

.chat-messages {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  background: #F1F5F9;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-bubble-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  max-width: 75%;
  text-align: left;
}

.chat-bubble-row.mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.chat-avatar-sm {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.08);
}

.chat-avatar-sm.patient-avatar {
  background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
}

.chat-avatar-sm.doctor-avatar {
  background: linear-gradient(135deg, #10B981 0%, #047857 100%);
}

.chat-bubble {
  background: #ffffff;
  padding: 12px 16px;
  border-radius: 0px 12px 12px 12px;
  font-size: 13.5px;
  color: #1E293B;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  line-height: 1.5;
  word-break: break-all;
}

.chat-bubble-row.mine .chat-bubble {
  background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
  color: #ffffff;
  border-radius: 12px 0px 12px 12px;
  box-shadow: 0 3px 10px rgba(37, 99, 235, 0.15);
}

.chat-input-area {
  padding: 16px;
  border-top: 1px solid #E2E8F0;
  background: #ffffff;
}

.chat-quick-replies {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.quick-reply-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748B;
  margin-right: 4px;
}

.quick-reply-tag {
  font-size: 11.5px;
  color: #475569;
  background: #F1F5F9;
  padding: 4px 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid #E2E8F0;
}

.quick-reply-tag:hover {
  background: #EFF6FF;
  color: #2563EB;
  border-color: #BFDBFE;
}

.chat-send-btn-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.chat-input-hint {
  font-size: 12px;
  color: #94A3B8;
  display: flex;
  align-items: center;
}

.chat-send-btn {
  padding: 0 16px !important;
  font-weight: 500;
  border-radius: 6px !important;
  height: 36px !important;
}

.chat-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #F8FAFC;
  padding: 48px;
}

.chat-empty-icon-wrapper {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #EFF6FF;
  color: #2563EB;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  box-shadow: 0 8px 16px rgba(37, 99, 235, 0.08);
}

.chat-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #0F172A;
  margin-bottom: 8px;
}

.chat-empty-desc {
  font-size: 13px;
  color: #64748B;
  max-width: 280px;
  line-height: 1.5;
  text-align: center;
}

.chat-badge {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #EF4444;
  position: absolute;
  top: 10px;
  right: 10px;
}
</style>
