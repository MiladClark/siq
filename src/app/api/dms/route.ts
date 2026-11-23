import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { dmConversations, users } from "@/db/schema";
import { getCurrentUser, serializeUser } from "@/lib/auth";
import { openDmSchema } from "@/lib/validators";
import { loadUserDms } from "@/lib/workspace-data";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = getDb();
  const memberRows = await db.select().from(users).orderBy(asc(users.createdAt));
  const userMap = new Map(memberRows.map((m) => [m.id, serializeUser(m)]));
  const conversations = await loadUserDms(user.id, userMap);

  return NextResponse.json(
    { conversations },
    { headers: { "Cache-Control": "no-store" } }
  );
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
    const parsed = openDmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid target user." },
        { status: 400 }
      );
    }

    const { targetUserId } = parsed.data;
    if (targetUserId === user.id) {
      return NextResponse.json(
        { error: "Cannot open a direct message with yourself." },
        { status: 400 }
      );
    }

    const db = getDb();
    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const [userAId, userBId] =
      user.id < target.id ? [user.id, target.id] : [target.id, user.id];

    const [existing] = await db
      .select()
      .from(dmConversations)
      .where(
        and(eq(dmConversations.userAId, userAId), eq(dmConversations.userBId, userBId))
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({
        conversation: {
          id: existing.id,
          peer: serializeUser(target),
          lastMessageAt: existing.lastMessageAt.toISOString(),
          lastMessagePreview: null,
          lastMessageAuthorId: null,
          createdAt: existing.createdAt.toISOString(),
        },
      });
    }

    const [created] = await db
      .insert(dmConversations)
      .values({ userAId, userBId })
      .returning();

    return NextResponse.json(
      {
        conversation: {
          id: created.id,
          peer: serializeUser(target),
          lastMessageAt: created.lastMessageAt.toISOString(),
          lastMessagePreview: null,
          lastMessageAuthorId: null,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[dms POST]", error);
    return NextResponse.json(
      { error: "Failed to open direct message." },
      { status: 500 }
    );
  }
}
