import { describe, it, expect } from 'vitest';
import { FLAVORS, PALETTES } from '@/themes/catppuccin';

describe('catppuccin palettes', () => {
  it('exposes all four flavors', () => {
    expect([...FLAVORS]).toEqual(['latte', 'frappe', 'macchiato', 'mocha']);
  });

  it.each([
    ['mocha', { base: '#1e1e2e', mantle: '#181825', text: '#cdd6f4', mauve: '#cba6f7' }],
    ['latte', { base: '#eff1f5', mantle: '#e6e9ef', text: '#4c4f69', mauve: '#8839ef' }],
    ['frappe', { base: '#303446', mantle: '#292c3c', text: '#c6d0f5', mauve: '#ca9ee6' }],
    ['macchiato', { base: '#24273a', mantle: '#1e2030', text: '#cad3f5', mauve: '#c6a0f6' }]
  ] as const)('%s palette has the canonical anchor colors', (flavor, expected) => {
    const p = PALETTES[flavor];
    expect(p.base).toBe(expected.base);
    expect(p.mantle).toBe(expected.mantle);
    expect(p.text).toBe(expected.text);
    expect(p.mauve).toBe(expected.mauve);
  });
});
