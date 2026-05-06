import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import StepFilterMode from '@/components/onboarding/StepFilterMode.vue';
import { useOnboardingStore } from '@/stores/onboarding';
import { useAccountStore } from '@/stores/account';

vi.mock('@/api/client', () => ({
  api: { account: { setFilterMode: vi.fn().mockResolvedValue(undefined) } }
}));

describe('StepFilterMode', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAccountStore().accountId = 'test-account';
  });

  it('renders the four real SenderFilterMode options', () => {
    const wrapper = mount(StepFilterMode);
    for (const v of ['notify_new', 'strict', 'sender_match', 'allow_all']) {
      expect(wrapper.find(`[data-testid="mode-${v}"]`).exists()).toBe(true);
    }
  });

  it('updates the store and calls the real account.setFilterMode endpoint on selection', async () => {
    const { api } = await import('@/api/client');
    const wrapper = mount(StepFilterMode);
    await wrapper.find('[data-testid="mode-strict"] input[type="radio"]').trigger('change');
    expect(useOnboardingStore().filterMode).toBe('strict');
    expect(api.account.setFilterMode).toHaveBeenCalledWith('test-account', 'strict');
  });
});
