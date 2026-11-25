import { redirect } from "next/navigation";
import { WorkspaceShell } from "@siq/shared/components/workspace/WorkspaceShell";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceInitialData } from "@/lib/workspace-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const {
    servers,
    friends,
    dmConversations,
    members,
    voiceOccupancy,
    voiceRoomCreatedAt,
    capabilities,
  } = await getWorkspaceInitialData(user.id);

  return (
    <WorkspaceShell
      initialUser={user}
      initialServers={servers}
      initialFriends={friends}
      initialDmConversations={dmConversations}
      initialMembers={members}
      initialVoiceOccupancy={voiceOccupancy}
      initialVoiceRoomCreatedAt={voiceRoomCreatedAt}
      initialCapabilities={capabilities}
    />
  );
}
