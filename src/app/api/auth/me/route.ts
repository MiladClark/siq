import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, serializeUser } from "@/lib/auth";
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

    const updates: Partial<typeof users.$inferInsert> = {
      lastSeenAt: new Date(),
    };
    if (parsed.data.displayName !== undefined) {
      updates.displayName = parsed.data.displayName;
    }
    if (parsed.data.avatarColor !== undefined) {
      updates.avatarColor = parsed.data.avatarColor;
    }

    const db = getDb();
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning();

    return NextResponse.json({ user: serializeUser(updated) });
  } catch (error) {
    console.error("[auth/me PATCH]", error);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
