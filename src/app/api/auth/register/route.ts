import { count, eq, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels, inviteCodes, users } from "@/db/schema";
import {
  createSessionToken,
  hashPassword,
  pickAvatarColor,
  serializePrivateUser,
  setSessionCookie,
} from "@/lib/auth";
import { registerSchema } from "@/lib/validators";

const DEFAULT_CHANNELS = [
  {
    name: "general",
    slug: "general",
    type: "text" as const,
    description: "Main hangout and updates",
    position: 0,
  },
  {
    name: "clips",
    slug: "clips",
    type: "text" as const,
    description: "Screenshots, links, and game clips",
    position: 1,
  },
  {
    name: "Lounge",
    slug: "lounge",
    type: "voice" as const,
    description: "Drop-in voice chat",
    position: 0,
  },
  {
    name: "Gaming",
    slug: "gaming",
    type: "voice" as const,
    description: "Low-latency squad voice & screen share",
    position: 1,
  },
];

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Database is not configured yet. Set DATABASE_URL first." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "Invalid registration input.";
      return NextResponse.json({ error: firstIssue }, { status: 400 });
    }

    const { username, email, displayName, password, inviteCode } = parsed.data;
    const db = getDb();

    const [existing] = await db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(or(eq(users.username, username), eq(users.email, email)))
      .limit(1);

    if (existing) {
      if (existing.username === username) {
        return NextResponse.json(
          { error: "That username is already taken." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const [{ total: userCount }] = await db.select({ total: count() }).from(users);
    const isFirstUser = userCount === 0;

    let validInviteId: string | null = null;

    if (!isFirstUser) {
      const normalizedCode = inviteCode.trim().toUpperCase();
      if (!normalizedCode) {
        return NextResponse.json(
          { error: "An invite code is required to join this workspace." },
          { status: 403 }
        );
      }

      const [invite] = await db
        .select()
        .from(inviteCodes)
        .where(eq(inviteCodes.code, normalizedCode))
        .limit(1);

      if (!invite || invite.revoked) {
        return NextResponse.json(
          { error: "Invalid or revoked invite code." },
          { status: 403 }
        );
      }

      if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
        return NextResponse.json(
          { error: "This invite code has expired." },
          { status: 403 }
        );
      }

      if (invite.usesCount >= invite.maxUses) {
        return NextResponse.json(
          { error: "This invite code has reached its usage limit." },
          { status: 403 }
        );
      }

      validInviteId = invite.id;
    }

    const passwordHash = await hashPassword(password);
    const avatarColor = pickAvatarColor(username);
    const role = isFirstUser ? "admin" : "member";

    const [createdUser] = await db
      .insert(users)
      .values({
        username,
        email,
        displayName,
        passwordHash,
        avatarColor,
        role,
      })
      .returning();

    if (validInviteId) {
      await db
        .update(inviteCodes)
        .set({ usesCount: sql`${inviteCodes.usesCount} + 1` })
        .where(eq(inviteCodes.id, validInviteId));
    }

    if (isFirstUser) {
      const [{ total: channelCount }] = await db.select({ total: count() }).from(channels);
      if (channelCount === 0) {
        await db.insert(channels).values(
          DEFAULT_CHANNELS.map((ch) => ({
            ...ch,
            createdById: createdUser.id,
          }))
        );
      }
    }

    const token = await createSessionToken({
      sub: createdUser.id,
      username: createdUser.username,
      role: createdUser.role,
    });
    await setSessionCookie(token);

    return NextResponse.json({ user: serializePrivateUser(createdUser) }, { status: 201 });
  } catch (error) {
    console.error("[auth/register]", error);
    return NextResponse.json(
      { error: "Unable to create account right now. Please check your database connection." },
      { status: 500 }
    );
  }
}
