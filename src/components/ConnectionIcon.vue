<script setup lang="ts">
import { computed } from 'vue'
import { connectionProvider, connectionLabel } from '@/lib/connections'

const props = defineProps<{ connectionId: string }>()

const provider = computed(() => connectionProvider(props.connectionId))
const label = computed(() => connectionLabel(props.connectionId))
</script>

<template>
  <span class="inline-flex shrink-0 items-center justify-center" :aria-label="label" :title="label">
    <!-- Google -->
    <svg v-if="provider === 'google'" viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1-.35-2.1c0-.73.13-1.44.35-2.1V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>

    <!-- GitHub -->
    <svg v-else-if="provider === 'github'" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="text-ctp-text">
      <path d="M12 1C5.92 1 1 5.92 1 12c0 4.87 3.15 8.99 7.52 10.45.55.1.75-.24.75-.53 0-.26-.01-1.13-.01-2.05-2.78.51-3.5-.68-3.72-1.3-.12-.32-.66-1.3-1.13-1.56-.39-.21-.94-.72-.01-.74.87-.01 1.49.8 1.7 1.13.99 1.67 2.57 1.2 3.2.92.1-.71.39-1.2.71-1.47-2.47-.28-5.05-1.24-5.05-5.5 0-1.21.43-2.21 1.13-2.99-.11-.28-.49-1.42.11-2.96 0 0 .92-.29 3.02 1.13a10.2 10.2 0 0 1 2.75-.37c.93 0 1.87.13 2.75.37 2.1-1.43 3.02-1.13 3.02-1.13.6 1.54.22 2.68.11 2.96.7.78 1.13 1.77 1.13 2.99 0 4.28-2.6 5.22-5.07 5.5.4.35.75 1.02.75 2.06 0 1.49-.01 2.69-.01 3.06 0 .29.2.64.76.53A11.01 11.01 0 0 0 23 12c0-6.08-4.92-11-11-11Z" />
    </svg>

    <!-- Microsoft / Azure -->
    <svg v-else-if="provider === 'microsoft'" viewBox="0 0 24 24" width="20" height="20">
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>

    <!-- Apple -->
    <svg v-else-if="provider === 'apple'" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" class="text-ctp-text">
      <path d="M17.05 12.73c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.1-2.01-3.77-2.04-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.82 3.15-.47 7.82 1.3 10.38.86 1.25 1.89 2.66 3.24 2.61 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.28-1.28 3.14-2.54.99-1.46 1.4-2.87 1.42-2.94-.03-.01-2.72-1.04-2.75-4.14ZM14.6 5.11c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-1.09 3.18 1.15.09 2.32-.58 3.04-1.45Z" />
    </svg>

    <!-- Facebook -->
    <svg v-else-if="provider === 'facebook'" viewBox="0 0 24 24" width="20" height="20">
      <path fill="#1877F2" d="M23 12a11 11 0 1 0-12.72 10.87v-7.69H7.5V12h2.78V9.59c0-2.74 1.63-4.26 4.13-4.26 1.2 0 2.45.21 2.45.21v2.7h-1.38c-1.36 0-1.79.85-1.79 1.71V12h3.04l-.49 3.18h-2.55v7.69A11 11 0 0 0 23 12Z" />
    </svg>

    <!-- Fallback: generic link -->
    <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-ctp-subtext1">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  </span>
</template>
