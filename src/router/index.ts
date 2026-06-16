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
    {
      path: '/profile',
      redirect: { name: 'settings', query: { tab: 'profile' } },
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
          path: 'drafts',
          name: 'drafts',
          component: () => import('@/views/DraftsView.vue'),
        },
        {
          path: 'search',
          name: 'search',
          component: () => import('@/views/SearchView.vue'),
        },
        {
          path: 'templates',
          name: 'templates',
          component: () => import('@/views/TemplatesView.vue'),
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
          redirect: { name: 'settings', query: { tab: 'profile' } },
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

    // Invite accept — unauthenticated so the nav guard doesn't redirect before login
    {
      path: '/invite',
      name: 'invite',
      component: () => import('@/views/InviteView.vue'),
    },
  ],
})

const ROUTE_TITLES: Record<string, string> = {
  inbox: 'Inbox',
  'arc-detail': 'Conversation',
  quarantine: 'Quarantine',
  drafts: 'Drafts',
  search: 'Search',
  labels: 'Labels & Views',
  rules: 'Rules',
  'rules-new': 'New rule',
  'rules-edit': 'Edit rule',
  templates: 'Templates',
  settings: 'Settings',
  billing: 'Billing',
  'audit-log': 'Audit log',
  changelog: 'Changelog',
  login: 'Sign in',
  onboarding: 'Setup',
  terms: 'Terms of service',
  privacy: 'Privacy policy',
  invite: 'Accept invitation',
}

const APP_NAME = 'SES Email Adapter'

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true

  const authenticated = await loginClient.userSessionExists()
  if (!authenticated) {
    const redirectUrl = `${window.location.origin}/login?redirect=${encodeURIComponent(to.fullPath)}`
    loginClient.authenticate({ redirectUrl })
    return new Promise<boolean>(() => {});
  }

  // Onboarding manages its own account creation — let it through always
  if (to.name === 'onboarding') return true

  // Wait for the background fetch (started in main.ts after session resolved) if accounts aren't loaded yet
  const accountStore = useAccountStore()
  if (!accountStore.accounts.length) {
    await accountStore.waitForFetch()
  }

  // Redirect to onboarding if no account exists or onboarding hasn't been completed.
  // Profile and billing are exempt — users can navigate there any time they're authenticated.
  const exemptFromOnboardingRedirect = new Set(['billing'])
  if (
    !exemptFromOnboardingRedirect.has(String(to.name)) &&
    (!accountStore.accountId || !accountStore.account?.onboarding?.completed)
  ) {
    return { name: 'onboarding' }
  }
  return true
})

router.afterEach((to) => {
  const routeTitle = to.name ? ROUTE_TITLES[String(to.name)] : undefined
  document.title = routeTitle ? `${routeTitle} — ${APP_NAME}` : APP_NAME
})
