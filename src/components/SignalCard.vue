<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Signal } from '@/types/server'

const props = defineProps<{ signal: Signal }>()

const expanded = ref(true)

const fromLabel = computed(() => {
  const { name, address } = props.signal.from
  return name ? `${name} <${address}>` : address
})

const hasSpamWarning = computed(() => (props.signal.spamScore ?? 0) > 0.3)

const sentAt = computed(() =>
  new Date(props.signal.receivedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }),
)
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle">
    <!-- Card header -->
    <button
      class="flex w-full items-center justify-between px-4 py-3 text-left"
      @click="expanded = !expanded"
    >
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-ctp-text">{{ fromLabel }}</span>
          <span
            v-if="hasSpamWarning"
            class="text-xs text-ctp-peach"
            title="Higher-than-normal spam score"
            >⚠ Possible spam</span
          >
        </div>
        <span class="text-xs text-ctp-subtext0">{{ sentAt }}</span>
      </div>
      <span class="ml-2 shrink-0 text-xs text-ctp-subtext0">{{ expanded ? '▲' : '▼' }}</span>
    </button>

    <!-- Email body -->
    <div v-if="expanded" class="border-t border-ctp-surface1">
      <iframe
        v-if="signal.htmlBody"
        :srcdoc="signal.htmlBody"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        class="w-full rounded-b-lg"
        style="min-height: 200px; border: none"
        title="Email content"
      />
      <pre
        v-else-if="signal.textBody"
        class="whitespace-pre-wrap px-4 py-3 font-sans text-sm text-ctp-text"
        >{{ signal.textBody }}</pre
      >
      <p v-else class="px-4 py-3 text-sm text-ctp-subtext0">(No content)</p>
    </div>
  </div>
</template>
