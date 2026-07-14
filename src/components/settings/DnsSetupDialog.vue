<script setup lang="ts">
import { watch, ref, nextTick, onBeforeUnmount } from 'vue'
import type { DnsRecord } from '@/types/server'
import DnsRecordList from '@/components/DnsRecordList.vue'

const props = defineProps<{
  open: boolean
  domain: { domain: string; records?: DnsRecord[] } | null
  recheckPending: boolean
}>()

const emit = defineEmits<{
  close: []
  recheck: []
}>()

const dialogRef = ref<HTMLDivElement | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
  if (e.key === 'Tab' && dialogRef.value) {
    const focusable = dialogRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await nextTick()
      dialogRef.value?.querySelector<HTMLElement>('button')?.focus()
      document.addEventListener('keydown', onKeydown)
    } else {
      document.removeEventListener('keydown', onKeydown)
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Transition name="dns-setup-fade">
    <div
      v-if="open && domain"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-ctp-base/80"
      aria-hidden="true"
      @click.self="emit('close')"
    >
      <div
        ref="dialogRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dns-setup-title"
        class="mx-4 w-full max-w-lg rounded-xl border border-ctp-surface1 bg-ctp-mantle p-6 shadow-2xl"
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 id="dns-setup-title" class="text-base font-semibold text-ctp-text">
            DNS Setup — {{ domain.domain }}
          </h2>
          <button
            type="button"
            class="rounded-lg p-1 text-ctp-subtext0 transition-colors hover:bg-ctp-surface0 hover:text-ctp-text"
            aria-label="Close"
            @click="emit('close')"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <DnsRecordList
          v-if="domain.records?.length"
          :records="domain.records"
          :rechecked="domain.records.some((r) => r.currentValue !== undefined) || domain.records.every((r) => r.status !== 'pending')"
          :recheck-pending="recheckPending"
          :show-recheck="true"
          @recheck="emit('recheck')"
        />
        <p v-else class="text-sm text-ctp-subtext0">
          Loading DNS records… Click Re-check below to fetch them.
        </p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dns-setup-fade-enter-active,
.dns-setup-fade-leave-active {
  transition: opacity 0.15s ease;
}
.dns-setup-fade-enter-from,
.dns-setup-fade-leave-to {
  opacity: 0;
}
</style>
