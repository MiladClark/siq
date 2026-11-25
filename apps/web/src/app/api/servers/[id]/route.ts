import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { servers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getServerMemberPermissions } from "@/lib/server-auth";
import { updateServerSchema } from "@/lib/validators";
import { loadUserServers } from "@/lib/workspace-data";

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

  const { id: serverId } = await context.params;
  const { isMember, permissions } = await getServerMemberPermissions(serverId, user.id);
  if (!isMember || (!permissions.administrator && !permissions.manageServer)) {
    return NextResponse.json(
      { error: "You do not have permission to edit this server." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = updateServerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid server update." },
        { status: 400 }
      );
    }

    const db = getDb();
    const updates: Partial<typeof servers.$inferInsert> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.tag !== undefined) updates.tag = parsed.data.tag || null;
    if (parsed.data.accentColor !== undefined) updates.accentColor = parsed.data.accentColor;
    if (parsed.data.iconUrl !== undefined) updates.iconUrl = parsed.data.iconUrl;
    if (parsed.data.bannerUrl !== undefined) updates.bannerUrl = parsed.data.bannerUrl;

    await db.update(servers).set(updates).where(eq(servers.id, serverId));
    const list = await loadUserServers(user.id);
    const server = list.find((s) => s.id === serverId);
    return NextResponse.json({ server, servers: list });
  } catch (error) {
    console.error("[servers PATCH]", error);
    return NextResponse.json({ error: "Failed to update server." }, { status: 500 });
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

  const { id: serverId } = await context.params;
  const db = getDb();
  const [srv] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
  if (!srv) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }
  if (srv.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json(
      { error: "Only the server owner can delete this server." },
      { status: 403 }
    );
  }

  await db.delete(servers).where(eq(servers.id, serverId));
  return NextResponse.json({ ok: true, id: serverId });
}
