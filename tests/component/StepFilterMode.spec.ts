import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import StepFilterMode from '@/components/onboarding/StepFilterMode.vue';
import { useOnboardingStore } from '@/stores/onboarding';

vi.mock('@/api/client', () => ({
  api: { onboarding: { setFilterMode: vi.fn().mockResolvedValue(undefined) } }
}));

describe('StepFilterMode', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders the three modes and updates the store on selection', async () => {
    const wrapper = mount(StepFilterMode);
    expect(wrapper.find('[data-testid="mode-strict"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mode-balanced"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mode-permissive"]').exists()).toBe(true);

    const strictRadio = wrapper.find('[data-testid="mode-strict"] input[type="radio"]');
    await strictRadio.trigger('change');

    expect(useOnboardingStore().filterMode).toBe('strict');
  });
});
