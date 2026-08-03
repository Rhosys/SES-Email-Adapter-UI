<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useQuarantineStore } from '@/stores/quarantine'

defineProps<{ tab: 'active' | 'archived' | 'all'; refreshing?: boolean; lastRefreshedAt?: string | null }>()
defineEmits<{ refresh: [] }>()

const quarantineStore = useQuarantineStore()

const messages = {
  active: {
    primary: 'Nothing here. Suspicious.',
    secondary:
      'Either the internet has dried up or your filters are doing an excellent job. New emails will appear here the moment they arrive.',
  },
  archived: {
    primary: 'Archive is empty',
    secondary:
      'You have not banished anything here yet. Conversations you archive leave your inbox but live on \u2014 like exes on social media.',
  },
  all: {
    primary: 'Zero emails. Total silence.',
    secondary:
      'Not a single electron has graced this inbox. Send yourself something \u2014 we will not judge.',
  },
}
</script>

<template>
  <div class="py-20 text-center">
    <p class="text-base font-medium text-ctp-text">{{ messages[tab].primary }}</p>
    <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">{{ messages[tab].secondary }}</p>

    <RouterLink
      v-if="tab === 'active' && quarantineStore.visibleCount > 0"
      :to="{ name: 'quarantine' }"
      class="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full border border-ctp-peach/40 bg-ctp-peach/10 px-3 py-1.5 text-sm text-ctp-peach transition-colors hover:bg-ctp-peach/20"
    >
      {{ quarantineStore.visibleCount }} email{{ quarantineStore.visibleCount === 1 ? '' : 's' }} waiting for your
      review in quarantine →
    </RouterLink>

    <div v-else-if="tab === 'active'" class="mt-4 flex flex-col items-center gap-1.5">
      <button
        :disabled="refreshing"
        class="inline-flex items-center gap-1.5 rounded-full border border-ctp-surface1 px-3 py-1.5 text-sm text-ctp-subtext1 transition-colors hover:border-ctp-blue hover:text-ctp-blue disabled:opacity-50"
        @click="$emit('refresh')"
      >
        <svg
          class="h-3.5 w-3.5"
          :class="{ 'animate-spin': refreshing }"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <path d="M14 8A6 6 0 1 1 8 2" stroke-linecap="round" />
          <path d="M8 0v4l3-2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Check for new mail
      </button>
      <span v-if="lastRefreshedAt" class="text-xs text-ctp-subtext0">Last checked: {{ lastRefreshedAt }}</span>
    </div>
  </div>
</template>
