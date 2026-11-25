import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import {
  ADMIN_ROLE_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
} from "@/db/ensure-schema";
import {
  channelCategories,
  channels,
  memberRoles,
  roles,
  serverMembers,
  servers,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createServerSchema } from "@/lib/validators";
import { loadUserServers } from "@/lib/workspace-data";

function uniqueRoomSlug(prefix: string): string {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const list = await loadUserServers(user.id);
  return NextResponse.json({ servers: list }, { headers: { "Cache-Control": "no-store" } });
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
    const parsed = createServerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid server details." },
        { status: 400 }
      );
    }

    const db = getDb();
    const [createdServer] = await db
      .insert(servers)
      .values({
        name: parsed.data.name,
        tag: parsed.data.tag || null,
        accentColor: parsed.data.accentColor,
        iconUrl: parsed.data.iconUrl ?? null,
        bannerUrl: parsed.data.bannerUrl ?? null,
        ownerId: user.id,
        isDefault: false,
      })
      .returning();

    const [, adminRole] = await db
      .insert(roles)
      .values([
        {
          serverId: createdServer.id,
          name: "@everyone",
          color: "#94A3B8",
          position: 0,
          permissions: DEFAULT_EVERYONE_PERMISSIONS,
          isDefault: true,
        },
        {
          serverId: createdServer.id,
          name: "Admin",
          color: parsed.data.accentColor,
          position: 10,
          permissions: ADMIN_ROLE_PERMISSIONS,
          isDefault: false,
        },
      ])
      .returning();

    await db.insert(serverMembers).values({
      serverId: createdServer.id,
      userId: user.id,
    });

    if (adminRole) {
      await db.insert(memberRoles).values({
        serverId: createdServer.id,
        userId: user.id,
        roleId: adminRole.id,
      });
    }

    const [textCat, voiceCat] = await db
      .insert(channelCategories)
      .values([
        { serverId: createdServer.id, name: "TEXT", position: 0 },
        { serverId: createdServer.id, name: "VOICES", position: 1 },
      ])
      .returning();

    await db.insert(channels).values([
      {
        serverId: createdServer.id,
        categoryId: textCat.id,
        name: "general",
        slug: uniqueRoomSlug("general"),
        type: "text",
        description: `Welcome to ${createdServer.name}`,
        position: 0,
        createdById: user.id,
      },
      {
        serverId: createdServer.id,
        categoryId: voiceCat.id,
        name: "Lounge",
        slug: uniqueRoomSlug("lounge"),
        type: "voice",
        description: "Drop-in voice chat",
        position: 0,
        createdById: user.id,
      },
      {
        serverId: createdServer.id,
        categoryId: voiceCat.id,
        name: "Gaming",
        slug: uniqueRoomSlug("gaming"),
        type: "voice",
        description: "Squad voice & screen share",
        position: 1,
        createdById: user.id,
      },
    ]);

    const updatedServers = await loadUserServers(user.id);
    const createdDetail = updatedServers.find((s) => s.id === createdServer.id);

    return NextResponse.json(
      { server: createdDetail, servers: updatedServers },
      { status: 201 }
    );
  } catch (error) {
    console.error("[servers POST]", error);
    return NextResponse.json({ error: "Failed to create server." }, { status: 500 });
  }
}
