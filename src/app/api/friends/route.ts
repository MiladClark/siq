import { and, asc, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { friendships, users } from "@/db/schema";
import { getCurrentUser, serializeUser } from "@/lib/auth";
import { friendRequestSchema } from "@/lib/validators";
import { loadUserFriends } from "@/lib/workspace-data";

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
  const friends = await loadUserFriends(user.id, userMap);

  return NextResponse.json({ friends }, { headers: { "Cache-Control": "no-store" } });
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
    const parsed = friendRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Enter a valid username." },
        { status: 400 }
      );
    }

    const cleanUsername = parsed.data.username.replace(/^@+/, "");
    if (cleanUsername === user.username.toLowerCase()) {
      return NextResponse.json(
        { error: "You cannot add yourself as a friend." },
        { status: 400 }
      );
    }

    const db = getDb();
    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);

    if (!target) {
      return NextResponse.json(
        { error: `No user found with username @${cleanUsername}.` },
        { status: 404 }
      );
    }

    const [existing] = await db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, target.id)),
          and(eq(friendships.requesterId, target.id), eq(friendships.addresseeId, user.id))
        )
      )
      .limit(1);

    if (existing) {
      if (existing.status === "accepted") {
        return NextResponse.json(
          { error: `You are already friends with ${target.displayName}.` },
          { status: 409 }
        );
      }
      if (existing.status === "blocked") {
        return NextResponse.json(
          { error: "Cannot send a friend request to this user." },
          { status: 403 }
        );
      }
      // If they already sent us a request, accept it automatically!
      if (existing.requesterId === target.id && existing.addresseeId === user.id) {
        const [accepted] = await db
          .update(friendships)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(eq(friendships.id, existing.id))
          .returning();

        return NextResponse.json({
          autoAccepted: true,
          friend: {
            friendshipId: accepted.id,
            status: accepted.status,
            direction: "friend" as const,
            user: serializeUser(target),
            createdAt: accepted.createdAt.toISOString(),
          },
        });
      }
      return NextResponse.json(
        { error: `Friend request to ${target.displayName} is already pending.` },
        { status: 409 }
      );
    }

    const [created] = await db
      .insert(friendships)
      .values({
        requesterId: user.id,
        addresseeId: target.id,
        status: "pending",
      })
      .returning();

    return NextResponse.json(
      {
        autoAccepted: false,
        friend: {
          friendshipId: created.id,
          status: created.status,
          direction: "outgoing" as const,
          user: serializeUser(target),
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[friends POST]", error);
    return NextResponse.json({ error: "Failed to send friend request." }, { status: 500 });
  }
}
