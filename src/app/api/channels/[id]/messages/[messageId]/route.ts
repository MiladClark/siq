import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, isDatabaseConfigured } from "@/db";
import { messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; messageId: string }> }
) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id: channelId, messageId } = await context.params;
  const db = getDb();

  const [existing] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.channelId, channelId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  if (existing.authorId !== user.id && user.role !== "admin") {
    return NextResponse.json(
      { error: "You can only delete your own messages." },
      { status: 403 }
    );
  }

  await db.delete(messages).where(eq(messages.id, messageId));
  return NextResponse.json({ ok: true, id: messageId });
}
