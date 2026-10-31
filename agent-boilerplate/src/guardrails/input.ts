/**
 * Cheap, deterministic checks on user input before any model call. They catch the obvious
 * cases; the real defence is architectural (untrusted content is delimited and treated as
 * data, tools are least-privilege, writes need confirmation).
 */
const INJECTION_PATTERNS: { reason: string; pattern: RegExp }[] = [
  {
    reason: 'override-instructions',
    pattern:
      /\b(ignore|disregard|forget)\b.{0,40}\b(previous|prior|above|all|your)\b.{0,20}\b(instructions|rules|prompt)/i,
  },
  {
    reason: 'reveal-system-prompt',
    pattern:
      /\b(reveal|print|show|repeat|leak)\b.{0,40}\b(system|hidden|initial)\b.{0,10}\b(prompt|instructions|message)/i,
  },
  {
    reason: 'role-hijack',
    pattern: /\byou are now\b|\bact as (an? )?(unrestricted|jailbroken|developer mode)/i,
  },
  { reason: 'fake-role-tag', pattern: /<\/?(system|assistant|tool)>|^\s*(system|assistant)\s*:/im },
];

export interface InputAssessment {
  allowed: boolean;
  reasons: string[];
}

export function assessInput(text: string, options: { mode: 'block' | 'log' }): InputAssessment {
  const reasons = INJECTION_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ reason }) => reason,
  );
  return { allowed: options.mode === 'log' || reasons.length === 0, reasons };
}

/** Wraps retrieved or user-supplied content so the model can tell data from instructions. */
export function asUntrustedDocument(attributes: Record<string, string>, content: string): string {
  const attrs = Object.entries(attributes)
    .map(([key, value]) => `${key}="${value.replace(/"/g, "'")}"`)
    .join(' ');
  const safe = content.replace(/<\/?document[^>]*>/gi, '');
  return `<document ${attrs}>\n${safe}\n</document>`;
}
