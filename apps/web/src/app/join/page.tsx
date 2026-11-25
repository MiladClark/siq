import { redirect } from "next/navigation";
import { AuthView } from "@siq/shared/components/auth/AuthView";
import { getCurrentUser } from "@/lib/auth";
import { getAuthBootstrapState } from "@/lib/workspace-data";

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const [bootstrap, user] = await Promise.all([
    getAuthBootstrapState(),
    getCurrentUser(),
  ]);

  if (user) {
    redirect("/");
  }

  return (
    <AuthView
      initialMode="register"
      dbConfigured={bootstrap.dbConfigured}
      schemaReady={bootstrap.schemaReady}
      hasUsers={bootstrap.hasUsers}
      dbError={bootstrap.dbError}
    />
  );
}
