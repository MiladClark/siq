import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { roles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getServerMemberPermissions } from "@/lib/server-auth";
import { createRoleSchema } from "@/lib/validators";

export async function POST(
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
  if (!isMember || (!permissions.administrator && !permissions.manageRoles)) {
    return NextResponse.json(
      { error: "You do not have permission to create roles." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid role data." },
        { status: 400 }
      );
    }

    const db = getDb();
    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(${roles.position}), 0)` })
      .from(roles)
      .where(eq(roles.serverId, serverId));

    const [created] = await db
      .insert(roles)
      .values({
        serverId,
        name: parsed.data.name,
        color: parsed.data.color,
        position: Number(maxPos) + 1,
        permissions: parsed.data.permissions,
        isDefault: false,
      })
      .returning();

    return NextResponse.json({ role: created }, { status: 201 });
  } catch (error) {
    console.error("[roles POST]", error);
    return NextResponse.json({ error: "Failed to create role." }, { status: 500 });
  }
}
