<script setup lang="ts">
import { computed, inject } from 'vue'
import type { Signal } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'

const props = defineProps<{
  signal: Signal
  pending: boolean
}>()

const emit = defineEmits<{
  (e: 'allow', signalId: string): void
  (e: 'reject', signalId: string): void
  (e: 'rejectForAlias', signalId: string, toAddress: string, fromAddress: string): void
}>()

const now = inject(NOW_KEY)
const timestamp = computed(() =>
  now ? formatRelativeTime(props.signal.receivedAt, now.value) : '',
)

const matchedRules = computed(() => props.signal.matchedRules ?? [])
const isHidden = computed(() => props.signal.status === 'quarantine_hidden')
const toAddress = computed(() => props.signal.to[0]?.address ?? '')
</script>

<template>
  <div
    class="border-b border-ctp-surface0 transition-colors hover:bg-ctp-surface0"
    :class="{ 'opacity-50': pending, 'bg-ctp-mantle/40': isHidden }"
    role="listitem"
  >
    <div class="flex items-start gap-3 px-4 py-3">
      <!-- Quarantine reason badge -->
      <div class="mt-0.5 shrink-0">
        <span
          v-if="signal.matchedRules?.some((r) => r.labels.includes('system:sender:untrusted'))"
          class="inline-block rounded-full bg-ctp-peach/15 px-2 py-0.5 text-xs font-medium text-ctp-peach"
        >
          Untrusted sender
        </span>
        <span
          v-else-if="matchedRules.length"
          class="inline-block rounded-full bg-ctp-mauve/15 px-2 py-0.5 text-xs font-medium text-ctp-mauve"
        >
          Rule matched
        </span>
        <span
          v-else
          class="inline-block rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext0"
        >
          Quarantined
        </span>
      </div>

      <!-- Content -->
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-sm font-medium text-ctp-text">
            {{ signal.from.name || signal.from.address }}
            <span class="font-normal text-ctp-subtext0">&lt;{{ signal.from.address }}&gt;</span>
          </p>
          <div class="flex shrink-0 items-center gap-1.5">
            <span
              v-if="isHidden"
              class="rounded bg-ctp-surface1 px-1.5 py-0.5 text-xs text-ctp-subtext0"
              >Silently held</span
            >
            <span class="text-xs text-ctp-subtext0">{{ timestamp }}</span>
          </div>
        </div>

        <p class="mt-0.5 truncate text-sm text-ctp-subtext1">{{ signal.subject }}</p>

        <!-- Matched rule IDs -->
        <div v-if="matchedRules.length" class="mt-1 flex flex-wrap gap-1">
          <span
            v-for="rule in matchedRules"
            :key="rule.ruleId"
            class="inline-block rounded bg-ctp-surface1 px-1.5 py-0.5 font-mono text-xs text-ctp-subtext0"
          >
            {{ rule.ruleId }}
          </span>
        </div>

        <!-- Actions -->
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <button
            class="rounded bg-ctp-green/15 px-3 py-1.5 text-xs font-medium text-ctp-green transition-colors hover:bg-ctp-green/25 disabled:opacity-50"
            :disabled="pending"
            @click="emit('allow', signal.id)"
          >
            Allow
          </button>
          <button
            class="rounded bg-ctp-red/15 px-3 py-1.5 text-xs font-medium text-ctp-red transition-colors hover:bg-ctp-red/25 disabled:opacity-50"
            :disabled="pending"
            title="Return a delivery failure to the sender's server"
            @click="emit('reject', signal.id)"
          >
            Reject
          </button>
          <router-link
            :to="`/rules/new?signalId=${signal.id}&action=block_hidden`"
            class="rounded border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 transition-colors hover:text-ctp-text"
          >
            Create rule to reject similar
          </router-link>
          <button
            v-if="toAddress"
            class="rounded border border-ctp-surface1 px-3 py-1.5 text-xs text-ctp-subtext1 transition-colors hover:text-ctp-text disabled:opacity-50"
            :disabled="pending"
            :title="`Block ${signal.from.address} for ${toAddress}`"
            @click="emit('rejectForAlias', signal.id, toAddress, signal.from.address)"
          >
            Reject sender using this alias
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
