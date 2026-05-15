<script setup lang="ts">
defineProps<{ tab: 'active' | 'archived' | 'all' }>()

const messages = {
  active: {
    primary: 'Your inbox is empty',
    secondary:
      'Incoming emails will appear here once your domain is connected and DNS records are verified.',
  },
  archived: {
    primary: 'Nothing archived yet',
    secondary: 'Emails you archive move here. They stay for reference but won\'t clutter your inbox.',
  },
  all: {
    primary: 'No emails yet',
    secondary:
      'Once your domain is connected and verified, every incoming email will appear here regardless of status.',
  },
}
</script>

<template>
  <div class="py-20 text-center">
    <p class="text-base font-medium text-ctp-text">{{ messages[tab].primary }}</p>
    <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">{{ messages[tab].secondary }}</p>
  </div>
</template>
