<script setup lang="ts">
defineProps<{ tab: 'active' | 'archived' | 'all' }>()

const messages = {
  active: {
    primary: 'Your inbox is ready and waiting',
    secondary:
      'Once your domain is verified, every email sent to it lands here. Takes about 2 minutes to set up — add your domain in Settings to get started.',
  },
  archived: {
    primary: 'Nothing archived yet',
    secondary:
      'Emails you archive disappear from your inbox but stay here for reference. A clean inbox without losing anything.',
  },
  all: {
    primary: 'No emails yet',
    secondary:
      'Every email — active, quarantined, and archived — shows up here once your domain is connected. Add one in Settings to start receiving.',
  },
}
</script>

<template>
  <div class="py-20 text-center">
    <p class="text-base font-medium text-ctp-text">{{ messages[tab].primary }}</p>
    <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">{{ messages[tab].secondary }}</p>
  </div>
</template>
