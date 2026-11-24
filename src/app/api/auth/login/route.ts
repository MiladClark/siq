import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { ensureAppSchema } from "@/db/ensure-schema";
import { users } from "@/db/schema";
import {
  createSessionToken,
  serializePrivateUser,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { loginSchema } from "@/lib/validators";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Database is not configured yet. Set DATABASE_URL first." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid credentials." },
        { status: 400 }
      );
    }

    const identifier = (parsed.data.identifier || parsed.data.username || "").trim().toLowerCase();
    const { password, rememberMe } = parsed.data;
    await ensureAppSchema();
    const db = getDb();

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "Incorrect username/email or password." },
        { status: 401 }
      );
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Incorrect username/email or password." },
        { status: 401 }
      );
    }

    const [updated] = await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();

    const token = await createSessionToken({
      sub: updated.id,
      username: updated.username,
      role: updated.role,
    });
    await setSessionCookie(token, rememberMe);

    return NextResponse.json({ user: serializePrivateUser(updated) });
  } catch (error) {
    console.error("[auth/login]", error);
    return NextResponse.json(
      { error: "Unable to sign in right now." },
      { status: 500 }
    );
  }
}
