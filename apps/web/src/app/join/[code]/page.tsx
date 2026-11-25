import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuthView } from "@siq/shared/components/auth/AuthView";
import { getDb } from "@/db";
import { inviteCodes, serverMembers, servers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getAuthBootstrapState } from "@/lib/workspace-data";

export const dynamic = "force-dynamic";

export default async function JoinWithCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const [{ code }, bootstrap, user] = await Promise.all([
    params,
    getAuthBootstrapState(),
    getCurrentUser(),
  ]);

  const normalized = decodeURIComponent(code).trim().toUpperCase();

  if (user) {
    try {
      const db = getDb();
      const [invite] = await db
        .select()
        .from(inviteCodes)
        .where(eq(inviteCodes.code, normalized))
        .limit(1);

      if (
        invite &&
        !invite.revoked &&
        (!invite.expiresAt || invite.expiresAt.getTime() > Date.now()) &&
        invite.usesCount < invite.maxUses
      ) {
        let targetServerId = invite.serverId;
        if (!targetServerId) {
          const [def] = await db.select({ id: servers.id }).from(servers).limit(1);
          targetServerId = def?.id ?? null;
        }
        if (targetServerId) {
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
        }
      }
    } catch {
      // ignore and redirect cleanly
    }
    redirect("/");
  }

  return (
    <AuthView
      initialMode="register"
      initialInviteCode={normalized}
      dbConfigured={bootstrap.dbConfigured}
      schemaReady={bootstrap.schemaReady}
      hasUsers={bootstrap.hasUsers}
      dbError={bootstrap.dbError}
    />
  );
}
