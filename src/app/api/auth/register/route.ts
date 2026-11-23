import { count, eq, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import {
  ADMIN_ROLE_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  ensureAppSchema,
} from "@/db/ensure-schema";
import {
  channelCategories,
  channels,
  inviteCodes,
  memberRoles,
  roles,
  serverMembers,
  servers,
  users,
} from "@/db/schema";
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
    await ensureAppSchema();
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
    let inviteServerId: string | null = null;
    const normalizedCode = inviteCode.trim().toUpperCase();

    if (!isFirstUser && normalizedCode) {
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
      inviteServerId = invite.serverId ?? null;
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
      const [defaultServer] = await db
        .insert(servers)
        .values({
          name: "siq",
          tag: "SIQ",
          accentColor: "#10B981",
          ownerId: createdUser.id,
          isDefault: true,
        })
        .returning();

      const [, adminRole] = await db
        .insert(roles)
        .values([
          {
            serverId: defaultServer.id,
            name: "@everyone",
            color: "#94A3B8",
            position: 0,
            permissions: DEFAULT_EVERYONE_PERMISSIONS,
            isDefault: true,
          },
          {
            serverId: defaultServer.id,
            name: "Admin",
            color: "#10B981",
            position: 10,
            permissions: ADMIN_ROLE_PERMISSIONS,
            isDefault: false,
          },
        ])
        .returning();

      await db.insert(serverMembers).values({
        serverId: defaultServer.id,
        userId: createdUser.id,
      });

      if (adminRole) {
        await db.insert(memberRoles).values({
          serverId: defaultServer.id,
          userId: createdUser.id,
          roleId: adminRole.id,
        });
      }

      const [textCat, voiceCat] = await db
        .insert(channelCategories)
        .values([
          { serverId: defaultServer.id, name: "TEXT", position: 0 },
          { serverId: defaultServer.id, name: "VOICES", position: 1 },
        ])
        .returning();

      const [{ total: channelCount }] = await db.select({ total: count() }).from(channels);
      if (channelCount === 0) {
        await db.insert(channels).values(
          DEFAULT_CHANNELS.map((ch) => ({
            ...ch,
            serverId: defaultServer.id,
            categoryId: ch.type === "voice" ? voiceCat.id : textCat.id,
            createdById: createdUser.id,
          }))
        );
      }
    } else {
      // Join the invited server (or default server if none specified)
      let targetServerId = inviteServerId;
      if (!targetServerId) {
        const [defaultSrv] = await db
          .select({ id: servers.id })
          .from(servers)
          .where(eq(servers.isDefault, true))
          .limit(1);
        targetServerId = defaultSrv?.id ?? null;
      }
      if (targetServerId) {
        await db
          .insert(serverMembers)
          .values({ serverId: targetServerId, userId: createdUser.id })
          .onConflictDoNothing();
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
      { error: "Unable to create account right now." },
      { status: 500 }
    );
  }
}
