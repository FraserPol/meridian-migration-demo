/**
 * Password hashing only — kept separate from lib/session.ts on purpose.
 * bcryptjs uses Node APIs (process.nextTick, setImmediate) that the Edge
 * runtime doesn't support; middleware.ts must never import this file,
 * even transitively. Node runtime route handlers and Server Actions
 * (login) are fine.
 *
 * Deliberately NOT using the `server-only` import guard here (unlike
 * lib/db/index.ts): this module is also imported directly by
 * scripts/seed.ts via tsx, outside of Next's bundler — and `server-only`
 * hard-throws unless loaded through Next's special "react-server" export
 * condition, which tsx doesn't set. Nothing in this codebase imports
 * bcryptjs from a Client Component, so the guard isn't protecting against
 * a real mistake here, just adding friction for the seed script.
 */
import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
