<script setup lang="ts">
import type { ContentData } from '@/types/server'
import { useClipboard } from '@/composables/useClipboard'

defineProps<{ data: ContentData }>()
const { copied, copy } = useClipboard()

const typeLabel: Record<ContentData['contentType'], string> = {
  newsletter: 'Newsletter',
  promotion: 'Promotion',
  social_digest: 'Social digest',
  product_update: 'Product update',
  announcement: 'Announcement',
}
</script>

<template>
  <div class="rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-ctp-subtext1">{{ data.publisher }}</span>
      <span class="text-xs text-ctp-subtext0">{{ typeLabel[data.contentType] }}</span>
    </div>

    <!-- Discount code -->
    <div v-if="data.discountCode" class="mt-2 flex items-center gap-2">
      <span class="text-xs text-ctp-subtext0">
        {{ data.discountAmount ? `${data.discountAmount} off —` : '' }}
      </span>
      <code
        class="rounded bg-ctp-surface1 px-2 py-0.5 font-mono text-sm font-semibold text-ctp-green"
      >
        {{ data.discountCode }}
      </code>
      <button
        class="rounded border border-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext1 hover:bg-ctp-surface1"
        @click="copy(data.discountCode!)"
      >
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
      <span v-if="data.expiryDate" class="text-xs text-ctp-peach">
        Expires {{ new Date(data.expiryDate).toLocaleDateString() }}
      </span>
    </div>

    <!-- Topics -->
    <div v-if="data.topics?.length" class="mt-2 flex flex-wrap gap-1">
      <span
        v-for="topic in data.topics.slice(0, 3)"
        :key="topic"
        class="rounded-full bg-ctp-surface1 px-2 py-0.5 text-xs text-ctp-subtext0"
      >
        {{ topic }}
      </span>
      <span v-if="data.topics.length > 3" class="text-xs text-ctp-subtext0">
        +{{ data.topics.length - 3 }}
      </span>
    </div>

    <!-- Unsubscribe -->
    <div v-if="data.unsubscribeUrl" class="mt-3">
      <a
        :href="data.unsubscribeUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-ctp-subtext0 hover:text-ctp-text"
      >
        Unsubscribe →
      </a>
    </div>
  </div>
</template>
