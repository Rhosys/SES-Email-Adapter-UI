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
      class="shrink-0 cursor-pointer border-l border-ctp-surface1 px-3 py-2 text-xs transition-colors hover:bg-ctp-surface0 hover:text-ctp-text"
      :class="copied ? 'text-ctp-green' : 'text-ctp-subtext0'"
      :title="copied ? 'Copied!' : 'Copy to clipboard'"
      @click="copy"
    >
      {{ copied ? '✓ Copied' : 'Copy' }}
    </button>
  </div>
</template>
