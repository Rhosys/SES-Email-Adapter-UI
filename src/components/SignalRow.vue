<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountStore } from '@/stores/account'
import { api } from '@/lib/api'
import type { Signal } from '@/types/server'
import { isEmailSignal, isInboundEmailSignal } from '@/lib/signal-guards'
import OverflowMenu from '@/components/ui/OverflowMenu.vue'

const props = defineProps<{ signal: Signal }>()
const emit = defineEmits<{ undo: [] }>()

const router = useRouter()
const accountStore = useAccountStore()

const undoPending = ref(false)
const undoError = ref<string | null>(null)

const isUserSent = computed(() => props.signal.source === 'user')

const fromLabel = computed(() => {
  if (!isEmailSignal(props.signal)) return ''
  const { name, address } = props.signal.data.from
  return name ?? address
})

const snippet = computed(() => {
  if (!isEmailSignal(props.signal)) return ''
  const raw = props.signal.data.body ?? ''
  return raw.trim().replace(/\s+/g, ' ').slice(0, 90)
})

const subjectLine = computed(() => {
  if (!isEmailSignal(props.signal)) return ''
  return props.signal.data.subject
})

const sentAt = computed(() => {
  if (!isInboundEmailSignal(props.signal)) return ''
  return new Date(props.signal.data.receivedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
})

function viewOriginal() {
  void router.push({ name: 'thread-detail', params: { id: props.signal.threadId } })
}

async function undoSend() {
  if (!accountStore.accountId || !props.signal.threadId || undoPending.value) return
  undoPending.value = true
  undoError.value = null
  const result = await api.patchSignal(accountStore.accountId, props.signal.threadId, props.signal.signalId, { status: 'draft' })
  undoPending.value = false
  if (result.isOk()) {
    emit('undo')
  } else {
    undoError.value = 'Already delivered'
  }
}
</script>

<template>
  <button
    type="button"
    class="flex w-full cursor-pointer items-center gap-3 border-b border-ctp-surface0 bg-ctp-base/60 py-2 pl-14 pr-3 text-left text-xs hover:bg-ctp-surface0/60"
    @click="viewOriginal"
  >
    <!-- Sender -->
    <span class="w-28 shrink-0 truncate font-medium text-ctp-subtext1">{{ fromLabel }}</span>

    <!-- Subject · snippet -->
    <span class="min-w-0 flex-1 truncate text-ctp-subtext0">
      <span class="font-medium text-ctp-text">{{ subjectLine }}</span>
      <span v-if="snippet"> · {{ snippet }}</span>
    </span>

    <!-- Undo error -->
    <span v-if="undoError" class="shrink-0 text-ctp-red">{{ undoError }}</span>

    <!-- Timestamp -->
    <span class="shrink-0 text-ctp-subtext0">{{ sentAt }}</span>

    <!-- Overflow menu -->
    <OverflowMenu
      class="shrink-0"
      label="Signal actions"
      menu-width-class="min-w-40"
      icon-class="h-3.5 w-3.5"
      trigger-class="flex h-6 w-6 items-center justify-center rounded text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-text"
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
    </OverflowMenu>
  </button>
</template>
