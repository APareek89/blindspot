import "./globals.css";
import "./vendor/lovable-tokens.css";
import "./vendor/lovable-components.css";
import "./portfolio-theme.css";
import { AccountShell } from "@/components/AccountShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blindspot",
  description: "The eval-gated model & cost layer for AI agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="lovable-ui" data-theme="light" suppressHydrationWarning>
      <body><AccountShell>{children}</AccountShell></body>
    </html>
  );
}
