<script setup lang="ts">
import { watch } from 'vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ done: [] }>()

watch(
  () => props.show,
  (v) => {
    if (v) setTimeout(() => emit('done'), 3400)
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="iz">
      <div
        v-if="show"
        class="pointer-events-none fixed inset-0 z-[170] flex flex-col items-center justify-center"
        aria-live="polite"
        aria-atomic="true"
      >
        <!-- Fireworks -->
        <div class="fw" aria-hidden="true">
          <div class="fw-b fw-b1">
            <span /><span /><span /><span /><span /><span />
            <span /><span /><span /><span /><span /><span />
          </div>
          <div class="fw-b fw-b2">
            <span /><span /><span /><span /><span /><span />
            <span /><span /><span /><span /><span /><span />
          </div>
          <div class="fw-b fw-b3">
            <span /><span /><span /><span /><span /><span />
            <span /><span /><span /><span /><span /><span />
          </div>
          <div class="fw-b fw-b4">
            <span /><span /><span /><span /><span /><span />
            <span /><span /><span /><span /><span /><span />
          </div>
          <div class="fw-b fw-b5">
            <span /><span /><span /><span /><span /><span />
            <span /><span /><span /><span /><span /><span />
          </div>
        </div>

        <!-- Message card -->
        <div
          class="relative z-10 rounded-2xl border border-ctp-surface1 bg-ctp-mantle/90 px-10 py-6 text-center shadow-2xl backdrop-blur-sm"
        >
          <p class="text-2xl font-bold text-ctp-text">Inbox zero!</p>
          <p class="mt-1 text-sm text-ctp-subtext0">All caught up — great work.</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Fireworks — CSS-only, no JavaScript ─────────────────────────────────── */
.fw {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.fw-b {
  position: absolute;
  width: 0;
  height: 0;
}
.fw-b1 { left: 20%;  top: 20%; }
.fw-b2 { left: 75%;  top: 18%; }
.fw-b3 { left: 50%;  top: 48%; }
.fw-b4 { left: 16%;  top: 72%; }
.fw-b5 { left: 80%;  top: 66%; }

.fw-b > span {
  position: absolute;
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  top: -3px;
  left: -3px;
  animation: fw-spark 1.5s cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
}
.fw-b > span:nth-child(1)  { --a: 0deg   }
.fw-b > span:nth-child(2)  { --a: 30deg  }
.fw-b > span:nth-child(3)  { --a: 60deg  }
.fw-b > span:nth-child(4)  { --a: 90deg  }
.fw-b > span:nth-child(5)  { --a: 120deg }
.fw-b > span:nth-child(6)  { --a: 150deg }
.fw-b > span:nth-child(7)  { --a: 180deg }
.fw-b > span:nth-child(8)  { --a: 210deg }
.fw-b > span:nth-child(9)  { --a: 240deg }
.fw-b > span:nth-child(10) { --a: 270deg }
.fw-b > span:nth-child(11) { --a: 300deg }
.fw-b > span:nth-child(12) { --a: 330deg }

.fw-b1 > span { animation-delay: 0s;    }
.fw-b2 > span { animation-delay: 0.35s; }
.fw-b3 > span { animation-delay: 0.70s; }
.fw-b4 > span { animation-delay: 0.18s; }
.fw-b5 > span { animation-delay: 0.52s; }

.fw-b1 > span              { background: #cba6f7; }
.fw-b1 > span:nth-child(even) { background: #f5c2e7; }
.fw-b2 > span              { background: #89b4fa; }
.fw-b2 > span:nth-child(even) { background: #74c7ec; }
.fw-b3 > span              { background: #a6e3a1; }
.fw-b3 > span:nth-child(even) { background: #94e2d5; }
.fw-b4 > span              { background: #fab387; }
.fw-b4 > span:nth-child(even) { background: #f9e2af; }
.fw-b5 > span              { background: #f38ba8; }
.fw-b5 > span:nth-child(even) { background: #eba0ac; }

@keyframes fw-spark {
  0%   { transform: rotate(var(--a)) translateY(0)      scale(1);   opacity: 1;   }
  60%  {                                                             opacity: 0.7; }
  100% { transform: rotate(var(--a)) translateY(-120px) scale(0.2); opacity: 0;   }
}

/* ── Card entrance / exit ── */
.iz-enter-active { transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1); }
.iz-leave-active { transition: opacity 0.6s ease; }
.iz-enter-from   { opacity: 0; transform: scale(0.85); }
.iz-leave-to     { opacity: 0; }
</style>
