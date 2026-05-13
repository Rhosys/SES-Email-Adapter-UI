import { storeToRefs } from 'pinia'
import { useThemeStore } from '@/stores/theme'
import { FLAVORS, type Flavor } from '@/themes/catppuccin'

export function useTheme() {
  const store = useThemeStore()
  const { flavor } = storeToRefs(store)
  return {
    flavor,
    flavors: FLAVORS,
    setFlavor: (f: Flavor) => store.setFlavor(f),
  }
}
