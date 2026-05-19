<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Signal } from '@/types/server'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'

const props = defineProps<{ signal: Signal }>()
const emit = defineEmits<{ undo: [] }>()

const router = useRouter()
const accountStore = useAccountStore()
const expanded = ref(true)
const menuOpen = ref(false)
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

function viewOriginal() {
  menuOpen.value = false
  void router.push({ name: 'arc-detail', params: { id: props.signal.arcId } })
}

async function undoSend() {
  menuOpen.value = false
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
    <div class="flex items-center px-4 py-3">
      <button
        class="min-w-0 flex-1 text-left"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
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
      </button>

      <!-- Undo error inline -->
      <span v-if="undoError" class="mr-2 shrink-0 text-xs text-ctp-red">{{ undoError }}</span>

      <!-- Collapse toggle -->
      <span class="mr-2 shrink-0 text-xs text-ctp-subtext0" aria-hidden="true">{{ expanded ? '▲' : '▼' }}</span>

      <!-- Overflow menu -->
      <div class="relative shrink-0">
        <button
          class="flex h-6 w-6 items-center justify-center rounded text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-text"
          aria-label="Signal actions"
          aria-haspopup="true"
          :aria-expanded="menuOpen"
          @click.stop="menuOpen = !menuOpen"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="2.5" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13.5" r="1.5" />
          </svg>
        </button>

        <div
          v-if="menuOpen"
          class="absolute right-0 top-full z-20 min-w-44 rounded-lg border border-ctp-surface1 bg-ctp-mantle py-1 shadow-lg"
          role="menu"
        >
          <button
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
            role="menuitem"
            @click="viewOriginal"
          >
            View original email
          </button>
          <button
            v-if="isUserSent"
            :disabled="undoPending"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ctp-red hover:bg-ctp-surface0 disabled:opacity-50"
            role="menuitem"
            @click="undoSend"
          >
            {{ undoPending ? 'Undoing…' : 'Undo send' }}
          </button>
        </div>

        <!-- Click-outside backdrop -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions,vuejs-accessibility/click-events-have-key-events -->
        <div v-if="menuOpen" class="fixed inset-0 z-10" @click="menuOpen = false" />
      </div>
    </div>

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
    </div>
  </div>
</template>
