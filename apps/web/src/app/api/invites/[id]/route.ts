import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { inviteCodes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getServerMemberPermissions } from "@/lib/server-auth";

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
    .from(inviteCodes)
    .where(eq(inviteCodes.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Invite code not found." }, { status: 404 });
  }

  let allowed = user.role === "admin" || existing.createdById === user.id;
  if (!allowed && existing.serverId) {
    const { isMember, permissions } = await getServerMemberPermissions(
      existing.serverId,
      user.id
    );
    allowed = isMember && (permissions.administrator || permissions.manageServer);
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "You do not have permission to revoke this invite." },
      { status: 403 }
    );
  }

  const [updated] = await db
    .update(inviteCodes)
    .set({ revoked: true })
    .where(eq(inviteCodes.id, id))
    .returning();

  return NextResponse.json({ invite: updated });
}
