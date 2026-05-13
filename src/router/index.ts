import { createRouter, createWebHistory } from 'vue-router'
import { loginClient } from '@/lib/auth'
import AppLayout from '@/layouts/AppLayout.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_BASE_PATH ?? '/'),
  routes: [
    // Unauthenticated routes
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/OnboardingView.vue'),
    },

    // Authenticated routes — all rendered inside AppLayout (sidebar)
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'inbox',
          component: () => import('@/views/InboxView.vue'),
        },
        {
          path: 'arcs/:id',
          name: 'arc-detail',
          component: () => import('@/views/ArcDetailView.vue'),
        },
        {
          path: 'quarantine',
          name: 'quarantine',
          component: () => import('@/views/QuarantineView.vue'),
        },
        {
          path: 'search',
          name: 'search',
          component: () => import('@/views/SearchView.vue'),
        },
        {
          path: 'labels',
          name: 'labels',
          component: () => import('@/views/LabelsView.vue'),
        },
        {
          path: 'rules',
          name: 'rules',
          component: () => import('@/views/RulesView.vue'),
        },
        {
          path: 'rules/new',
          name: 'rules-new',
          component: () => import('@/views/RuleEditorView.vue'),
        },
        {
          path: 'rules/:id',
          name: 'rules-edit',
          component: () => import('@/views/RuleEditorView.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
        },
        {
          path: 'settings/notifications',
          name: 'settings-notifications',
          component: () => import('@/views/SettingsView.vue'),
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('@/views/ProfileView.vue'),
        },
        {
          path: 'billing',
          name: 'billing',
          component: () => import('@/views/BillingView.vue'),
        },
        {
          path: 'audit-log',
          name: 'audit-log',
          component: () => import('@/views/AuditLogView.vue'),
        },
      ],
    },

    // Legal pages (no sidebar)
    {
      path: '/terms',
      name: 'terms',
      component: () => import('@/views/LegalView.vue'),
      props: { page: 'terms' },
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('@/views/LegalView.vue'),
      props: { page: 'privacy' },
    },
  ],
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  const authenticated = await loginClient.userSessionExists()
  if (!authenticated) return { name: 'login' }
  return true
})
