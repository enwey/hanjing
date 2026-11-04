import { hasPermission } from '@/utils/permission'
import { getMenuGroups, visibleMenuGroups } from '@/utils/menu'
import { storedFirstMenuPath } from '@/utils/menu'
import { createRouter, createWebHistory } from 'vue-router'
import BasicLayout from '@/layouts/BasicLayout.vue'
import { resolveMenuPathFromRoute } from '@/utils/routeNavigation'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/index.vue'),
      meta: { title: '登录' }
    },
    {
      path: '/',
      component: BasicLayout,
      redirect: () => storedFirstMenuPath(),
      children: [
        { path: 'profile', name: 'no-access', component: () => import('@/views/settings/no-access.vue'), meta: { title: '访问权限' } },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/dashboard/index.vue'),
          meta: { title: '数据看板' }
        },
        {
          path: 'appointment',
          name: 'appointment',
          component: () => import('@/views/appointment/index.vue'),
          meta: { title: '预约管理' }
        },
        {
          path: 'appointment/create',
          name: 'appointment-create',
          component: () => import('@/views/appointment/create.vue'),
          meta: { title: '新建预约', parentPath: '/appointment' }
        },
        {
          path: 'appointment/detail/:id',
          name: 'appointment-detail',
          component: () => import('@/views/appointment/detail.vue'),
          meta: { title: '预约详情', parentPath: '/appointment' }
        },
        {
          path: 'appointment/emr/:id',
          name: 'appointment-emr',
          component: () => import('@/views/appointment/emr.vue'),
          meta: { title: '诊疗录入', parentPath: '/appointment' }
        },
        {
          path: 'workbench',
          name: 'appointment-workbench',
          component: () => import('@/views/appointment/workbench.vue'),
          meta: { title: '接诊工作台' }
        },
        {
          path: 'queue',
          name: 'queue',
          component: () => import('@/views/appointment/queue.vue'),
          meta: { title: '排队分诊' }
        },
        {
          path: 'patient',
          name: 'patient',
          component: () => import('@/views/patient/index.vue'),
          meta: { title: '患者管理' }
        },
        {
          path: 'patient/detail/:id',
          name: 'patient-detail',
          component: () => import('@/views/patient/detail.vue'),
          meta: { title: '患者详情', parentPath: '/patient' }
        },
        {
          path: 'doctor',
          name: 'doctor',
          component: () => import('@/views/doctor/index.vue'),
          meta: { title: '医生管理' }
        },
        {
          path: 'doctor/schedule/:id',
          name: 'doctor-schedule',
          component: () => import('@/views/doctor/schedule.vue'),
          meta: { title: '排班管理', parentPath: '/doctor' }
        },
        {
          path: 'store/schedule/:storeId',
          name: 'store-schedule',
          component: () => import('@/views/doctor/schedule.vue'),
          meta: { title: '门店排班', parentPath: '/store' }
        },
        {
          path: 'store',
          name: 'store',
          component: () => import('@/views/store/index.vue'),
          meta: { title: '门店管理' }
        },
        {
          path: 'order',
          name: 'order',
          component: () => import('@/views/order/index.vue'),
          meta: { title: '订单管理' }
        },
        {
          path: 'order/detail/:id',
          name: 'order-detail',
          component: () => import('@/views/order/detail.vue'),
          meta: { title: '订单详情', parentPath: '/order' }
        },
        {
          path: 'fulfillment',
          name: 'fulfillment',
          component: () => import('@/views/fulfillment/index.vue'),
          meta: { title: '交付管理' }
        },
        {
          path: 'after-sales',
          name: 'after-sales',
          component: () => import('@/views/after-sales/index.vue'),
          meta: { title: '售后工作台' }
        },
        {
          path: 'distribution',
          name: 'distribution',
          component: () => import('@/views/distribution/index.vue'),
          meta: { title: '分销总览' }
        },
        {
          path: 'promoter',
          name: 'promoter',
          component: () => import('@/views/distribution/promoter.vue'),
          meta: { title: '推广员管理' }
        },
        {
          path: 'withdraw',
          name: 'withdraw',
          component: () => import('@/views/distribution/withdraw.vue'),
          meta: { title: '提现审核' }
        },
        {
          path: 'products',
          name: 'products',
          component: () => import('@/views/distribution/products.vue'),
          meta: { title: '商品管理' }
        },
        {
          path: 'product-categories',
          name: 'products-categories',
          component: () => import('@/views/distribution/categories.vue'),
          meta: { title: '商品分类' }
        },
        {
          path: 'products/edit/:id',
          name: 'products-edit-id',
          component: () => import('@/views/distribution/edit.vue'),
          meta: { title: '编辑商品', parentPath: '/products' }
        },
        {
          path: 'products/edit',
          name: 'products-edit',
          component: () => import('@/views/distribution/edit.vue'),
          meta: { title: '添加商品', parentPath: '/products' }
        },
        {
          path: 'promoter/detail/:id',
          name: 'distribution-detail',
          component: () => import('@/views/distribution/detail.vue'),
          meta: { title: '推广员详情', parentPath: '/promoter' }
        },
        {
          path: 'content',
          name: 'content',
          component: () => import('@/views/content/index.vue'),
          meta: { title: '科普文章' }
        },
        {
          path: 'content-category',
          name: 'content-category',
          component: () => import('@/views/content/category.vue'),
          meta: { title: '分类管理', parentPath: '/content' }
        },
        {
          path: 'content/edit/:id',
          name: 'content-edit-id',
          component: () => import('@/views/content/edit.vue'),
          meta: { title: '编辑文章', parentPath: '/content' }
        },
        {
          path: 'content/edit',
          name: 'content-edit',
          component: () => import('@/views/content/edit.vue'),
          meta: { title: '新建文章', parentPath: '/content' }
        },
        {
          path: 'live',
          name: 'content-live',
          redirect: () => storedFirstMenuPath(),
          meta: { title: '直播管理' }
        },
        {
          path: 'banner',
          name: 'banner',
          redirect: () => storedFirstMenuPath(),
          meta: { title: '轮播图管理' }
        },
        {
          path: 'order/refund',
          name: 'refund',
          component: () => import('@/views/order/refund.vue'),
          meta: { title: '退款审核', parentPath: '/order' }
        },
        {
          path: 'wechat-notifications',
          name: 'wechat-notifications',
          component: () => import('@/views/settings/wechat-notifications.vue'),
          meta: { title: '微信通知' }
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/settings/index.vue'),
          meta: { title: '系统设置' }
        },
        {
          path: 'permission',
          name: 'permission',
          component: () => import('@/views/settings/permission.vue'),
          meta: { title: '角色管理' }
        },
        {
          path: 'permission/role-edit/:id',
          name: 'role-edit-id',
          component: () => import('@/views/settings/role-edit.vue'),
          meta: { title: '角色权限编辑', parentPath: '/permission' }
        },
        {
          path: 'permission/role-edit',
          name: 'role-edit',
          component: () => import('@/views/settings/role-edit.vue'),
          meta: { title: '添加角色', parentPath: '/permission' }
        },
        {
          path: 'admin',
          name: 'admin',
          component: () => import('@/views/settings/admin.vue'),
          meta: { title: '成员管理' }
        },
        {
          path: 'log',
          name: 'log',
          component: () => import('@/views/settings/log.vue'),
          meta: { title: '操作日志' }
        },
        {
          path: 'mini-program-log',
          name: 'mini-program-log',
          component: () => import('@/views/settings/mini-program-log.vue'),
          meta: { title: '小程序日志' }
        },
        {
          path: 'database-tools',
          name: 'database-tools',
          component: () => import('@/views/settings/database-tools.vue'),
          meta: { title: '数据库工具', parentPath: '/settings' }
        },
        {
          path: 'store/report/:id',
          name: 'store-report-id',
          component: () => import('@/views/store/report.vue'),
          meta: { title: '门店数据报表', parentPath: '/store' }
        },
        {
          path: 'store/report',
          name: 'store-report',
          component: () => import('@/views/store/report.vue'),
          meta: { title: '门店数据报表', parentPath: '/store' }
        },
        {
          path: 'patient/followup/:id',
          name: 'patient-followup',
          component: () => import('@/views/patient/followup.vue'),
          meta: { title: '随访任务', parentPath: '/patient/detail/:id' }
        }
      ]
    }
  ]
})

