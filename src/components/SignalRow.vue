<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { Signal } from '@/types/server'

const props = defineProps<{ signal: Signal }>()
const emit = defineEmits<{ undo: [] }>()

const router = useRouter()
const accountStore = useAccountStore()

const menuOpen = ref(false)
const undoPending = ref(false)
const undoError = ref<string | null>(null)

const isUserSent = computed(() => props.signal.source === 'user')

const fromLabel = computed(() => {
  const { name, address } = props.signal.from
  return name ?? address
})

const snippet = computed(() => {
  const raw = props.signal.textBody ?? props.signal.htmlBody?.replace(/<[^>]+>/g, '') ?? ''
  return raw.trim().replace(/\s+/g, ' ').slice(0, 90)
})

const sentAt = computed(() =>
  new Date(props.signal.receivedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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
    undoError.value = 'Already delivered'
  }
}
</script>

<template>
  <div class="flex items-center gap-3 border-b border-ctp-surface0 bg-ctp-base/60 py-2 pl-14 pr-3 text-xs hover:bg-ctp-surface0/60">
    <!-- Sender -->
    <span class="w-28 shrink-0 truncate font-medium text-ctp-subtext1">{{ fromLabel }}</span>

    <!-- Subject · snippet -->
    <span class="min-w-0 flex-1 truncate text-ctp-subtext0">
      <span class="font-medium text-ctp-text">{{ signal.subject }}</span>
      <span v-if="snippet"> · {{ snippet }}</span>
    </span>

    <!-- Undo error -->
    <span v-if="undoError" class="shrink-0 text-ctp-red">{{ undoError }}</span>

    <!-- Timestamp -->
    <span class="shrink-0 text-ctp-subtext0">{{ sentAt }}</span>

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
        class="absolute right-0 top-full z-20 min-w-40 rounded-lg border border-ctp-surface1 bg-ctp-mantle py-1 shadow-lg"
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
</template>
