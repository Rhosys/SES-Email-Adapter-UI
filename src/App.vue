<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const resolving = ref(true)

router.beforeEach(() => {
  resolving.value = true
})

router.afterEach(() => {
  resolving.value = false
})

// Also clear on first navigation error (e.g. redirect loop)
router.onError(() => {
  resolving.value = false
})

// Initial route is already resolved by the time App mounts if navigation is sync,
// but the auth guard is async — so we wait for the first afterEach to fire.
router.isReady().then(() => {
  resolving.value = false
})
</script>

<template>
  <!-- Loading skeleton shown while auth guard / route is resolving -->
  <div v-if="resolving" class="flex h-screen items-center justify-center bg-ctp-base">
    <div class="flex flex-col items-center gap-4">
      <div class="flex items-center gap-2">
        <svg viewBox="0 0 32 32" fill="none" class="h-8 w-8" aria-hidden="true">
          <path d="M6 10h20v12H6z" stroke="currentColor" stroke-width="2" class="text-ctp-mauve" />
          <path d="M6 10l10 7 10-7" stroke="currentColor" stroke-width="2" stroke-linejoin="round" class="text-ctp-mauve" />
        </svg>
        <span class="text-lg font-medium text-ctp-text">Numaeel</span>
      </div>
      <div class="h-1 w-32 overflow-hidden rounded-full bg-ctp-surface0">
        <div class="loading-bar h-full rounded-full bg-ctp-mauve" />
      </div>
    </div>
  </div>

  <RouterView v-else />
</template>

<style scoped>
@keyframes loading-slide {
  0% { width: 0%; transform: translateX(0); }
  50% { width: 60%; transform: translateX(20%); }
  100% { width: 30%; transform: translateX(300%); }
}
.loading-bar {
  animation: loading-slide 1.5s ease-in-out infinite;
}
</style>
