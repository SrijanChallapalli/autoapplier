"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

// Routes that render full-bleed with no app chrome (sidebar).
// The public landing page lives at "/"; everything under it is the app.
const FULL_BLEED = new Set(["/"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  if (FULL_BLEED.has(path)) {
    return <>{children}</>;
  }

  return (
    <div className="app">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  );
}
