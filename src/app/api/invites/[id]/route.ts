import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { inviteCodes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

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
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can revoke invite codes." }, { status: 403 });
  }

  const { id } = await context.params;
  const db = getDb();

  const [updated] = await db
    .update(inviteCodes)
    .set({ revoked: true })
    .where(eq(inviteCodes.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Invite code not found." }, { status: 404 });
  }

  return NextResponse.json({ invite: updated });
}
