import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { inviteCodes, serverMembers, servers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { loadUserServers } from "@/lib/workspace-data";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { code?: string };
    const raw = (body.code ?? "").trim();
    // Accept either raw code ("SIQ-XXXX-XXXX") or full invite URL ("https://.../join/SIQ-XXXX-XXXX")
    const codeMatch = raw.match(/\/join\/([^/?#\s]+)/i);
    const normalizedCode = (codeMatch ? codeMatch[1] : raw).trim().toUpperCase();

    if (!normalizedCode) {
      return NextResponse.json({ error: "Enter an invite code or link." }, { status: 400 });
    }

    const db = getDb();
    const [invite] = await db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.code, normalizedCode))
      .limit(1);

    if (!invite || invite.revoked) {
      return NextResponse.json({ error: "Invalid or revoked invite code." }, { status: 404 });
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "This invite code has expired." }, { status: 410 });
    }
    if (invite.usesCount >= invite.maxUses) {
      return NextResponse.json(
        { error: "This invite code has reached its usage limit." },
        { status: 410 }
      );
    }

    let targetServerId = invite.serverId;
    if (!targetServerId) {
      const [defaultSrv] = await db.select({ id: servers.id }).from(servers).limit(1);
      targetServerId = defaultSrv?.id ?? null;
    }

    if (!targetServerId) {
      return NextResponse.json({ error: "Target server not found." }, { status: 404 });
    }

    const [already] = await db
      .select({ id: serverMembers.id })
      .from(serverMembers)
      .where(
        and(
          eq(serverMembers.serverId, targetServerId),
          eq(serverMembers.userId, user.id)
        )
      )
      .limit(1);

    if (!already) {
      await db
        .insert(serverMembers)
        .values({ serverId: targetServerId, userId: user.id })
        .onConflictDoNothing();

      await db
        .update(inviteCodes)
        .set({ usesCount: sql`${inviteCodes.usesCount} + 1` })
        .where(eq(inviteCodes.id, invite.id));
    }

    const updatedServers = await loadUserServers(user.id);
    const joined = updatedServers.find((s) => s.id === targetServerId);
    return NextResponse.json({
      server: joined,
      servers: updatedServers,
      alreadyMember: Boolean(already),
    });
  } catch (error) {
    console.error("[servers/join POST]", error);
    return NextResponse.json({ error: "Failed to join server." }, { status: 500 });
  }
}
