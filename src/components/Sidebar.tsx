"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "◎" },
  { href: "/jobs", label: "Jobs", icon: "≡" },
  { href: "/applications", label: "Applications", icon: "✓" },
  { href: "/profile", label: "Profile", icon: "◑" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [authEnabled, setAuthEnabled] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Only reveal the "Sign out" control when the password gate is actually on.
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => setAuthEnabled(!!s.enabled))
      .catch(() => {});
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore — navigate to login regardless
    }
    router.replace("/login");
    router.refresh();
  }

  // The login screen has no sidebar.
  if (path === "/login") return null;

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
      {authEnabled && (
        <button
          type="button"
          className="btn btn-sm sidebar-signout"
          onClick={signOut}
          disabled={signingOut}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      )}
    </aside>
  );
}
