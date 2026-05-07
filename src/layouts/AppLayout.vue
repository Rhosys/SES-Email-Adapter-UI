<script setup lang="ts">
import { onMounted } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useLabelsStore } from '@/stores/labels'
import { useViewsStore } from '@/stores/views'
import AppSidebar from '@/components/AppSidebar.vue'

const accountStore = useAccountStore()
const labelsStore = useLabelsStore()
const viewsStore = useViewsStore()

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
    <div class="flex flex-1 flex-col overflow-y-auto">
      <RouterView />
    </div>
  </div>
</template>
