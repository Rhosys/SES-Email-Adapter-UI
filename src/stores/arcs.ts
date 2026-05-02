import { defineStore } from 'pinia';
import type { Arc } from '@/types/server';
import { api } from '@/api/client';

interface ArcsState {
  items: Arc[];
  cursor: string | null;
  loading: boolean;
  error: string | null;
  exhausted: boolean;
}

export const useArcsStore = defineStore('arcs', {
  state: (): ArcsState => ({
    items: [],
    cursor: null,
    loading: false,
    error: null,
    exhausted: false
  }),
  getters: {
    byId: (s) => (id: string) => s.items.find((a) => a.id === id) ?? null
  },
  actions: {
    async loadNextPage(): Promise<void> {
      if (this.loading || this.exhausted) return;
      this.loading = true;
      this.error = null;
      try {
        const page = await api.arcs.list({ cursor: this.cursor });
        this.items.push(...page.items);
        this.cursor = page.cursor;
        this.exhausted = page.cursor === null;
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load arcs';
      } finally {
        this.loading = false;
      }
    },
    reset(): void {
      this.items = [];
      this.cursor = null;
      this.exhausted = false;
      this.error = null;
    }
  }
});
