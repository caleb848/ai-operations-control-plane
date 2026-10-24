import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { InlineScript } from "@/components/shell/inline-script";
import { loadConfig } from "@/config/env";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "AI Operations Control Plane", template: "%s · AI Ops Control Plane" },
  description: "Routes AI work between local models (Ollama) and cloud models based on privacy, cost, quality, complexity, latency and governance.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08080a" },
    { media: "(prefers-color-scheme: light)", color: "#f6f6f7" },
  ],
};

// Applies the saved theme before first paint. Dark is the default.
const themeScript = `try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Decided at build time for prerendered shells (BUILD_DEPLOYMENT_MODE), so the banner never flashes.
  const config = loadConfig();
  const deployment = { portfolio: config.deployment.mode === "portfolio", links: config.links };
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body>
        <AppShell deployment={deployment}>{children}</AppShell>
      </body>
    </html>
  );
}
