import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'inbox', component: () => import('@/views/InboxView.vue') },
  { path: '/arcs/:id', name: 'arc-detail', component: () => import('@/views/ArcDetailView.vue'), props: true },
  { path: '/quarantine', name: 'quarantine', component: () => import('@/views/QuarantineView.vue') },
  { path: '/search', name: 'search', component: () => import('@/views/SearchView.vue') },
  { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/views/OnboardingView.vue'),
    meta: { layout: 'minimal' }
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});
