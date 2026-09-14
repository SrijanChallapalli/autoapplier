"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard", icon: "◎" },
  { href: "/jobs", label: "Jobs", icon: "≡" },
  { href: "/applications", label: "Applications", icon: "✓" },
  { href: "/profile", label: "Profile", icon: "◑" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">A</span>
        AutoApplier
      </div>
      <nav className="nav">
        {LINKS.map((l) => {
          const active =
            l.href === "/" ? path === "/" : path.startsWith(l.href);
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
