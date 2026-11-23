import { redirect } from "next/navigation";
import { AuthView } from "@/components/auth/AuthView";
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

  if (user) {
    redirect("/");
  }

  return (
    <AuthView
      initialMode="register"
      initialInviteCode={decodeURIComponent(code)}
      dbConfigured={bootstrap.dbConfigured}
      schemaReady={bootstrap.schemaReady}
      hasUsers={bootstrap.hasUsers}
      dbError={bootstrap.dbError}
    />
  );
}
