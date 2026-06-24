<script setup lang="ts">
defineProps<{ status: string }>()

const styles: Record<string, string> = {
  active: 'bg-ctp-green/15 text-ctp-green',
  archived: 'bg-ctp-surface1 text-ctp-subtext0',
  deleted: 'bg-ctp-red/15 text-ctp-red',
  quarantine_visible: 'bg-ctp-peach/15 text-ctp-peach',
  quarantine_hidden: 'bg-ctp-surface1 text-ctp-subtext0',
}

const labels: Record<string, string> = {
  active: 'Active',
  archived: 'Archived',
  deleted: 'Deleted',
  quarantine_visible: 'Quarantined',
  quarantine_hidden: 'Silently held',
}
</script>

<template>
  <span
    class="inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
    :class="styles[status] ?? 'bg-ctp-surface1 text-ctp-subtext0'"
  >
    {{ labels[status] ?? status }}
  </span>
</template>
