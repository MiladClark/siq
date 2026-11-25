import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { channelCategories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getServerMemberPermissions } from "@/lib/server-auth";
import { createCategorySchema } from "@/lib/validators";

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
  if (!isMember || (!permissions.administrator && !permissions.manageChannels)) {
    return NextResponse.json(
      { error: "You do not have permission to create categories." },
      { status: 403 }
    );
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
    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(${channelCategories.position}), -1)` })
      .from(channelCategories)
      .where(eq(channelCategories.serverId, serverId));

    const [created] = await db
      .insert(channelCategories)
      .values({
        serverId,
        name: parsed.data.name,
        position: Number(maxPos) + 1,
      })
      .returning();

    return NextResponse.json(
      {
        category: {
          id: created.id,
          serverId: created.serverId,
          name: created.name,
          position: created.position,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[categories POST]", error);
    return NextResponse.json({ error: "Failed to create category." }, { status: 500 });
  }
}
