import { createRouter, createWebHistory } from 'vue-router'
import { loginClient } from '@/lib/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'inbox',
      component: () => import('@/views/InboxView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/arcs/:id',
      name: 'arc-detail',
      component: () => import('@/views/ArcDetailView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/quarantine',
      name: 'quarantine',
      component: () => import('@/views/QuarantineView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  const authenticated = await loginClient.userSessionExists()
  if (!authenticated) return { name: 'login' }
  return true
})
