/**
 * Session handling only — deliberately kept free of bcryptjs (see
 * lib/password.ts). middleware.ts runs on the Edge runtime, which doesn't
 * support the Node APIs bcryptjs needs; importing it transitively from
 * here would break middleware at deploy time even though middleware never
 * calls a password function. jose (used below) is Edge-compatible.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "meridian_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET is not set (or too short). Set a random 32+ char string " +
        "in .env.local — see .env.example.",
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  email: string;
  role: "customer" | "admin";
};

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Reads and verifies the session from a raw cookie value (used by
 * middleware, which reads request.cookies directly rather than the
 * next/headers cookies() API).
 */
export async function getSessionFromRequestCookie(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  return verifyToken(token);
}

async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      role: payload.role as "customer" | "admin",
    };
  } catch {
    // Expired or tampered token — treat as logged out rather than throwing,
    // so a stale cookie doesn't 500 the page.
    return null;
  }
}

export { SESSION_COOKIE };
