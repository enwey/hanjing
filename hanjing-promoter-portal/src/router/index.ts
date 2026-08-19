import { createRouter, createWebHistory } from 'vue-router'
import PromoterLayout from '@/layouts/PromoterLayout.vue'
import { getPromoterToken } from '@/utils/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/index.vue'),
      meta: { title: '推广端登录', public: true }
    },
    {
      path: '/',
      component: PromoterLayout,
      redirect: '/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/dashboard/index.vue'),
          meta: { title: '推广概览' }
        },
        {
          path: 'promoters',
          name: 'promoters',
          component: () => import('@/views/promoters/index.vue'),
          meta: { title: '我的团队' }
        },
        {
          path: 'commissions',
          name: 'commissions',
          component: () => import('@/views/commissions/index.vue'),
          meta: { title: '我的佣金' }
        },
        {
          path: 'withdraws',
          name: 'withdraws',
          component: () => import('@/views/withdraws/index.vue'),
          meta: { title: '我的提现' }
        },
        {
          path: 'products',
          name: 'products',
          component: () => import('@/views/products/index.vue'),
          meta: { title: '推广商品' }
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('@/views/profile/index.vue'),
          meta: { title: '个人中心' }
        }
      ]
    }
  ]
})

router.beforeEach((to, _from, next) => {
  document.title = `${to.meta.title || '推广人员后台'} - 鼾静推广端`
  if (to.meta.public) {
    next()
    return
  }
  if (!getPromoterToken()) {
    next('/login')
    return
  }
  next()
})

export default router
