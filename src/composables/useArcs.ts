import { storeToRefs } from 'pinia';
import { useArcsStore } from '@/stores/arcs';

export function useArcs() {
  const store = useArcsStore();
  const { items, loading, error, exhausted } = storeToRefs(store);
  return {
    items,
    loading,
    error,
    exhausted,
    loadNextPage: () => store.loadNextPage(),
    byId: (id: string) => store.byId(id),
    reset: () => store.reset()
  };
}
