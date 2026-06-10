<script setup lang="ts">
import AsyncButton from '@/components/ui/AsyncButton.vue'

defineProps<{ action: () => Promise<unknown> }>()
</script>

<template>
  <div class="mt-2 flex justify-start">
    <AsyncButton
      :action="action"
      variant="outline"
      class="rounded-lg border-ctp-surface1 px-4 py-2 text-ctp-subtext1 hover:border-ctp-mauve hover:text-ctp-mauve"
    >
      + New reply
    </AsyncButton>
  </div>
</template>
