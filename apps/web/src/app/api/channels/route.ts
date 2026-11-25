import crypto from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels, servers, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getServerMemberPermissions } from "@/lib/server-auth";
import { createChannelSchema } from "@/lib/validators";

function makeSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  const suffix = crypto.randomBytes(3).toString("hex");
  return ascii ? `${ascii}-${suffix}` : `ch-${suffix}`;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get("serverId");

  const db = getDb();
  const rows = serverId
    ? await db
        .select()
        .from(channels)
        .where(eq(channels.serverId, serverId))
        .orderBy(asc(channels.type), asc(channels.position), asc(channels.createdAt))
    : await db
        .select()
        .from(channels)
        .orderBy(asc(channels.type), asc(channels.position), asc(channels.createdAt));

  return NextResponse.json({
    channels: rows.map((ch) => ({
      id: ch.id,
      serverId: ch.serverId,
      categoryId: ch.categoryId,
      name: ch.name,
      slug: ch.slug,
      type: ch.type,
      description: ch.description,
      isPrivate: Boolean(ch.isPrivate),
      allowedRoleIds: ch.allowedRoleIds ?? [],
      position: ch.position,
      createdById: ch.createdById,
    })),
  });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createChannelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid channel data." },
        { status: 400 }
      );
    }

    const { name, type, description, categoryId, isPrivate, allowedRoleIds } = parsed.data;
    const db = getDb();

    let serverId = parsed.data.serverId ?? null;
    if (!serverId) {
      const [defaultSrv] = await db.select({ id: servers.id }).from(servers).limit(1);
      serverId = defaultSrv?.id ?? null;
    }

    if (serverId) {
      const { isMember, permissions } = await getServerMemberPermissions(
        serverId,
        user.id
      );
      if (!isMember || (!permissions.administrator && !permissions.manageChannels)) {
        return NextResponse.json(
          { error: "You do not have permission to create channels in this server." },
          { status: 403 }
        );
      }
    }

    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(${channels.position}), -1)` })
      .from(channels)
      .where(
        serverId
          ? and(eq(channels.serverId, serverId), eq(channels.type, type))
          : eq(channels.type, type)
      );

    const [created] = await db
      .insert(channels)
      .values({
        serverId,
        categoryId: categoryId ?? null,
        name,
        slug: makeSlug(name),
        type,
        description: description || null,
        isPrivate: Boolean(isPrivate),
        allowedRoleIds: allowedRoleIds ?? [],
        position: Number(maxPos) + 1,
        createdById: user.id,
      })
      .returning();

    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, user.id));

    return NextResponse.json(
      {
        channel: {
          id: created.id,
          serverId: created.serverId,
          categoryId: created.categoryId,
          name: created.name,
          slug: created.slug,
          type: created.type,
          description: created.description,
          isPrivate: Boolean(created.isPrivate),
          allowedRoleIds: created.allowedRoleIds ?? [],
          position: created.position,
          createdById: created.createdById,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[channels POST]", error);
    return NextResponse.json({ error: "Failed to create channel." }, { status: 500 });
  }
}