import request from '@/utils/request'

function isExpiredOrMalformedToken(token: string) {
  try {
    const segment = token.split('.')[1]
    if (!segment) return true
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=')
    const payload = JSON.parse(atob(normalized))
    return !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

function shouldPreserveNavigationContext(to: any, from: any) {
  // Disabling redirect-based context preservation. The logical parent path mapping (parentPath) 
  // is now prioritized and correctly resolved, meaning query.from redirection is no longer needed.
  // This also prevents Vue Router's 'replace: true' from overwriting the list view in the history stack.
  return false
}

router.beforeEach(async (to, from, next) => {
  const continueNavigation = () => {
    if (shouldPreserveNavigationContext(to, from)) {
      next({
        path: to.path,
        query: {
          ...to.query,
          from: from.fullPath,
          menu: resolveMenuPathFromRoute(from)
        },
        hash: to.hash,
        replace: true
      })
      return
    }

    next()
  }

  let token = localStorage.getItem('auth_token')
  if (token && isExpiredOrMalformedToken(token)) {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_info')
    token = null
  }
  if (to.name === 'login' && token) {
    next({ path: storedFirstMenuPath() })
    return
  }
  if (to.name !== 'login' && !token) {
    next({ name: 'login' })
    return
  }
  
  if (token && to.name !== 'login') {
    { // Refresh grants before entering a page; revoked permissions must not survive in local storage.
      try {
        const res: any = await request.get('/api/admin/me')
        if (res && res.code === 200) {
          localStorage.setItem('user_info', JSON.stringify(res.data))
          window.dispatchEvent(new Event('admin-permissions-updated'))
        } else {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('user_info')
          next({ name: 'login' })
          return
        }
      } catch (err) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user_info')
        next({ name: 'login' })
        return
      }
    }
  }
  
  const featureRules: Array<[RegExp, string[]]> = [
    [/^\/appointment\/create$/, ['appointment:add', 'patient:view']],
    [/^\/appointment\/emr\//, ['medical_record:view']],
    [/^\/(doctor|store)\/schedule\//, ['schedule:view']],
    [/^\/patient\/followup\//, ['medical_record:view']],
    [/^\/content\/edit$/, ['content:add', 'content:view']],
    [/^\/content\/edit\//, ['content:edit', 'content:view']],
    [/^\/products\/edit$/, ['product:add', 'product:view']],
    [/^\/products\/edit\//, ['product:edit', 'product:view']],
    [/^\/store\/report(?:\/|$)/, ['store:report']]
  ]
  if (token && featureRules.some(([pattern, permissions]) => pattern.test(to.path) && !permissions.every(hasPermission))) {
    next({ path: storedFirstMenuPath(), replace: true })
    return
  }
  const menuPath = getMenuGroups().flatMap(g=>g.items).filter(item=>to.path===item.path || to.path.startsWith(item.path+'/')).sort((a,b)=>b.path.length-a.path.length)[0]?.path
  const user = JSON.parse(localStorage.getItem('user_info') || '{}')
  const knownMenu = getMenuGroups().flatMap(group => group.items).find(item => item.path === menuPath)
  const workflowAccessible = (/^\/appointment\/(detail|emr)\//.test(to.path) && ['queue:view','workbench:view'].some(hasPermission)) || (/^\/store\/report\//.test(to.path) && hasPermission('store:report') && hasPermission('doctor:view'))
  if (token && knownMenu && !workflowAccessible && !visibleMenuGroups(user).some(group => group.items.some(item => item.path === knownMenu.path))) {
    next({ path: storedFirstMenuPath(), replace: true })
    return
  }
  continueNavigation()
})

export default router
