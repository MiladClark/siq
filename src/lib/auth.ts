import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { ensureAppSchema } from "@/db/ensure-schema";
import { users } from "@/db/schema";
import { isDesktopRequest } from "@/lib/desktop-origin";
import {
  AVATAR_PALETTE,
  pickAvatarColor,
  type PrivateUser,
  type PublicUser,
} from "@/lib/types";

export { AVATAR_PALETTE, pickAvatarColor, type PrivateUser, type PublicUser };

export const SESSION_COOKIE_NAME = "siq_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const DESKTOP_SESSION_AUDIENCE = "siq-desktop";

interface SessionPayload {
  sub: string;
  username: string;
  role: "admin" | "member";
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 16) {
    return new TextEncoder().encode(secret);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set to at least 16 characters in production.");
  }
  return new TextEncoder().encode("siq-local-dev-secret-change-in-production");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 11);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function createSessionToken(
  payload: SessionPayload,
  desktop: boolean,
  rememberMe: boolean,
): Promise<string> {
  const token = new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(desktop && !rememberMe ? "1d" : `${SESSION_MAX_AGE_SECONDS}s`);
  if (desktop) token.setAudience(DESKTOP_SESSION_AUDIENCE);
  return token.sign(getSecretKey());
}

async function verifySessionToken(token: string, desktop: boolean): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
      ...(desktop ? { audience: DESKTOP_SESSION_AUDIENCE } : {}),
    });
    if (
      (!desktop && payload.aud !== undefined) ||
      typeof payload.sub !== "string" ||
      typeof payload.username !== "string" ||
      (payload.role !== "admin" && payload.role !== "member")
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function createSignInResponse(
  request: Request,
  user: PrivateUser,
  rememberMe = true,
  status = 200,
) {
  const desktop = isDesktopRequest(request.headers);
  const token = await createSessionToken({ sub: user.id, username: user.username, role: user.role }, desktop, rememberMe);
  if (!desktop) await setSessionCookie(token, rememberMe);

  return NextResponse.json(desktop ? { user, token } : { user }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function setSessionCookie(token: string, rememberMe = true): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(rememberMe ? { maxAge: SESSION_MAX_AGE_SECONDS } : {}),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** Public serializer: strictly strips email so no user can see another user's email. */
export function serializeUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarColor: row.avatarColor,
    avatarUrl: row.avatarUrl,
    bannerUrl: row.bannerUrl,
    bio: row.bio ?? null,
    presenceStatus: row.presenceStatus ?? "online",
    customActivity: row.customActivity ?? null,
    role: row.role,
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Private serializer: ONLY for the currently authenticated user's own session/settings. */
export function serializePrivateUser(row: typeof users.$inferSelect): PrivateUser {
  return {
    ...serializeUser(row),
    email: row.email ?? null,
  };
}

export async function getCurrentUser(): Promise<PrivateUser | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const requestHeaders = await headers();
  const desktop = isDesktopRequest(requestHeaders);
  const token = desktop
    ? /^Bearer ([\w.-]+)$/i.exec(requestHeaders.get("authorization") ?? "")?.[1]
    : (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const session = await verifySessionToken(token, desktop);
  if (!session) {
    return null;
  }

  try {
    await ensureAppSchema();
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, session.sub)).limit(1);
    if (!user) {
      return null;
    }
    return serializePrivateUser(user);
  } catch {
    return null;
  }
}
