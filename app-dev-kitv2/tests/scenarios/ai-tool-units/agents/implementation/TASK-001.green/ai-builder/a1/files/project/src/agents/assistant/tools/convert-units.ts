import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const KM_PER_MILE = 1.609344;
const UNITS = ['km', 'mi'] as const;
type Unit = (typeof UNITS)[number];

const isUnit = (unit: string): unit is Unit => (UNITS as readonly string[]).includes(unit);

/** A read-only, deterministic tool: distances between kilometres and miles, to two decimals. */
export function createConvertUnitsTool() {
  return tool(
    ({ value, from, to }) => {
      if (!isUnit(from) || !isUnit(to)) return `Supported units: ${UNITS.join(', ')}`;
      const km = from === 'km' ? value : value * KM_PER_MILE;
      const result = to === 'km' ? km : km / KM_PER_MILE;
      return `${result.toFixed(2)} ${to}`;
    },
    {
      name: 'convert_units',
      description: 'Convert a distance between kilometres (km) and miles (mi).',
      schema: z.object({
        value: z.number(),
        from: z.string().min(1).max(32),
        to: z.string().min(1).max(32),
      }),
    },
  );
}
