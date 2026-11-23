import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, serializePrivateUser } from "@/lib/auth";
import { updateProfileSchema } from "@/lib/validators";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid profile update." },
        { status: 400 }
      );
    }

    const db = getDb();
    const updates: Partial<typeof users.$inferInsert> = {
      lastSeenAt: new Date(),
    };

    if (parsed.data.displayName !== undefined) {
      updates.displayName = parsed.data.displayName;
    }
    if (parsed.data.avatarColor !== undefined) {
      updates.avatarColor = parsed.data.avatarColor;
    }
    if (parsed.data.avatarUrl !== undefined) {
      updates.avatarUrl = parsed.data.avatarUrl;
    }
    if (parsed.data.email !== undefined) {
      const [conflict] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, parsed.data.email), ne(users.id, user.id)))
        .limit(1);

      if (conflict) {
        return NextResponse.json(
          { error: "That email is already registered to another account." },
          { status: 409 }
        );
      }
      updates.email = parsed.data.email;
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning();

    return NextResponse.json({ user: serializePrivateUser(updated) });
  } catch (error) {
    console.error("[auth/me PATCH]", error);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
