<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  value: string
  mono?: boolean
}>()

const copied = ref(false)

function copy() {
  void navigator.clipboard.writeText(props.value).then(() => {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  })
}
</script>

<template>
  <div class="flex overflow-hidden rounded-lg border border-ctp-surface1 bg-ctp-mantle">
    <input
      :value="value"
      readonly
      class="min-w-0 flex-1 cursor-text select-all bg-transparent px-3 py-2 text-sm text-ctp-text"
      :class="mono !== false ? 'font-mono' : ''"
      @click="($event.target as HTMLInputElement).select()"
    />
    <button
      type="button"
      class="shrink-0 cursor-pointer border-l border-ctp-surface1 px-3 py-2 transition-colors hover:bg-ctp-surface0"
      :class="copied ? 'text-ctp-green' : 'text-ctp-subtext0 hover:text-ctp-text'"
      :title="copied ? 'Copied!' : 'Copy to clipboard'"
      @click="copy"
    >
      <!-- Copied checkmark -->
      <svg v-if="copied" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <!-- Copy (double paper) icon -->
      <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  </div>
</template>
