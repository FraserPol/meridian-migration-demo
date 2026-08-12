/**
 * Session handling only — deliberately kept free of bcryptjs (see
 * lib/password.ts). See the comment on lib/password.ts for why that
 * split no longer strictly matters as of Next.js 16's proxy.ts (which
 * runs Node.js, not Edge) but is kept anyway. jose (used below) works in
 * both runtimes regardless.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAuthSecret } from "@/lib/vault";

const SESSION_COOKIE = "meridian_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

async function getSecretKey(headers?: Pick<Headers, "get">): Promise<Uint8Array> {
  const secret = await getAuthSecret(headers);
  if (secret.length < 16) {
    throw new Error(
      "AUTH_SECRET (or Vault's app-config AUTH_SECRET) is set but too short " +
        "— need a random 32+ char string. See .env.example.",
    );
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  userId: string;
  email: string;
  role: "customer" | "admin";
};

export async function createSession(
  payload: SessionPayload,
  headers?: Pick<Headers, "get">,
): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(await getSecretKey(headers));

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

export async function getSession(headers?: Pick<Headers, "get">): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token, headers);
}

/**
 * Reads and verifies the session from a raw cookie value (used by
 * middleware, which reads request.cookies directly rather than the
 * next/headers cookies() API).
 */
export async function getSessionFromRequestCookie(
  token: string | undefined,
  headers?: Pick<Headers, "get">,
): Promise<SessionPayload | null> {
  if (!token) return null;
  return verifyToken(token, headers);
}

async function verifyToken(
  token: string,
  headers?: Pick<Headers, "get">,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await getSecretKey(headers));
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
