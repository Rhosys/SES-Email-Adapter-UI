<script setup lang="ts">
// Compact build/version footer, mirroring the console startup banner so the
// running build can be identified on-device (e.g. mobile, where there's no
// console) — useful for support and investigations.
import buildInfo from '@/lib/buildInfo'

const { buildCommit, buildNumber, buildRef, releaseDate } = buildInfo.version
</script>

<template>
  <div class="font-mono text-[10px] leading-relaxed text-ctp-subtext0">
    <p>Build: {{ buildCommit }} | #{{ buildNumber }} | ref:{{ buildRef }}</p>
    <p>Released: {{ releaseDate }}</p>
  </div>
</template>
