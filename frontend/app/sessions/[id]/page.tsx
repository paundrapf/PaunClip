import { SessionWorkspace } from "@/components/session-workspace";

type SessionWorkspaceRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SessionWorkspaceRoute({
  params,
}: SessionWorkspaceRouteProps) {
  const { id } = await params;

  return <SessionWorkspace sessionId={decodeURIComponent(id)} />;
}
