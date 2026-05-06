import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StepIndicator from '@/components/onboarding/StepIndicator.vue';

describe('StepIndicator', () => {
  it('marks earlier steps done, current step current, later steps todo', () => {
    const wrapper = mount(StepIndicator, { props: { current: 3 } });
    const items = wrapper.findAll('li');
    expect(items).toHaveLength(5);
    expect(items[0].attributes('data-state')).toBe('done');
    expect(items[1].attributes('data-state')).toBe('done');
    expect(items[2].attributes('data-state')).toBe('current');
    expect(items[2].attributes('aria-current')).toBe('step');
    expect(items[3].attributes('data-state')).toBe('todo');
    expect(items[4].attributes('data-state')).toBe('todo');
  });
});
