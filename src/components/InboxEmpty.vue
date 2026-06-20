<script setup lang="ts">
defineProps<{ tab: 'active' | 'archived' | 'all' }>()

const messages = {
  active: {
    primary: 'Nothing here. Suspicious.',
    secondary:
      'Either nobody loves you or your filters are doing an excellent job. New emails will appear here the moment they arrive.',
  },
  archived: {
    primary: 'Archive is empty',
    secondary:
      'You have not banished anything here yet. Conversations you archive leave your inbox but live on \u2014 like exes on social media.',
  },
  all: {
    primary: 'Zero emails. Total silence.',
    secondary:
      'Not a single electron has graced this inbox. Send yourself something \u2014 we will not judge.',
  },
}
</script>

<template>
  <div class="py-20 text-center">
    <p class="text-base font-medium text-ctp-text">{{ messages[tab].primary }}</p>
    <p class="mx-auto mt-2 max-w-sm text-sm text-ctp-subtext0">{{ messages[tab].secondary }}</p>
  </div>
</template>
