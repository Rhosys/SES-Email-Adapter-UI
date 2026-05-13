<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ reply: [] }>()

const pending = ref(false)

async function handleReply() {
  pending.value = true
  emit('reply')
  // Parent calls createDraft asynchronously; reset after a tick
  await Promise.resolve()
  pending.value = false
}
</script>

<template>
  <div class="mt-2 flex justify-start">
    <button
      :disabled="pending"
      class="rounded-lg border border-ctp-surface1 px-4 py-2 text-sm text-ctp-subtext1 transition-colors hover:border-ctp-mauve hover:text-ctp-mauve disabled:opacity-50"
      @click="handleReply"
    >
      + New reply
    </button>
  </div>
</template>
