import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channelCategories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getServerMemberPermissions } from "@/lib/server-auth";
import { createCategorySchema } from "@/lib/validators";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; categoryId: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: serverId, categoryId } = await context.params;
  const { isMember, permissions } = await getServerMemberPermissions(serverId, user.id);
  if (!isMember || (!permissions.administrator && !permissions.manageChannels)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid category name." },
        { status: 400 }
      );
    }

    const db = getDb();
    const [updated] = await db
      .update(channelCategories)
      .set({ name: parsed.data.name })
      .where(
        and(
          eq(channelCategories.id, categoryId),
          eq(channelCategories.serverId, serverId)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }

    return NextResponse.json({ category: updated });
  } catch (error) {
    console.error("[categories PATCH]", error);
    return NextResponse.json({ error: "Failed to rename category." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; categoryId: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: serverId, categoryId } = await context.params;
  const { isMember, permissions } = await getServerMemberPermissions(serverId, user.id);
  if (!isMember || (!permissions.administrator && !permissions.manageChannels)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const db = getDb();
  await db
    .delete(channelCategories)
    .where(
      and(
        eq(channelCategories.id, categoryId),
        eq(channelCategories.serverId, serverId)
      )
    );

  return NextResponse.json({ ok: true, id: categoryId });
}
