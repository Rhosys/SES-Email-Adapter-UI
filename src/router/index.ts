import { createRouter, createWebHistory } from 'vue-router'
import { loginClient } from '@/lib/auth'
import AppLayout from '@/layouts/AppLayout.vue'
import { useAccountStore } from '@/stores/account'

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
      meta: { requiresAuth: true },
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
          redirect: { name: 'settings', query: { tab: 'notifications' } },
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
        {
          path: 'changelog',
          name: 'changelog',
          component: () => import('@/views/ChangelogView.vue'),
        },
      ],
    },

    // Catch-all — redirect unknown paths to inbox
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
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

const ROUTE_TITLES: Record<string, string> = {
  inbox: 'Inbox',
  'arc-detail': 'Conversation',
  quarantine: 'Quarantine',
  search: 'Search',
  labels: 'Labels & Views',
  rules: 'Rules',
  'rules-new': 'New rule',
  'rules-edit': 'Edit rule',
  settings: 'Settings',
  profile: 'Profile',
  billing: 'Billing',
  'audit-log': 'Audit log',
  changelog: 'Changelog',
  login: 'Sign in',
  onboarding: 'Setup',
  terms: 'Terms of service',
  privacy: 'Privacy policy',
}

const APP_NAME = 'SES Email Adapter'

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  const authenticated = await loginClient.userSessionExists()
  if (!authenticated) return { name: 'login' }

  // Onboarding creates the account — skip the account check there
  if (to.name === 'onboarding') return true

  // For all other authenticated routes: ensure an account is loaded
  const accountStore = useAccountStore()
  if (!accountStore.fetched) {
    await accountStore.fetchAccount()
  }
  if (!accountStore.accountId) {
    return { name: 'onboarding' }
  }
  return true
})

router.afterEach((to) => {
  const routeTitle = to.name ? ROUTE_TITLES[String(to.name)] : undefined
  document.title = routeTitle ? `${routeTitle} — ${APP_NAME}` : APP_NAME
})
