"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "◎" },
  { href: "/jobs", label: "Jobs", icon: "≡" },
  { href: "/applications", label: "Applications", icon: "✓" },
  { href: "/profile", label: "Profile", icon: "◑" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="brand">
        <span className="brand-mark">A</span>
        AutoApplier
      </Link>
      <nav className="nav">
        {LINKS.map((l) => {
          const active =
            l.href === "/dashboard"
              ? path === "/dashboard"
              : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={active ? "active" : ""}
            >
              <span className="nav-ico">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
