"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

const ICONS = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  monitor: "M3 3v18h18M7 15l3-4 3 3 4-6",
  workflow: "M5 6h4v4H5zM15 4h4v4h-4zM15 16h4v4h-4zM9 8h3a5 5 0 015 5v3",
  route: "M6 19a3 3 0 100-6 3 3 0 000 6zM18 11a3 3 0 100-6 3 3 0 000 6zM6 13V9a4 4 0 014-4h5",
  check: "M20 6L9 17l-5-5",
  pulse: "M3 12h4l3 8 4-16 3 8h4",
  star: "M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.8 6.2 21.9l1.1-6.5L2.6 9.8l6.5-.9z",
  plug: "M9 2v6M15 2v6M6 8h12v3a6 6 0 01-12 0zM12 17v5",
  chat: "M4 5h16v11H8l-4 4zM8 9h8M8 12h5",
  cog: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7.7 1.6 1.6 0 01-3.2 0 1.6 1.6 0 00-2.7-.7l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-.7-2.7 1.6 1.6 0 010-3.2 1.6 1.6 0 00.7-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-.7 1.6 1.6 0 013.2 0 1.6 1.6 0 002.7.7l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00.7 2.7 1.6 1.6 0 010 3.2 1.6 1.6 0 00-1 .9z",
};

function Glyph({ d }: { d: string }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Sidebar({ pending, project }: { pending: number; project: string }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="dot" />
        Blindspot
      </div>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`nav-item ${isActive(n.href) ? "active" : ""}`}>
          <Glyph d={ICONS[n.icon]} />
          {n.label}
          {n.badge === "pending" && pending > 0 && <span className="nav-badge">{pending}</span>}
        </Link>
      ))}
      <div className="sidebar-foot">
        <div className="muted small">Project</div>
        <div style={{ color: "var(--text)", fontWeight: 550 }}>{project || "—"}</div>
        <form action="/logout" method="post" style={{ marginTop: 8 }}>
          <button type="submit" className="btn-link">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
