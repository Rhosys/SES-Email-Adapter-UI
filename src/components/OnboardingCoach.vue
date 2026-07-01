<script setup lang="ts">
import { ref } from 'vue'
import { useAccountStore } from '@/stores/account'
import { useFeatureTour } from '@/composables/useFeatureTour'
import { useOnboardingCoach } from '@/composables/useOnboardingCoach'
import { api } from '@/lib/api'
import { notify } from '@/lib/notifications'

const accountStore = useAccountStore()
const { startTour } = useFeatureTour()
const { hideCoach } = useOnboardingCoach()

type Step = 'notifications' | 'tour'
const step = ref<Step>('notifications')
const notifState = ref<'idle' | 'granted' | 'denied' | 'unsupported'>('idle')
const completing = ref(false)

async function persist() {
  const id = accountStore.accountId
  if (!id) return
  await api.updateAccount(id, { onboarding: { completed: true } })
  if (accountStore.account?.onboarding) {
    accountStore.account.onboarding.completed = true
  }
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    notifState.value = 'unsupported'
    step.value = 'tour'
    return
  }
  if (Notification.permission === 'granted') {
    notifState.value = 'granted'
    fireDemo()
    step.value = 'tour'
    return
  }
  const permission = await Notification.requestPermission()
  if (permission === 'granted') {
    notifState.value = 'granted'
    fireDemo()
  } else {
    notifState.value = 'denied'
  }
  step.value = 'tour'
}

function fireDemo() {
  setTimeout(() => {
    notify({
      title: 'New email from hello@example.com',
      body: "That's how it works — you'll see these for high-priority emails.",
      onClick: () => { /* demo — no navigation needed */ },
    })
  }, 800)
}

function skipNotifications() {
  step.value = 'tour'
}

async function startTourAndClose() {
  completing.value = true
  await persist()
  completing.value = false
  hideCoach()
  startTour()
}

async function skipTour() {
  completing.value = true
  await persist()
  completing.value = false
  hideCoach()
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-400 ease-out"
      enter-from-class="translate-y-6 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-250 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-6 opacity-0"
    >
      <div
        v-if="true"
        class="fixed bottom-6 right-6 z-50 w-[22rem] overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Getting started walkthrough"
      >
        <!-- Thread-style header -->
        <div class="flex items-start gap-3 border-b border-ctp-surface0 px-4 py-3">
          <!-- Envelope icon -->
          <div class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ctp-mauve/20 text-ctp-mauve">
            <svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M1 3a1 1 0 011-1h12a1 1 0 011 1v.586l-7 4.667L1 3.586V3zm0 1.747V12a1 1 0 001 1h12a1 1 0 001-1V4.747L8 9.333 1 4.747z"/>
            </svg>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-ctp-text">Getting Started</p>
            <p class="truncate text-xs text-ctp-subtext0">From: SES Email Adapter</p>
          </div>
          <button
            class="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-ctp-subtext0 hover:bg-ctp-surface1 hover:text-ctp-text"
            aria-label="Dismiss"
            @click="skipTour"
          >
            <svg class="h-3 w-3" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
            </svg>
          </button>
        </div>

        <!-- Step: notifications -->
        <Transition
          mode="out-in"
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 translate-x-2"
          enter-to-class="opacity-100 translate-x-0"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 translate-x-0"
          leave-to-class="opacity-0 -translate-x-2"
        >
          <div v-if="step === 'notifications'" key="notifications" class="px-4 py-4">
            <div class="mb-3 flex items-center gap-2">
              <span class="text-lg" aria-hidden="true">🔔</span>
              <p class="text-sm font-semibold text-ctp-text">Stay in the loop</p>
            </div>
            <p class="mb-4 text-sm leading-relaxed text-ctp-subtext0">
              Get a browser notification when a new email arrives — so you never miss something
              important while you're in another tab.
            </p>
            <div class="flex gap-2">
              <button
                class="flex-1 rounded-lg bg-ctp-mauve px-3 py-2 text-sm font-medium text-ctp-base transition-opacity hover:opacity-90"
                @click="enableNotifications"
              >
                Enable notifications
              </button>
              <button
                class="rounded-lg border border-ctp-surface1 px-3 py-2 text-sm text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text"
                @click="skipNotifications"
              >
                Skip
              </button>
            </div>
          </div>

          <!-- Step: tour -->
          <div v-else key="tour" class="px-4 py-4">
            <div class="mb-3 flex items-center gap-2">
              <span v-if="notifState === 'granted'" class="text-lg" aria-hidden="true">✅</span>
              <span v-else class="text-lg" aria-hidden="true">🎯</span>
              <p class="text-sm font-semibold text-ctp-text">
                {{ notifState === 'granted' ? 'Notifications enabled!' : 'Quick tour' }}
              </p>
            </div>
            <p v-if="notifState === 'granted'" class="mb-4 text-sm leading-relaxed text-ctp-subtext0">
              A demo notification is on its way. Ready for a 2-minute walkthrough of rules,
              quarantine, labels, and settings?
            </p>
            <p v-else class="mb-4 text-sm leading-relaxed text-ctp-subtext0">
              Take a 2-minute walkthrough to see how rules, quarantine, labels, and settings
              work together.
            </p>
            <div class="flex gap-2">
              <button
                :disabled="completing"
                class="flex-1 rounded-lg bg-ctp-mauve px-3 py-2 text-sm font-medium text-ctp-base transition-opacity hover:opacity-90 disabled:opacity-60"
                @click="startTourAndClose"
              >
                {{ completing ? 'Starting…' : 'Start tour' }}
              </button>
              <button
                :disabled="completing"
                class="rounded-lg border border-ctp-surface1 px-3 py-2 text-sm text-ctp-subtext1 hover:border-ctp-surface2 hover:text-ctp-text disabled:opacity-60"
                @click="skipTour"
              >
                Maybe later
              </button>
            </div>
          </div>
        </Transition>

        <!-- Progress dots -->
        <div class="flex justify-center gap-1.5 pb-3">
          <div
            class="h-1.5 w-1.5 rounded-full transition-colors"
            :class="step === 'notifications' ? 'bg-ctp-mauve' : 'bg-ctp-surface2'"
          />
          <div
            class="h-1.5 w-1.5 rounded-full transition-colors"
            :class="step === 'tour' ? 'bg-ctp-mauve' : 'bg-ctp-surface2'"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
