<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import type { AliasSender, SenderPolicy, UnknownSenderPolicy } from '@/types/server'

const props = defineProps<{
  senderAddress: string
  aliasAddress: string
  accountId: string
}>()

const { notify } = useToast()

const loading = ref(true)
const saving = ref(false)
const senderConfig = ref<AliasSender | null>(null)
const aliasPolicy = ref<UnknownSenderPolicy>('quarantine_visible')

const senderDomain = computed(() => props.senderAddress.split('@')[1] ?? props.senderAddress)

const senderPolicyOptions: { value: SenderPolicy; label: string }[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'block_hidden', label: 'Block (hidden)' },
  { value: 'block_reject', label: 'Block (reject)' },
  { value: 'report_violation', label: 'Report violation' },
]

const aliasPolicyOptions: { value: UnknownSenderPolicy; label: string }[] = [
  { value: 'allow_all', label: 'Allow all' },
  { value: 'quarantine_visible', label: 'Quarantine (visible)' },
  { value: 'quarantine_hidden', label: 'Quarantine (hidden)' },
  { value: 'block_hidden', label: 'Block (hidden)' },
  { value: 'block_reject', label: 'Block (reject)' },
  { value: 'report_violation', label: 'Report violation' },
]

onMounted(async () => {
  const [sendersRes, aliasesRes] = await Promise.all([
    api.listAliasSenders(props.accountId, props.aliasAddress),
    api.listAliases(props.accountId),
  ])

  if (sendersRes.isOk()) {
    senderConfig.value = sendersRes.value.find((s) => s.sender === senderDomain.value) ?? null
  }

  if (aliasesRes.isOk()) {
    const alias = aliasesRes.value.find((a) => a.alias === props.aliasAddress)
    if (alias) aliasPolicy.value = alias.unknownSenderPolicy
  }

  loading.value = false
})

async function updateSenderPolicy(policy: SenderPolicy) {
  saving.value = true
  const result = await api.updateAliasSender(props.accountId, props.aliasAddress, senderDomain.value, { policy })
  saving.value = false
  if (result.isOk()) {
    senderConfig.value = result.value
    notify('Sender policy updated')
  }
}

async function updateAliasPolicy(policy: UnknownSenderPolicy) {
  saving.value = true
  const result = await api.updateAlias(props.accountId, props.aliasAddress, { unknownSenderPolicy: policy })
  saving.value = false
  if (result.isOk()) {
    aliasPolicy.value = result.value.unknownSenderPolicy
    notify('Alias policy updated')
  }
}
</script>

<template>
  <div class="w-72 rounded-lg border border-ctp-surface1 bg-ctp-mantle p-4 shadow-lg">
    <div v-if="loading" class="flex items-center justify-center py-4">
      <span class="text-sm text-ctp-subtext0">Loading…</span>
    </div>

    <template v-else>
      <!-- Sender domain -->
      <p class="mb-3 text-xs text-ctp-subtext0">
        Domain: <span class="font-medium text-ctp-text">{{ senderDomain }}</span>
      </p>

      <!-- Sender policy -->
      <div class="mb-3">
        <label for="sender-policy" class="mb-1 block text-xs text-ctp-subtext0">Sender policy</label>
        <select
          id="sender-policy"
          :value="senderConfig?.policy ?? ''"
          :disabled="saving"
          class="w-full rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1.5 text-sm text-ctp-text focus:border-ctp-blue focus:outline-none disabled:opacity-50"
          @change="updateSenderPolicy(($event.target as HTMLSelectElement).value as SenderPolicy)"
        >
          <option v-if="!senderConfig" value="" disabled>No policy set</option>
          <option v-for="opt in senderPolicyOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <!-- Alias unknown sender policy -->
      <div>
        <label for="alias-policy" class="mb-1 block text-xs text-ctp-subtext0">Unknown sender policy</label>
        <select
          id="alias-policy"
          :value="aliasPolicy"
          :disabled="saving"
          class="w-full rounded border border-ctp-surface1 bg-ctp-surface0 px-2 py-1.5 text-sm text-ctp-text focus:border-ctp-blue focus:outline-none disabled:opacity-50"
          @change="updateAliasPolicy(($event.target as HTMLSelectElement).value as UnknownSenderPolicy)"
        >
          <option v-for="opt in aliasPolicyOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
    </template>
  </div>
</template>
