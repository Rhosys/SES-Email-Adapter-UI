<script setup lang="ts">
/**
 * Full-screen canvas fireworks celebration.
 *
 * Runs on an endless loop while mounted: ACTIVE_MS of shells launching, then
 * IDLE_MS of quiet (existing sparks finish fading), then again. Shells launch
 * from a mostly-central mortar just below the screen and fan out across the full
 * width. The animation applies a few "whimsy" touches — additive glow so bursts
 * bloom toward white, a detonation flash, squash-and-stretch streaks, and a
 * twinkle as embers die — so the celebration feels alive rather than mechanical.
 *
 * Purely decorative: the canvas is pointer-events-none and aria-hidden.
 */
import { ref, onMounted, onUnmounted } from 'vue'

// Loop timing: 10s of fireworks, then 5s of nothing, repeating.
const ACTIVE_MS = 10_000
const IDLE_MS = 5_000
const CYCLE_MS = ACTIVE_MS + IDLE_MS

const canvasEl = ref<HTMLCanvasElement | null>(null)

const FIREWORK_COLORS: [number, number, number][] = [
  [203, 166, 247], [245, 194, 231], [137, 180, 250], [116, 199, 236],
  [166, 227, 161], [148, 226, 213], [250, 179, 135], [249, 226, 175],
  [243, 139, 168], [235, 160, 172],
]

interface Particle {
  x: number
  y: number
  px: number  // previous position — the streak's tail (squash & stretch)
  py: number
  vx: number
  vy: number
  alpha: number
  decay: number
  size: number
  color: [number, number, number]
  twinkle: number  // phase offset so embers flicker out of sync
}

interface Shell {
  x: number
  y: number
  px: number
  py: number
  vx: number
  vy: number
  explodeY: number  // y at which to burst — somewhere in the final stretch of the climb
  color: [number, number, number]
}

// A short-lived bloom of light at the moment of detonation — the "impact"
// that sells the explosion before the sparks spread.
interface Flash {
  x: number
  y: number
  radius: number
  maxRadius: number
  alpha: number
  color: [number, number, number]
}

