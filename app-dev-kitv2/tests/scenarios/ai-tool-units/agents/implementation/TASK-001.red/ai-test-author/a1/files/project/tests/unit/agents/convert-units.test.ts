import { describe, expect, it } from 'vitest';
import { createConvertUnitsTool } from '../../../src/agents/assistant/tools/convert-units.js';

describe('convert_units tool', () => {
  const convert = createConvertUnitsTool();

  it('AC-0001 converts kilometres to miles and back to two decimals', async () => {
    expect(await convert.invoke({ value: 10, from: 'km', to: 'mi' })).toBe('6.21 mi');
    expect(await convert.invoke({ value: 5, from: 'mi', to: 'km' })).toBe('8.05 km');
  });

  it('AC-0002 lists the supported units for an unknown one', async () => {
    expect(await convert.invoke({ value: 1, from: 'furlongs', to: 'km' })).toBe(
      'Supported units: km, mi',
    );
  });
});
