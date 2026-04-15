import { describe, expect, it } from 'bun:test';

import { resolveProvinceTargetClick } from './province-refs.ts';

describe('resolveProvinceTargetClick', () => {
  it('maps a coast overlay click back to the base province when only the base is valid', () => {
    expect(resolveProvinceTargetClick(['bul'], 'bul/ec')).toBe('bul');
    expect(resolveProvinceTargetClick(['bul'], 'bul/sc')).toBe('bul');
  });

  it('preserves exact coast targets when the clicked coast is valid', () => {
    expect(resolveProvinceTargetClick(['bul/ec', 'bul/sc'], 'bul/ec')).toBe(
      'bul/ec',
    );
  });

  it('does not guess when a base click is ambiguous across multiple coasts', () => {
    expect(resolveProvinceTargetClick(['bul/ec', 'bul/sc'], 'bul')).toBeNull();
  });

  it('maps a base click to the only matching coast target when it is unambiguous', () => {
    expect(resolveProvinceTargetClick(['spa/nc'], 'spa')).toBe('spa/nc');
  });
});
