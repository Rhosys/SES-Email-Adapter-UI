<script setup lang="ts">
import type { StatusData } from '@/types/server'

const props = defineProps<{ data: StatusData }>()

const typeLabel: Record<StatusData['statusType'], string> = {
  terms_update: 'Terms of service update',
  privacy_policy: 'Privacy policy update',
  service_notice: 'Service notice',
  welcome: 'Welcome',
  government: 'Government notice',
  account_notification: 'Account notification',
  other: 'Notice',
}

const effectiveDateLabel = (() => {
  if (!props.data.effectiveDate) return null
  return new Date(props.data.effectiveDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
})()
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-ctp-subtext1">{{ data.provider }}</span>
      <span class="text-xs text-ctp-subtext0">{{ typeLabel[data.statusType] }}</span>
    </div>

    <div v-if="data.referenceNumber" class="mt-2">
      <code class="rounded bg-ctp-surface1 px-2 py-0.5 font-mono text-xs text-ctp-text">
        Ref: {{ data.referenceNumber }}
      </code>
    </div>

    <p v-if="effectiveDateLabel" class="mt-1 text-xs text-ctp-subtext0">
      Effective {{ effectiveDateLabel }}
    </p>

    <div v-if="data.documentUrl" class="mt-3">
      <a
        :href="data.documentUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-ctp-blue hover:underline"
      >
        View document →
      </a>
    </div>
  </div>
</template>
