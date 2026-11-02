import { createHash, randomBytes } from 'node:crypto';

/** Opaque refresh tokens: 256 random bits, stored only as a SHA-256 hash. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
