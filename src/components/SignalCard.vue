<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Signal } from '@/types/server'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'

const props = defineProps<{ signal: Signal }>()
const emit = defineEmits<{ undo: [] }>()

const accountStore = useAccountStore()
const expanded = ref(true)
const undoPending = ref(false)
const undoError = ref<string | null>(null)

const isUserSent = computed(() => props.signal.source === 'user')

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

async function undoSend() {
  if (!accountStore.accountId || undoPending.value) return
  undoPending.value = true
  undoError.value = null
  const result = await api.patchSignal(accountStore.accountId, props.signal.id, { status: 'draft' })
  undoPending.value = false
  if (result.isOk()) {
    emit('undo')
  } else {
    undoError.value = 'Email already delivered — cannot undo'
  }
}

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
      :aria-expanded="expanded"
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
      <span class="ml-2 shrink-0 text-xs text-ctp-subtext0" aria-hidden="true">{{ expanded ? '▲' : '▼' }}</span>
    </button>

    <!-- Email body -->
    <div v-if="expanded" class="border-t border-ctp-surface1">
      <iframe
        v-if="signal.htmlBody"
        :srcdoc="signal.htmlBody"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerpolicy="no-referrer"
        class="w-full"
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

      <!-- Undo send — only on emails the user sent -->
      <div v-if="isUserSent" class="flex items-center justify-between border-t border-ctp-surface0 px-4 py-2">
        <span v-if="undoError" class="text-xs text-ctp-red">{{ undoError }}</span>
        <span v-else class="text-xs text-ctp-subtext0">Sent by you</span>
        <button
          :disabled="undoPending"
          class="text-xs text-ctp-subtext0 underline-offset-2 hover:text-ctp-red hover:underline disabled:opacity-50"
          @click="undoSend"
        >
          {{ undoPending ? 'Undoing…' : 'Undo send' }}
        </button>
      </div>
    </div>
  </div>
</template>
