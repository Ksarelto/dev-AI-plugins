import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/** A read-only, deterministic tool: the model cannot know the current date on its own. */
export function createCurrentTimeTool(now: () => Date = () => new Date()) {
  return tool(
    ({ timeZone }) => {
      try {
        return new Intl.DateTimeFormat('en-GB', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone,
        }).format(now());
      } catch {
        return `Unknown time zone "${timeZone}". Use an IANA name such as Europe/Warsaw.`;
      }
    },
    {
      name: 'get_current_time',
      description: 'Get the current date and time in an IANA time zone.',
      schema: z.object({ timeZone: z.string().min(1).max(64).default('UTC') }),
    },
  );
}
