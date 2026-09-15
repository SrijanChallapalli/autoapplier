import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { AiKeyBridge } from "@/components/AiKeyBridge";

export const metadata: Metadata = {
  title: "AutoApplier — your job-search assistant",
  description:
    "Find, rank, and prepare software / AI-ML internship applications while staying in control.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AiKeyBridge />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
