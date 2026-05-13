import { defineStore } from 'pinia'
import { applyTheme, FLAVORS, type Flavor } from '@/themes/catppuccin'

const STORAGE_KEY = 'ses-ui.theme'
const DEFAULT_FLAVOR: Flavor = 'mocha'

function readStored(): Flavor {
  if (typeof localStorage === 'undefined') return DEFAULT_FLAVOR
  const v = localStorage.getItem(STORAGE_KEY)
  return (FLAVORS as readonly string[]).includes(v ?? '') ? (v as Flavor) : DEFAULT_FLAVOR
}

export const useThemeStore = defineStore('theme', {
  state: () => ({ flavor: DEFAULT_FLAVOR as Flavor }),
  actions: {
    hydrate(): void {
      this.setFlavor(readStored())
    },
    setFlavor(flavor: Flavor): void {
      this.flavor = flavor
      applyTheme(flavor)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, flavor)
      }
    },
  },
})