const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${a})`

let raf = 0

function run(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  // ctx is guaranteed non-null below this point; alias for closure narrowing
  const c = ctx

  const dpr = window.devicePixelRatio || 1
  const resize = () => {
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    // setTransform (not scale) so repeated resizes don't compound the DPR scale.
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  const particles: Particle[] = []
  const shells: Shell[] = []
  const flashes: Flash[] = []
  const w = () => canvas.offsetWidth
  const h = () => canvas.offsetHeight
  const random = (min: number, max: number) => Math.random() * (max - min) + min
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!

  // Shells rise under real gravity (deceleration) rather than decaying velocity
  // toward zero — decay alone can stall short of any given height and never
  // arrive, leaving a dot drifting in place forever instead of exploding.
  const SHELL_GRAVITY = 0.15

  function spawnShell() {
    // Launch from a mostly-central mortar just below the screen, so trails arc
    // up into view rather than popping in mid-canvas.
    const ox = w() * 0.5 + random(-w() * 0.08, w() * 0.08)
    const oy = h() + random(20, 80)
    // Aim each shell at a target apex spread across the full width. The offset
    // between the central origin and that target is what fans the shells out to
    // the left and right as well as up, instead of all going straight up.
    const tx = random(w() * 0.05, w() * 0.95)
    const ty = random(h() * 0.1, h() * 0.5)
    const rise = oy - ty
    // vy0 = sqrt(2·g·rise) makes vertical velocity cross zero exactly at ty (the
    // apex); horizontal velocity is whatever carries it from ox to tx in that time.
    const vy = -Math.sqrt(2 * SHELL_GRAVITY * rise)
    const timeToApex = -vy / SHELL_GRAVITY
    const vx = (tx - ox) / timeToApex
    // Burst somewhere in the final 40% of the climb — not always at the very peak.
    const explodeFraction = random(0.6, 1)
    shells.push({
      x: ox,
      y: oy,
      px: ox,
      py: oy,
      vx,
      vy,
      explodeY: oy - rise * explodeFraction,
      color: pick(FIREWORK_COLORS),
    })
  }

  function explode(shell: Shell) {
    // Detonation bloom — a bright flash that expands and fades fast.
    flashes.push({ x: shell.x, y: shell.y, radius: 4, maxRadius: random(50, 90), alpha: 1, color: shell.color })

    // Sparks fly out on a roughly even ring (radial symmetry reads as a real
    // burst), with jittered speed so the shell isn't a perfect circle. A share of
    // the shell's own momentum is carried into every spark, so a burst that goes
    // off mid-arc drifts in the direction it was travelling instead of freezing.
    const count = Math.floor(random(48, 78))
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + random(-0.12, 0.12)
      const speed = random(1.5, 5.5)
      particles.push({
        x: shell.x,
        y: shell.y,
        px: shell.x,
        py: shell.y,
        vx: Math.cos(angle) * speed + shell.vx * 0.35,
        vy: Math.sin(angle) * speed + shell.vy * 0.35,
        alpha: 1,
        decay: random(0.010, 0.022),
        size: random(1.2, 3),
        color: Math.random() > 0.25 ? shell.color : pick(FIREWORK_COLORS),
        twinkle: random(0, Math.PI * 2),
      })
    }
  }

  // Time-driven launcher: launch a shell every ~150–280ms, but only during the
  // active window of each 15s cycle. The rAF loop itself never stops while
  // mounted, so the idle window is simply "spawn nothing and let sparks fade".
  const start = performance.now()
  let nextSpawnAt = start

  function frame(now: number) {
    const inActivePhase = (now - start) % CYCLE_MS < ACTIVE_MS
    if (inActivePhase && now >= nextSpawnAt) {
      spawnShell()
      nextSpawnAt = now + random(150, 280)
    } else if (!inActivePhase) {
      // Don't let a backlog build up during the quiet window — resume promptly
      // when the next active phase begins.
      nextSpawnAt = Math.max(nextSpawnAt, now)
    }

    c.clearRect(0, 0, w(), h())
    // Additive blending: where sparks overlap, light accumulates and the core
    // blooms toward white — the glow that makes the burst feel hot and alive.
    c.globalCompositeOperation = 'lighter'
    c.lineCap = 'round'

    // Detonation flashes — expanding, fast-fading blooms drawn under the sparks.
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]!
      f.radius += (f.maxRadius - f.radius) * 0.28  // ease-out expansion
      f.alpha -= 0.08
      if (f.alpha <= 0) { flashes.splice(i, 1); continue }
      const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius)
      g.addColorStop(0, rgba([255, 255, 255], 0.9 * f.alpha))
      g.addColorStop(0.35, rgba(f.color, 0.55 * f.alpha))
      g.addColorStop(1, rgba(f.color, 0))
      c.fillStyle = g
      c.beginPath()
      c.arc(f.x, f.y, f.radius, 0, Math.PI * 2)
      c.fill()
    }

    // Shells — rise along a curved (slightly drifting, gravity-decelerated) path,
    // drawn as a stretched glowing streak (squash & stretch).
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i]!
      c.globalAlpha = 1
      c.strokeStyle = rgba(s.color, 0.9)
      c.lineWidth = 2.5
      c.beginPath()
      c.moveTo(s.px, s.py)
      c.lineTo(s.x, s.y)
      c.stroke()

      s.px = s.x
      s.py = s.y
      s.x += s.vx
      s.y += s.vy
      s.vy += SHELL_GRAVITY

      // Burst on reaching the (possibly early) explosion height, or at the apex
      // as a fallback should it never quite get there.
      if (s.y <= s.explodeY || s.vy >= 0) {
        explode(s)
        shells.splice(i, 1)
      }
    }

    // Sparks — gravity + air drag, drawn as a streak from previous to current
    // position so fast particles stretch and slowing ones relax into dots.
    const gravity = 0.06
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!
      p.px = p.x
      p.py = p.y
      p.x += p.vx
      p.y += p.vy
      p.vy += gravity
      p.vx *= 0.985
      p.vy *= 0.985
      p.alpha -= p.decay

      if (p.alpha <= 0) {
        particles.splice(i, 1)
        continue
      }

      // Twinkle: once an ember dims past half, flicker it so the burst sparkles
      // out instead of fading uniformly.
      p.twinkle += 0.3
      const flicker = p.alpha < 0.5 ? 0.6 + 0.4 * Math.sin(p.twinkle) : 1
      c.globalAlpha = Math.min(1, p.alpha * flicker)
      c.strokeStyle = rgba(p.color, 1)
      c.lineWidth = p.size
      c.beginPath()
      c.moveTo(p.px, p.py)
      c.lineTo(p.x, p.y)
      c.stroke()
    }

    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'

    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)

  // Return a teardown that also detaches the resize listener.
  return () => window.removeEventListener('resize', resize)
}

let teardown: (() => void) | undefined

onMounted(() => {
  if (canvasEl.value) teardown = run(canvasEl.value)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
  teardown?.()
})
</script>

<template>
  <canvas
    ref="canvasEl"
    class="pointer-events-none fixed inset-0 z-0 h-full w-full"
    aria-hidden="true"
  />
</template>
