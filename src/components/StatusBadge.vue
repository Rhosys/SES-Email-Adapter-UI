<script setup lang="ts">
/**
 * StatusBadge — renders a colored pill for a known status value.
 *
 * ENUM PROP RULE: Every supported status must have an entry in BOTH `styles` and `labels`.
 * To add a new status, add it to the `Status` type AND both maps below.
 * Passing an unsupported value will trigger a console error.
 */
import type { ArcStatus, QuarantineStatus } from '@/types/server'

type Status = ArcStatus | QuarantineStatus

const props = defineProps<{ status: Status }>()

const styles: Record<Status, string> = {
  active: 'bg-ctp-green/15 text-ctp-green',
  archived: 'bg-ctp-surface1 text-ctp-subtext0',
  deleted: 'bg-ctp-red/15 text-ctp-red',
  report_violation: 'bg-ctp-red/15 text-ctp-red',
  quarantine_visible: 'bg-ctp-peach/15 text-ctp-peach',
  quarantine_hidden: 'bg-ctp-surface1 text-ctp-subtext0',
}

const labels: Record<Status, string> = {
  active: 'Active',
  archived: 'Archived',
  deleted: 'Deleted',
  report_violation: 'Reported',
  quarantine_visible: 'Quarantined',
  quarantine_hidden: 'Silently held',
}

if (!(props.status in styles)) {
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
