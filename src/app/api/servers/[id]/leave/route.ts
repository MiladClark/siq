import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { memberRoles, serverMembers, servers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
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

  const { id: serverId } = await context.params;
  const db = getDb();
  const [srv] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
  if (!srv) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }
  if (srv.ownerId === user.id) {
    return NextResponse.json(
      { error: "Server owners cannot leave their own server. Delete it instead." },
      { status: 400 }
    );
  }

  await Promise.all([
    db
      .delete(serverMembers)
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, user.id))),
    db
      .delete(memberRoles)
      .where(and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, user.id))),
  ]);

  return NextResponse.json({ ok: true, id: serverId });
}
