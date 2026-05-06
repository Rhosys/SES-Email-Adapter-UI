<script setup lang="ts">
import { computed, inject } from 'vue'
import type { Arc } from '@/types/server'
import { NOW_KEY } from '@/composables/useRelativeTime'
import { formatRelativeTime } from '@/composables/useFormattedTime'

const props = defineProps<{
  arc: Arc
  pending: boolean
}>()

const emit = defineEmits<{
  (e: 'allowSender', arcId: string): void
  (e: 'blockSender', arcId: string): void
}>()

const now = inject(NOW_KEY)
const timestamp = computed(() => (now ? formatRelativeTime(props.arc.lastSignalAt, now.value) : ''))

const isUntrustedSender = computed(() => props.arc.labels.includes('system:sender:untrusted'))
const matchedRules = computed(() => props.arc.matchedRules ?? [])
</script>

<template>
  <div
    class="flex items-start gap-3 border-b border-ctp-surface0 px-4 py-3 transition-colors hover:bg-ctp-surface0"
    :class="{ 'opacity-50': pending }"
    role="listitem"
  >
    <!-- Quarantine reason badge -->
    <div class="mt-0.5 shrink-0">
      <span
        v-if="isUntrustedSender"
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
          {{ arc.senderAddress ?? arc.summary }}
        </p>
        <span class="shrink-0 text-xs text-ctp-subtext0">{{ timestamp }}</span>
      </div>

      <p class="mt-0.5 truncate text-sm text-ctp-subtext1">{{ arc.summary }}</p>

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

      <!-- Branch A: untrusted sender actions -->
      <div v-if="isUntrustedSender" class="mt-2 flex items-center gap-2">
        <button
          class="rounded bg-ctp-green/15 px-3 py-1 text-xs font-medium text-ctp-green transition-colors hover:bg-ctp-green/25 disabled:opacity-50"
          :disabled="pending"
          @click="emit('allowSender', arc.id)"
        >
          Allow sender
        </button>
        <button
          class="rounded bg-ctp-red/15 px-3 py-1 text-xs font-medium text-ctp-red transition-colors hover:bg-ctp-red/25 disabled:opacity-50"
          :disabled="pending"
          @click="emit('blockSender', arc.id)"
        >
          Block sender
        </button>
      </div>

      <!-- Branch B: matched rules actions -->
      <div v-else-if="matchedRules.length" class="mt-2 flex flex-wrap items-center gap-2">
        <router-link
          to="/rules/new?action=allow"
          class="rounded bg-ctp-green/15 px-3 py-1 text-xs font-medium text-ctp-green transition-colors hover:bg-ctp-green/25"
        >
          Create rule to allow
        </router-link>
        <router-link
          to="/rules/new?action=block"
          class="rounded bg-ctp-red/15 px-3 py-1 text-xs font-medium text-ctp-red transition-colors hover:bg-ctp-red/25"
        >
          Create rule to block
        </router-link>
        <router-link
          v-if="matchedRules[0]"
          :to="`/rules/${matchedRules[0].ruleId}`"
          class="rounded border border-ctp-surface1 px-3 py-1 text-xs text-ctp-subtext0 transition-colors hover:text-ctp-text"
        >
          Edit rule
        </router-link>
        <router-link to="/rules" class="text-xs text-ctp-blue hover:underline">
          View all rules
        </router-link>
      </div>
    </div>
  </div>
</template>
