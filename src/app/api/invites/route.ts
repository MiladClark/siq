import crypto from "node:crypto";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { inviteCodes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createInviteSchema } from "@/lib/validators";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(): string {
  const bytes = crypto.randomBytes(8);
  let partA = "";
  let partB = "";
  for (let i = 0; i < 4; i++) {
    partA += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    partB += CODE_ALPHABET[bytes[i + 4] % CODE_ALPHABET.length];
  }
  return `SIQ-${partA}-${partB}`;
}

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can manage invite codes." }, { status: 403 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt))
    .limit(50);

  return NextResponse.json({ invites: rows });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can create invite codes." }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid invite options." },
        { status: 400 }
      );
    }

    const { maxUses, expiresInDays } = parsed.data;
    const expiresAt =
      expiresInDays !== null ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const db = getDb();
    const [created] = await db
      .insert(inviteCodes)
      .values({
        code: generateInviteCode(),
        createdById: user.id,
        maxUses,
        expiresAt,
      })
      .returning();

    return NextResponse.json({ invite: created }, { status: 201 });
  } catch (error) {
    console.error("[invites POST]", error);
    return NextResponse.json({ error: "Failed to create invite code." }, { status: 500 });
  }
}
