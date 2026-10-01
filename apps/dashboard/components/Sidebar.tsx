"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, ChartNoAxesCombined, Workflow, Route, Check, Activity, Star, Plug, MessageSquare, Settings } from "lucide-react";

const NAV: { href: string; label: string; icon: keyof typeof ICONS; badge?: "pending" }[] = [
  { href: "/", label: "Overview", icon: "grid" },
  { href: "/monitor", label: "Monitor", icon: "monitor" },
  { href: "/workflows", label: "Workflows", icon: "workflow" },
  { href: "/routes", label: "Routes & Models", icon: "route" },
  { href: "/approvals", label: "Approvals", icon: "check", badge: "pending" },
  { href: "/drift", label: "Drift", icon: "pulse" },
  { href: "/golden-sets", label: "Golden Sets", icon: "star" },
  { href: "/connect", label: "Connect", icon: "plug" },
  { href: "/feedback", label: "Beta feedback", icon: "chat" },
  { href: "/settings", label: "Settings", icon: "cog" },
];

const ICONS = { grid: LayoutGrid, monitor: ChartNoAxesCombined, workflow: Workflow, route: Route, check: Check, pulse: Activity, star: Star, plug: Plug, chat: MessageSquare, cog: Settings };

export function Sidebar({ pending, project }: { pending: number; project: string }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside className="sidebar">
      <div className="brand">
        Workspace
      </div>
      {NAV.map((n) => { const Icon = ICONS[n.icon]; return (
        <Link key={n.href} href={n.href} className={`nav-item ${isActive(n.href) ? "active" : ""}`}>
          <Icon className="ico" size={16} aria-hidden="true" />
          {n.label}
          {n.badge === "pending" && pending > 0 && <span className="nav-badge">{pending}</span>}
        </Link>
      ); })}
      <div className="sidebar-foot">
        <div className="muted small">Project</div>
        <div style={{ color: "var(--text)", fontWeight: 550 }}>{project || "—"}</div>

      </div>
    </aside>
  );
}
