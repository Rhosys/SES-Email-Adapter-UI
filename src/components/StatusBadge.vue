<script setup lang="ts">
/**
 * StatusBadge — renders a colored pill for a known status value.
 *
 * ENUM PROP RULE: Every supported status must have an entry in BOTH `styles` and `labels`.
 * To add a new status, add it to the `Status` type AND both maps below.
 * Passing an unsupported value will trigger a dev-mode console error.
 */

type Status = 'active' | 'archived' | 'deleted' | 'quarantine_visible' | 'quarantine_hidden' | 'report_violation'

const props = defineProps<{ status: Status }>()

const styles: Record<Status, string> = {
  active: 'bg-ctp-green/15 text-ctp-green',
  archived: 'bg-ctp-surface1 text-ctp-subtext0',
  deleted: 'bg-ctp-red/15 text-ctp-red',
  quarantine_visible: 'bg-ctp-peach/15 text-ctp-peach',
  quarantine_hidden: 'bg-ctp-surface1 text-ctp-subtext0',
  report_violation: 'bg-ctp-red/15 text-ctp-red',
}

const labels: Record<Status, string> = {
  active: 'Active',
  archived: 'Archived',
  deleted: 'Deleted',
  quarantine_visible: 'Quarantined',
  quarantine_hidden: 'Silently held',
  report_violation: 'Reported',
}

if (import.meta.env.DEV && !(props.status in styles)) {
  console.error(`[StatusBadge] Unsupported status "${props.status}". Add it to the Status type and both maps.`)
}
</script>

<template>
  <span
    class="inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
    :class="styles[status]"
  >
    {{ labels[status] }}
  </span>
</template>
