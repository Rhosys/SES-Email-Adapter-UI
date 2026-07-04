<script lang="ts">
/**
 * Canonical field styling shared by the desktop search `<input>` and the
 * mobile tap-to-navigate facade, so the two entry points can never drift.
 */
export const SEARCH_FIELD_CLASS =
  'h-7 w-full rounded-md border border-ctp-surface1 bg-ctp-base pl-8 pr-3 text-sm text-ctp-text placeholder:text-ctp-subtext0 focus:border-ctp-mauve focus:outline-none'
</script>

<script setup lang="ts">
// Presentational shell: the relative wrapper + the overlaid magnifier icon.
// The actual field (live input + lookahead on desktop, facade button on
// mobile) is provided via the default slot and styled with SEARCH_FIELD_CLASS.
</script>

<template>
  <div class="relative flex-1">
    <svg
      class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ctp-subtext0"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85a1.007 1.007 0 00-.115-.099zm-5.242 1.156a5.5 5.5 0 110-11 5.5 5.5 0 010 11z"
      />
    </svg>
    <slot />
  </div>
</template>
