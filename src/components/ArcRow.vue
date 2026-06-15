<script setup lang="ts">
import { computed, inject } from 'vue'
import { RouterLink } from 'vue-router'
import type { Arc } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'
import { useAccountStore } from '@/stores/account'
import { useArcsStore } from '@/stores/arcs'
import { api } from '@/lib/api'

const props = defineProps<{ arc: Arc; selected: boolean; focused?: boolean }>()
const emit = defineEmits<{ 'toggle-select': [id: string] }>()

const now = inject(NOW_KEY)
const accountStore = useAccountStore()
const arcsStore = useArcsStore()

const timestamp = computed(() =>
  now ? formatRelativeTime(props.arc.lastSignalAt, now.value) : '',
)

async function archiveArc() {
  const id = accountStore.accountId
  if (!id) return
  const result = await api.patchArc(id, props.arc.arcId, { status: 'archived' })
  if (result.isOk()) arcsStore.removeArc(props.arc.arcId)
}

async function deleteArc() {
  const id = accountStore.accountId
  if (!id) return
  const result = await api.patchArc(id, props.arc.arcId, { status: 'deleted' })
  if (result.isOk()) arcsStore.removeArc(props.arc.arcId)
}
</script>

<template>
  <div class="arc-row" :data-arc-id="arc.arcId">
    <div
      class="group relative flex items-center gap-2 border-b border-ctp-surface0 px-3 py-2.5 transition-colors hover:bg-ctp-surface0"
      :class="[focused && 'ring-1 ring-inset ring-ctp-mauve']"
      role="row"
    >
      <!-- Checkbox -->
      <div class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" :class="{ 'opacity-100': selected }">
        <input
          type="checkbox"
          :checked="selected"
          class="h-4 w-4 rounded border-ctp-overlay0 bg-ctp-surface1 accent-ctp-blue"
          :aria-label="`Select thread: ${arc.summary}`"
          @change="emit('toggle-select', arc.arcId)"
        />
      </div>

      <!-- Main content — navigates to detail -->
      <RouterLink :to="{ name: 'arc-detail', params: { id: arc.arcId } }" class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="w-40 shrink-0 truncate text-sm font-semibold text-ctp-text">{{ arc.senderAddress ?? 'Unknown' }}</span>
          <span class="flex-1 truncate text-sm text-ctp-subtext1">{{ arc.subject ?? arc.summary }}</span>
          <span class="shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
        </div>
        <div class="mt-0.5 flex items-center gap-1.5">
          <span
            v-for="label in arc.labels"
            :key="label"
            class="h-2 w-2 shrink-0 rounded-full bg-ctp-mauve"
          />
          <span v-if="arc.summary && arc.subject" class="truncate text-xs text-ctp-subtext0">{{ arc.summary }}</span>
        </div>
      </RouterLink>

      <!-- Action buttons — visible on row hover -->
      <div class="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          v-if="arc.status === 'active'"
          class="flex h-7 items-center gap-1 rounded border border-ctp-surface1 px-2 text-xs text-ctp-subtext1 hover:border-ctp-mauve hover:text-ctp-mauve"
          title="Archive"
          @click.prevent="archiveArc"
        >
          <svg class="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M1.5 2h13l-1 2H2.5L1.5 2zm.5 3h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V5zm4 2v5h5V7H6z"/>
          </svg>
        </button>
        <button
          class="flex h-7 items-center rounded border border-ctp-surface1 px-2 text-ctp-subtext0 hover:border-ctp-red hover:text-ctp-red"
          title="Delete"
          @click.prevent="deleteArc"
        >
          <svg class="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
