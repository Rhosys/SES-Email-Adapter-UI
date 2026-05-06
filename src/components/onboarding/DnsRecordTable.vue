<script setup lang="ts">
import type { DnsRecord } from '@/types/server';

defineProps<{ records: DnsRecord[]; title: string }>();

function statusClass(status: DnsRecord['status']): string {
  switch (status) {
    case 'verified': return 'text-green';
    case 'failing':  return 'text-red';
    case 'pending':  return 'text-subtext0';
  }
}

function statusLabel(status: DnsRecord['status']): string {
  switch (status) {
    case 'verified': return '✓ verified';
    case 'failing':  return '✗ failing';
    case 'pending':  return '… pending';
  }
}
</script>

<template>
  <div class="rounded-md border border-surface0 bg-mantle p-3" data-testid="dns-records">
    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-subtext0">{{ title }}</h3>
    <table class="w-full text-left text-sm">
      <thead class="text-xs uppercase text-subtext0">
        <tr><th class="py-1">Type</th><th>Name</th><th>Value</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in records" :key="r.name + ':' + r.type">
          <td class="py-1 pr-2 font-mono text-mauve">{{ r.type }}</td>
          <td class="truncate pr-2 font-mono">{{ r.name }}</td>
          <td class="truncate pr-2 font-mono">{{ r.value }}</td>
          <td :class="statusClass(r.status)">{{ statusLabel(r.status) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
