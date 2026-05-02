import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UrgencyBadge from '@/components/inbox/UrgencyBadge.vue';

describe('UrgencyBadge', () => {
  it.each([
    ['critical', 'text-red'],
    ['high', 'text-mauve'],
    ['normal', 'text-blue'],
    ['low', 'text-subtext0']
  ] as const)('renders %s with %s', (urgency, expectedClass) => {
    const wrapper = mount(UrgencyBadge, { props: { urgency } });
    expect(wrapper.classes()).toContain(expectedClass);
    expect(wrapper.attributes('aria-label')).toBe(`${urgency} urgency`);
    expect(wrapper.attributes('data-testid')).toBe('urgency-badge');
  });
});
