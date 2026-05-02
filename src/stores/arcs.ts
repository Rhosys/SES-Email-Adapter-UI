import { defineStore } from 'pinia';
import type { Arc, ArcStatus, Workflow } from '@/types/server';
import { api } from '@/api/client';
import { useAccountStore } from './account';

interface ArcsState {
  items: Arc[];
  cursor: string | null;
  loading: boolean;
  error: string | null;
  exhausted: boolean;
  filter: { status?: ArcStatus; workflow?: Workflow; label?: string };
}

export const useArcsStore = defineStore('arcs', {
  state: (): ArcsState => ({
    items: [],
    cursor: null,
    loading: false,
    error: null,
    exhausted: false,
    filter: {}
  }),
  getters: {
    byId: (s) => (id: string) => s.items.find((a) => a.id === id) ?? null
  },
  actions: {
    async loadNextPage(): Promise<void> {
      if (this.loading || this.exhausted) return;
      const { accountId } = useAccountStore();
      if (!accountId) {
        this.error = 'No account selected';
        return;
      }
      this.loading = true;
      this.error = null;
      try {
        const page = await api.arcs.list(accountId, {
          ...(this.cursor !== null ? { cursor: this.cursor } : {}),
          ...this.filter
        });
        this.items.push(...page.items);
        this.cursor = page.nextCursor ?? null;
        this.exhausted = !page.nextCursor;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load arcs';
      } finally {
        this.loading = false;
      }
    },
    setFilter(filter: ArcsState['filter']): void {
      this.filter = filter;
      this.reset();
    },
    reset(): void {
      this.items = [];
      this.cursor = null;
      this.exhausted = false;
      this.error = null;
    }
  }
});
