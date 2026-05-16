<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { loginClient } from '@/lib/auth'

// sidebar=true renders a full-width row with name + hover tooltip on the right
// sidebar=false (default) renders a compact circle with a dropdown tooltip below
defineProps<{ sidebar?: boolean }>()

interface Identity {
  userId?: string
  sub?: string
  email?: string
  name?: string
  picture?: string
}

const identity = ref<Identity | null>(null)
const tooltipVisible = ref(false)

onMounted(() => {
  identity.value = loginClient.getUserIdentity() as Identity | null
})

const picture = computed(() => identity.value?.picture ?? null)
const displayName = computed(() => identity.value?.name ?? identity.value?.email ?? null)
const userId = computed(() => identity.value?.userId ?? identity.value?.sub ?? null)
const email = computed(() => identity.value?.email ?? null)

const initials = computed(() => {
  const n = identity.value?.name
  if (n) {
    const parts = n.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : n.slice(0, 2).toUpperCase()
  }
  const e = identity.value?.email
  if (e) return e.slice(0, 2).toUpperCase()
  return '?'
})
</script>

<template>
  <!-- ── Sidebar mode: full-width row ───────────────────────────────────── -->
  <RouterLink
    v-if="sidebar"
    to="/profile"
    class="group relative flex w-full items-center gap-2.5 rounded-lg py-1.5 text-sm transition-colors text-ctp-subtext1 hover:bg-ctp-surface0/50 hover:text-ctp-text"
    @mouseenter="tooltipVisible = true"
    @mouseleave="tooltipVisible = false"
    @focus="tooltipVisible = true"
    @blur="tooltipVisible = false"
  >
    <span class="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full">
      <img
        v-if="picture"
        :src="picture"
        :alt="displayName ?? 'Profile'"
        class="h-full w-full object-cover"
        referrerpolicy="no-referrer"
      />
      <span
        v-else
        class="flex h-full w-full items-center justify-center bg-ctp-surface1 text-xs font-semibold text-ctp-subtext1"
      >
        {{ initials }}
      </span>
    </span>
    <span class="flex-1 truncate">{{ displayName ?? 'Profile' }}</span>

    <!-- Tooltip (above, since this is at the bottom of the sidebar) -->
    <div
      v-if="tooltipVisible"
      class="absolute bottom-full left-0 z-50 mb-2 min-w-48 rounded-lg border border-ctp-surface1 bg-ctp-mantle py-2 shadow-lg"
      role="tooltip"
    >
      <div class="px-3 py-1">
        <p v-if="displayName" class="text-sm font-medium text-ctp-text">{{ displayName }}</p>
        <p v-if="email && email !== displayName" class="mt-0.5 text-xs text-ctp-subtext0">{{ email }}</p>
        <p v-if="userId" class="mt-0.5 font-mono text-xs text-ctp-subtext0">{{ userId }}</p>
      </div>
      <div class="mt-1 border-t border-ctp-surface0 px-3 pt-1.5">
        <span class="text-xs text-ctp-subtext0">View profile →</span>
      </div>
    </div>
  </RouterLink>

  <!-- ── Compact mode: avatar circle with dropdown tooltip ──────────────── -->
  <RouterLink
    v-else
    to="/profile"
    class="group relative flex items-center"
    @mouseenter="tooltipVisible = true"
    @mouseleave="tooltipVisible = false"
    @focus="tooltipVisible = true"
    @blur="tooltipVisible = false"
  >
    <span class="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-2 ring-transparent transition-all group-hover:ring-ctp-mauve/50">
      <img
        v-if="picture"
        :src="picture"
        :alt="displayName ?? 'Profile'"
        class="h-full w-full object-cover"
        referrerpolicy="no-referrer"
      />
      <span
        v-else
        class="flex h-full w-full items-center justify-center bg-ctp-surface1 text-xs font-semibold text-ctp-subtext1"
      >
        {{ initials }}
      </span>
    </span>

    <!-- Dropdown tooltip -->
    <div
      v-if="tooltipVisible"
      class="absolute right-0 top-full z-50 mt-2 min-w-48 rounded-lg border border-ctp-surface1 bg-ctp-mantle py-2 shadow-lg"
      role="tooltip"
    >
      <div class="px-3 py-1">
        <p v-if="displayName" class="text-sm font-medium text-ctp-text">{{ displayName }}</p>
        <p v-if="email && email !== displayName" class="mt-0.5 text-xs text-ctp-subtext0">{{ email }}</p>
        <p v-if="userId" class="mt-0.5 font-mono text-xs text-ctp-subtext0">{{ userId }}</p>
      </div>
      <div class="mt-1 border-t border-ctp-surface0 px-3 pt-1.5">
        <span class="text-xs text-ctp-subtext0">View profile →</span>
      </div>
    </div>
  </RouterLink>
</template>
