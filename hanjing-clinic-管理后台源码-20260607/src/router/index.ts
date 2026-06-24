import { createRouter, createWebHistory } from 'vue-router'
import BasicLayout from '@/layouts/BasicLayout.vue'

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
      redirect: '/dashboard',
      children: [
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
          path: 'appointment/checkout',
          name: 'appointment-checkout',
          component: () => import('@/views/appointment/checkout.vue'),
          meta: { title: '收银结账', parentPath: '/appointment' }
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
          meta: { title: '推广商品管理' }
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
          path: 'banner',
          name: 'banner',
          component: () => import('@/views/content/banner.vue'),
          meta: { title: '轮播图管理' }
        },
        {
          path: 'order/refund',
          name: 'refund',
          component: () => import('@/views/order/refund.vue'),
          meta: { title: '退款审核', parentPath: '/order' }
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
          meta: { title: '权限管理' }
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
          path: 'settings/admin',
          name: 'admin',
          component: () => import('@/views/settings/admin.vue'),
          meta: { title: '管理员账号', parentPath: '/settings' }
        },
        {
          path: 'log',
          name: 'log',
          component: () => import('@/views/settings/log.vue'),
          meta: { title: '操作日志' }
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

router.beforeEach(async (to, from, next) => {
  const token = localStorage.getItem('auth_token')
  if (to.name !== 'login' && !token) {
    next({ name: 'login' })
    return
  }
  
  if (token && to.name !== 'login') {
    const userInfo = localStorage.getItem('user_info')
    if (!userInfo) {
      try {
        const res: any = await request.get('/api/admin/me')
        if (res && res.code === 200) {
          localStorage.setItem('user_info', JSON.stringify(res.data))
          next()
        } else {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('user_info')
          next({ name: 'login' })
        }
      } catch (err) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user_info')
        next({ name: 'login' })
      }
      return
    }
  }
  
  next()
})

export default router
