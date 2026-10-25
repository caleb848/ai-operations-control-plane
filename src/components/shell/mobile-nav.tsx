"use client";

import { Ellipsis, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { Suspense, useState } from "react";
import { cn } from "@/lib/format";
import { useCommandPalette } from "./command-palette";
import { Logo } from "./logo";
import { isActive, NAV_ITEMS, TAB_HREFS } from "./nav";
import { NavLinks } from "./sidebar";
import { EnvironmentCard, ThemeToggle } from "./topbar";

/** Small screens: a glass app bar on top, primary tabs at the bottom, everything else in a sheet. */
export function MobileTopBar() {
  const palette = useCommandPalette();
  return (
    <header className="glass-bar sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line/70 px-4 lg:hidden">
      <Link href="/" className="flex items-center gap-2.5">
        <Logo size={30} />
        <span className="font-display text-base font-semibold text-fg">Control Plane</span>
      </Link>
      <div className="flex items-center gap-1">
        <button type="button" onClick={palette.open} aria-label="Search or jump to" className="inline-flex size-10 items-center justify-center rounded-full text-fg-3 hover:bg-surface-2 hover:text-fg">
          <Search className="size-[18px]" />
        </button>
        <ThemeToggle className="rounded-full" />
      </div>
    </header>
  );
}

export function MobileTabBar() {
  return (
    <Suspense fallback={<Tabs pathname={null} />}>
      <ActiveTabs />
    </Suspense>
  );
}

function ActiveTabs() {
  return <Tabs pathname={usePathname()} />;
}

function Tabs({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const tabs = NAV_ITEMS.filter((i) => TAB_HREFS.includes(i.href)).sort((a, b) => TAB_HREFS.indexOf(a.href) - TAB_HREFS.indexOf(b.href));
  const moreActive = pathname !== null && !tabs.some((t) => isActive(pathname, t.href));
  const tabCls = (active: boolean) =>
    cn("relative flex h-full flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors", active ? "text-fg" : "text-fg-3 hover:text-fg-2");
  const iconCls = (active: boolean) => cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-soft text-brand-ink");
  return (
    <nav aria-label="Primary" className="glass-bar fixed inset-x-0 bottom-0 z-30 border-t border-line/70 pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto flex h-16 max-w-xl items-stretch">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = isActive(pathname, t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={tabCls(active)}>
              <span className={iconCls(active)}>
                <Icon className="size-5" strokeWidth={1.8} />
              </span>
              {t.label === "Route a request" ? "Route" : t.label === "Compare models" ? "Compare" : t.label}
            </Link>
          );
        })}
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className={tabCls(moreActive)}>
            <span className={iconCls(moreActive)}>
              <Ellipsis className="size-5" strokeWidth={1.8} />
            </span>
            More
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-black/60 backdrop-blur-sm" />
            <Dialog.Content
              className="card fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] animate-rise overflow-y-auto !rounded-b-none !rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 focus:outline-none"
              aria-describedby={undefined}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
              <div className="mb-3 flex items-center justify-between">
                <Dialog.Title className="font-display text-xl font-semibold text-fg">Navigate</Dialog.Title>
                <Dialog.Close className="inline-flex size-10 items-center justify-center rounded-full text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Close">
                  <X className="size-5" />
                </Dialog.Close>
              </div>
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} large />
              <div className="mt-5">
                <EnvironmentCard onNavigate={() => setOpen(false)} />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </nav>
  );
}
