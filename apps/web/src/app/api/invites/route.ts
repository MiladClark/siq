import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { inviteCodes, servers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getServerMemberPermissions } from "@/lib/server-auth";
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

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let serverId = searchParams.get("serverId");
  const db = getDb();

  if (!serverId) {
    const [defaultSrv] = await db.select({ id: servers.id }).from(servers).limit(1);
    serverId = defaultSrv?.id ?? null;
  }

  if (serverId) {
    const { isMember, permissions } = await getServerMemberPermissions(serverId, user.id);
    if (
      !isMember ||
      (!permissions.administrator && !permissions.manageServer && !permissions.createInvites)
    ) {
      return NextResponse.json(
        { error: "You do not have permission to view invites for this server." },
        { status: 403 }
      );
    }

    const rows = await db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.serverId, serverId))
      .orderBy(desc(inviteCodes.createdAt))
      .limit(50);

    return NextResponse.json({ invites: rows });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
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

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid invite options." },
        { status: 400 }
      );
    }

    const db = getDb();
    let serverId = parsed.data.serverId ?? null;
    if (!serverId) {
      const [defaultSrv] = await db.select({ id: servers.id }).from(servers).limit(1);
      serverId = defaultSrv?.id ?? null;
    }

    if (serverId) {
      const { isMember, permissions } = await getServerMemberPermissions(serverId, user.id);
      if (
        !isMember ||
        (!permissions.administrator && !permissions.manageServer && !permissions.createInvites)
      ) {
        return NextResponse.json(
          { error: "You do not have permission to create invite codes." },
          { status: 403 }
        );
      }
    } else if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { maxUses, expiresInDays } = parsed.data;
    const expiresAt =
      expiresInDays !== null ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const [created] = await db
      .insert(inviteCodes)
      .values({
        code: generateInviteCode(),
        serverId,
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
