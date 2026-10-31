import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export function createConvertUnitsTool() {
  return tool(
    () => {
      throw new Error('not implemented');
    },
    {
      name: 'convert_units',
      description: 'Convert a distance between kilometres (km) and miles (mi).',
      schema: z.object({ value: z.number(), from: z.string(), to: z.string() }),
    },
  );
}
