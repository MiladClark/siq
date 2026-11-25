import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAuthBootstrapState, getWorkspaceInitialData } from "@/lib/workspace-data";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const user = await getCurrentUser();
  if (user) {
    const workspace = await getWorkspaceInitialData(user.id);
    return NextResponse.json({ user, ...workspace }, { headers });
  }

  const { dbConfigured, schemaReady, hasUsers } = await getAuthBootstrapState();
  return NextResponse.json({ user: null, dbConfigured, schemaReady, hasUsers }, {
    headers,
    status: schemaReady ? 200 : 503,
  });
}
