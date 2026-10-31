/** Postgres SQLSTATE 23505. Drizzle wraps driver errors, so check the cause chain too. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (typeof current === 'object' && 'code' in current && current.code === '23505') return true;
    current = typeof current === 'object' && 'cause' in current ? current.cause : undefined;
  }
  return false;
}
