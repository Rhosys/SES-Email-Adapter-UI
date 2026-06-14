<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import type { Arc, Signal } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { urgencyStripeColor } from '@/composables/useUrgencyStyle'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { api } from '@/lib/api'
import WorkflowIcon from './WorkflowIcon.vue'
import LabelChip from './LabelChip.vue'
import UrgencyBadge from './UrgencyBadge.vue'
import SignalRow from './SignalRow.vue'

const props = defineProps<{ arc: Arc; selected: boolean; focused?: boolean }>()
const emit = defineEmits<{ 'toggle-select': [id: string] }>()

const now = inject(NOW_KEY)
const accountStore = useAccountStore()
const arcsStore = useArcsStore()

const isUnread = computed(() => false) // unread tracking not in wire shape — TODO requires backend support
const stripeColor = computed(() => urgencyStripeColor(props.arc.urgency))
const timestamp = computed(() =>
  now ? formatRelativeTime(props.arc.lastSignalAt, now.value) : '',
)

const expanded = ref(true)
const signals = ref<Signal[]>([])
const signalsLoading = ref(false)

const bodySnippet = computed(() => {
  if (signals.value.length === 0) return ''
  const latest = signals.value[signals.value.length - 1]
  if (latest.type !== 'email') return ''
  const raw = latest.data.body ?? ''
  // Strip HTML tags to get plain text
  const text = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  return text.slice(0, 200)
})

async function loadSignals() {
  const id = accountStore.accountId
  if (!id) return
  signalsLoading.value = true
  const result = await api.listSignals(id, props.arc.arcId, { limit: 50 })
  signalsLoading.value = false
  if (result.isOk()) {
    signals.value = result.value.signals.filter((s) => s.status !== 'draft')
  }
}

onMounted(() => {
  void loadSignals()
})

async function archiveArc() {
  const id = accountStore.accountId
  if (!id) return
  const result = await api.patchArc(id, props.arc.arcId, { status: 'archived' })
  if (result.isOk()) arcsStore.removeArc(props.arc.arcId)
}

function onSignalUndo() {
  // Signal patched back to draft — refresh the list (draft signals are filtered out)
  signals.value = []
  void loadSignals()
}
</script>

<template>
  <div class="arc-row" :data-arc-id="arc.arcId">
    <!-- Arc row line -->
    <div
      class="group relative flex items-center gap-2 border-b border-ctp-surface0 px-3 py-3 transition-colors hover:bg-ctp-surface0"
      :class="[isUnread ? 'bg-ctp-surface0' : 'bg-ctp-base', focused && 'ring-1 ring-inset ring-ctp-mauve']"
      role="row"
    >
      <!-- Urgency stripe -->
      <div
        class="absolute inset-y-0 left-0 w-0.5 rounded-r"
        :style="{ backgroundColor: stripeColor }"
      />

      <!-- Checkbox -->
      <div class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" :class="{ 'opacity-100': selected }">
        <input
          type="checkbox"
          :checked="selected"
          class="h-4 w-4 rounded border-ctp-overlay0 bg-ctp-surface1 accent-ctp-blue"
          :aria-label="`Select arc: ${arc.summary}`"
          @change="emit('toggle-select', arc.arcId)"
        />
      </div>

      <!-- Workflow icon -->
      <WorkflowIcon :workflow="arc.workflow" />

      <!-- Summary + labels — navigates to detail -->
      <RouterLink :to="{ name: 'arc-detail', params: { id: arc.arcId } }" class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span v-if="arc.senderAddress" class="w-36 shrink-0 truncate text-xs font-medium text-ctp-subtext1">{{ arc.senderAddress }}</span>
          <span v-if="arc.recipientAddress" class="w-28 shrink-0 truncate text-xs text-ctp-subtext0">{{ arc.recipientAddress }}</span>
        </div>
        <p class="truncate text-sm text-ctp-text" :class="{ 'font-semibold': isUnread }">
          {{ arc.subject ?? arc.summary }}
        </p>
        <span class="text-xs text-ctp-subtext0">{{ timestamp }}</span>
        <div class="mt-0.5 flex flex-wrap items-center gap-1">
          <LabelChip v-for="label in arc.labels" :key="label" :label="label" />
        </div>
      </RouterLink>

      <!-- Action buttons — visible on row hover -->
      <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          v-if="arc.status === 'active'"
          class="flex h-7 items-center gap-1 rounded border border-ctp-surface1 px-2 text-xs text-ctp-subtext1 hover:border-ctp-red hover:text-ctp-red"
          title="Archive"
          @click.prevent="archiveArc"
        >
          <svg class="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1.5 2h13l-1 2H2.5L1.5 2zm.5 3h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V5zm4 2v5h5V7H6z"/>
          </svg>
          Archive
        </button>
      </div>

      <!-- Urgency -->
      <div class="flex shrink-0 flex-col items-end gap-1">
        <UrgencyBadge :urgency="arc.urgency" />
      </div>
    </div>

    <!-- Signal child rows -->
    <div v-if="expanded">
      <div v-if="signalsLoading" class="animate-pulse divide-y divide-ctp-surface0">
        <div v-for="i in 3" :key="i" class="flex items-center gap-3 py-2 pl-14 pr-3">
          <div class="h-3 w-24 rounded bg-ctp-surface1" />
          <div class="h-3 flex-1 rounded bg-ctp-surface1" :style="{ width: `${50 + i * 15}%` }" />
          <div class="h-3 w-14 shrink-0 rounded bg-ctp-surface1" />
        </div>
      </div>
      <SignalRow
        v-for="signal in signals"
        :key="signal.signalId"
        :signal="signal"
        @undo="onSignalUndo"
      />
      <p v-if="bodySnippet" class="pl-14 pr-3 py-1 text-xs text-ctp-subtext0 line-clamp-2">{{ bodySnippet }}</p>
      <div
        v-if="!signalsLoading && signals.length === 0"
        class="py-2 pl-14 pr-3 text-xs text-ctp-subtext0"
      >
        No messages
      </div>
    </div>
  </div>
</template>
