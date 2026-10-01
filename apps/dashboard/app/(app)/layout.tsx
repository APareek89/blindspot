import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ApiError } from "@/lib/api";
import { WorkspaceBoundary } from "@/components/AccountShell";
import { requireApi, requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const client = await requireApi();

  let project = "";
  let pending = 0;
  let gatewayDown = false;
  try {
    const [me, ov] = await Promise.all([client.me(), client.overview()]);
    project = me.project.name;
    pending = ov.pendingApprovals;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect("/login");
    gatewayDown = true; // connection / server error — pages render their own errors
  }

  return (
    <WorkspaceBoundary ownerId={user.id}><div className="shell">
      <Sidebar pending={pending} project={project} />
      <main className="main">
        {gatewayDown && (
          <div className="alert danger" style={{ marginBottom: 18 }}>
            The workspace service is unavailable. Please reload to try again.
          </div>
        )}
        {children}
      </main>
    </div></WorkspaceBoundary>
  );
}
