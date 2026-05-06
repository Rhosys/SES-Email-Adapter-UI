import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UrgencyBadge from '@/components/inbox/UrgencyBadge.vue';

describe('UrgencyBadge', () => {
  it.each([
    ['critical', 'text-red'],
    ['high', 'text-peach'],
    ['low', 'text-overlay0']
  ] as const)('renders %s with %s', (urgency, expectedClass) => {
    const wrapper = mount(UrgencyBadge, { props: { urgency } });
    expect(wrapper.classes()).toContain(expectedClass);
    expect(wrapper.attributes('aria-label')).toBe(`${urgency} urgency`);
    expect(wrapper.attributes('data-testid')).toBe('urgency-badge');
  });

  it('renders normal urgency without an accent color', () => {
    const wrapper = mount(UrgencyBadge, { props: { urgency: 'normal' } });
    expect(wrapper.attributes('data-urgency')).toBe('normal');
    // No color token — "no accent" per spec.
    for (const cls of ['text-red', 'text-peach', 'text-overlay0', 'text-mauve']) {
      expect(wrapper.classes()).not.toContain(cls);
    }
  });

  it('renders nothing for silent urgency', () => {
    const wrapper = mount(UrgencyBadge, { props: { urgency: 'silent' } });
    expect(wrapper.find('[data-testid="urgency-badge"]').exists()).toBe(false);
  });
});
