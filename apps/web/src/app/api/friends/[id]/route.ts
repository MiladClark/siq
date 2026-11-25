import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { friendships } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const body = (await request.json()) as { action?: string };
    const action = body.action;
    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(friendships)
      .where(eq(friendships.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Friend request not found." }, { status: 404 });
    }

    if (existing.addresseeId !== user.id && existing.requesterId !== user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (action === "accept") {
      if (existing.addresseeId !== user.id) {
        return NextResponse.json(
          { error: "Only the recipient can accept a friend request." },
          { status: 403 }
        );
      }
      await db
        .update(friendships)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(friendships.id, id));
      return NextResponse.json({ ok: true, status: "accepted" });
    }

    await db.delete(friendships).where(eq(friendships.id, id));
    return NextResponse.json({ ok: true, status: "removed" });
  } catch (error) {
    console.error("[friends PATCH]", error);
    return NextResponse.json({ error: "Failed to update friend request." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(friendships)
    .where(eq(friendships.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Friendship not found." }, { status: 404 });
  }
  if (existing.requesterId !== user.id && existing.addresseeId !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await db.delete(friendships).where(eq(friendships.id, id));
  return NextResponse.json({ ok: true, id });
}
