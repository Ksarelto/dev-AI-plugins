import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../../src/lib/money.js';

describe('formatMoney', () => {
  it('AC-0001 formats EUR minor units with two decimals and the ISO code', () => {
    expect(formatMoney(1234, 'EUR')).toBe('12.34 EUR');
  });

  it('AC-0003 shows JPY without decimals', () => {
    expect(formatMoney(1234, 'JPY')).toBe('1234 JPY');
  });
});
