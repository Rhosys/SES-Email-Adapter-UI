<script setup lang="ts">
/**
 * Mobile bottom navigation for the Settings tabs: an icon + small label per
 * section, the active one highlighted. Placement (fixed vs. flex child) is the
 * parent's concern — this only renders the row.
 */
defineProps<{
  tabs: readonly { key: string; label: string }[]
  active: string
}>()
defineEmits<{ select: [key: string] }>()

// Stroke-icon path markup keyed by tab. viewBox 0 0 24 24.
const ICONS: Record<string, string> = {
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/>',
  emails:
    '<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.6 7.2"/>',
  domains: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  forwarding: '<path d="M4 12h13M12 7l5 5-5 5"/>',
  email: '<path d="M4 8h9M4 16h5"/><circle cx="17" cy="8" r="2"/><circle cx="11" cy="16" r="2"/>',
  team:
    '<circle cx="9" cy="9" r="3"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5"/><path d="M16 7.2a3 3 0 0 1 0 4.6M21 19c0-2.4-1.5-4-3.8-4.6"/>',
  billing: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
}
</script>

<template>
  <nav
    class="flex items-stretch border-t border-ctp-surface0 bg-ctp-mantle pb-[env(safe-area-inset-bottom)]"
    aria-label="Settings sections"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      class="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 transition-colors"
      :class="active === tab.key ? 'text-ctp-mauve' : 'text-ctp-subtext0 hover:text-ctp-text'"
      :aria-current="active === tab.key ? 'page' : undefined"
      @click="$emit('select', tab.key)"
    >
      <!-- eslint-disable vue/no-v-html -- static, trusted icon markup (no user input) -->
      <svg
        class="h-5 w-5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        v-html="ICONS[tab.key] ?? ''"
      />
      <!-- eslint-enable vue/no-v-html -->
      <span class="w-full truncate text-center text-[10px] leading-tight">{{ tab.label }}</span>
    </button>
  </nav>
</template>
