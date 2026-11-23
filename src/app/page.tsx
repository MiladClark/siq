import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceInitialData } from "@/lib/workspace-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { channels, members, voiceOccupancy, capabilities } =
    await getWorkspaceInitialData();

  return (
    <WorkspaceShell
      initialUser={user}
      initialChannels={channels}
      initialMembers={members}
      initialVoiceOccupancy={voiceOccupancy}
      initialCapabilities={capabilities}
    />
  );
}
