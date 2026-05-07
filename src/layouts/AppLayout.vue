<script setup lang="ts">
import { ref, watch } from 'vue'
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { useLabelsStore } from '@/stores/labels'
import { useViewsStore } from '@/stores/views'
import AppSidebar from '@/components/AppSidebar.vue'

const accountStore = useAccountStore()
const labelsStore = useLabelsStore()
const viewsStore = useViewsStore()
const router = useRouter()
const route = useRoute()

const searchQuery = ref('')

watch(
  () => route.query.q,
  (q) => {
    if (route.path === '/search') searchQuery.value = (q as string) ?? ''
    else searchQuery.value = ''
  },
)

function submitSearch() {
  const q = searchQuery.value.trim()
  if (!q) return
  void router.push({ path: '/search', query: { q } })
}

onMounted(async () => {
  if (!accountStore.account) {
    await accountStore.fetchAccount()
  }
  if (accountStore.accountId) {
    await Promise.all([
      labelsStore.fetchLabels(accountStore.accountId),
      viewsStore.fetchViews(accountStore.accountId),
    ])
  }
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-ctp-base text-ctp-text">
    <AppSidebar />
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Top search bar -->
      <header
        class="flex h-11 shrink-0 items-center border-b border-ctp-surface0 bg-ctp-mantle px-4"
      >
        <form class="flex w-full max-w-xl items-center gap-2" @submit.prevent="submitSearch">
          <div class="relative flex-1">
            <svg
              class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ctp-subtext0"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path
                d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.156a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"
              />
            </svg>
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search…"
              class="h-7 w-full rounded-md border border-ctp-surface1 bg-ctp-base pl-8 pr-3 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none"
            />
          </div>
        </form>
      </header>

      <div class="flex-1 overflow-y-auto">
        <RouterView />
      </div>
    </div>
  </div>
</template>
