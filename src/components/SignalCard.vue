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

// Best-effort auto-height: works if the browser grants parent access to the
// srcdoc iframe's contentDocument (behaviour varies; fails silently if not).
// The sandbox intentionally omits allow-scripts and allow-same-origin, so this
// may always fall through to the CSS min-height — that is the safe fallback.
function fitHeight(e: Event) {
  const iframe = e.target as HTMLIFrameElement
  try {
    const h = iframe.contentDocument?.documentElement.scrollHeight
    if (h) iframe.style.height = `${h}px`
  } catch {
    // Cross-origin sandbox blocked contentDocument access — keep CSS min-height
  }
}
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
        referrerpolicy="no-referrer"
        class="w-full rounded-b-lg"
        style="min-height: 200px; border: none"
        title="Email content"
        @load="fitHeight"
      />
      <pre
        v-else-if="signal.textBody"
        class="break-words whitespace-pre-wrap px-4 py-3 font-sans text-sm text-ctp-text"
        >{{ signal.textBody }}</pre
      >
      <p v-else class="px-4 py-3 text-sm text-ctp-subtext0">(No content)</p>
    </div>
  </div>
</template>
