<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'ghost'; type?: 'button' | 'submit' }>(), {
  variant: 'primary',
  type: 'button',
})
</script>

<template>
  <button
    :type="type"
    class="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium"
    :class="
      variant === 'primary' ? 'bg-mauve text-base hover:opacity-90' : 'text-text hover:bg-surface0'
    "
  >
    <slot />
  </button>
</template>
