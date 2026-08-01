<script setup lang="ts">
import { computed } from 'vue'
import logger from '@/lib/logger'
import type { ResourceAsset } from '@/types/server'

const props = defineProps<{
  asset: ResourceAsset
}>()

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

const showWalletButton = computed(() => props.asset.type === 'pkpass' && props.asset.url)

const walletButtonLabel = computed(() => {
  if (isIos()) return 'Add to Apple Wallet'
  if (isAndroid()) return 'Add to Wallet'
  return 'Download Pass'
})

function handleWalletClick() {
  if (isAndroid()) {
    logger.track({
      title: 'wallet_download_android',
      assetType: props.asset.type,
      label: props.asset.label,
    })
  }
  window.open(props.asset.url, '_blank')
}

const assetTypeLabel = computed(() => {
  switch (props.asset.type) {
    case 'qr_code': return 'QR Code'
    case 'barcode': return 'Barcode'
    case 'pkpass': return 'Pass'
    default: return 'Asset'
  }
})
</script>

<template>
  <div class="flex items-center gap-3 rounded-md border border-ctp-surface0 bg-ctp-base px-3 py-2">
    <!-- Icon for asset type -->
    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-ctp-surface0">
      <!-- QR code icon -->
      <svg
        v-if="asset.type === 'qr_code'"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-ctp-subtext0"
      >
        <rect x="2" y="2" width="8" height="8" rx="1" />
        <rect x="14" y="2" width="8" height="8" rx="1" />
        <rect x="2" y="14" width="8" height="8" rx="1" />
        <rect x="14" y="14" width="4" height="4" rx="0" />
        <line x1="22" y1="14" x2="22" y2="14.01" />
        <line x1="22" y1="18" x2="22" y2="22" />
        <line x1="18" y1="22" x2="18" y2="22.01" />
      </svg>
      <!-- Barcode icon -->
      <svg
        v-else-if="asset.type === 'barcode'"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-ctp-subtext0"
      >
        <path d="M3 5v14" /><path d="M8 5v14" /><path d="M12 5v14" />
        <path d="M17 5v14" /><path d="M21 5v14" /><path d="M6 5v14" />
      </svg>
      <!-- PKPass / wallet icon -->
      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="text-ctp-subtext0"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M2 10h20" />
      </svg>
    </div>

    <!-- Label and value -->
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <span class="text-[10px] font-medium uppercase text-ctp-subtext0">{{ assetTypeLabel }}</span>
      </div>
      <p class="truncate text-sm text-ctp-text">{{ asset.label }}</p>
    </div>

    <!-- Wallet button for pkpass assets -->
    <button
      v-if="showWalletButton"
      type="button"
      class="shrink-0 rounded-md bg-ctp-surface0 px-3 py-1.5 text-xs font-medium text-ctp-text transition-colors hover:bg-ctp-surface1"
      @click.stop="handleWalletClick"
    >
      {{ walletButtonLabel }}
    </button>
  </div>
</template>
