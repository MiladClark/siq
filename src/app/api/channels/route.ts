import crypto from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channels, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createChannelSchema } from "@/lib/validators";

function makeSlug(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  const suffix = crypto.randomBytes(2).toString("hex");
  return ascii ? `${ascii}-${suffix}` : `ch-${suffix}`;
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(channels)
    .orderBy(asc(channels.type), asc(channels.position), asc(channels.createdAt));

  return NextResponse.json({
    channels: rows.map((ch) => ({
      id: ch.id,
      name: ch.name,
      slug: ch.slug,
      type: ch.type,
      description: ch.description,
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

    const { name, type, description } = parsed.data;
    const db = getDb();

    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(${channels.position}), -1)` })
      .from(channels)
      .where(eq(channels.type, type));

    const [created] = await db
      .insert(channels)
      .values({
        name,
        slug: makeSlug(name),
        type,
        description: description || null,
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
          name: created.name,
          slug: created.slug,
          type: created.type,
          description: created.description,
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
