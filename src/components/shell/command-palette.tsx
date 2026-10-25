"use client";

import { ArrowRight, CornerDownLeft, Moon, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { SCENARIO_STORY } from "@/lib/routing-view";
import { NAV_ITEMS } from "./nav";

interface Entry {
  id: string;
  group: "Pages" | "Scenarios" | "Actions";
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const Ctx = createContext<{ open: () => void }>({ open: () => {} });

/** Opens the command palette from anywhere (the top bar and mobile search use it). */
export function useCommandPalette() {
  return useContext(Ctx);
}

/** ⌘K / Ctrl+K: jump to any page or scenario, or switch theme, from the keyboard. */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Palette open={isOpen} onOpenChange={setOpen} />
    </Ctx.Provider>
  );
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {
    /* storage unavailable: theme still switches for this view */
  }
  window.dispatchEvent(new Event("aiops:theme"));
}

function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const go = (href: string) => () => router.push(href);
    return [
      ...NAV_ITEMS.map((n) => {
        const Icon = n.icon;
        return { id: `page:${n.href}`, group: "Pages" as const, label: n.label, icon: <Icon className="size-4" />, run: go(n.href) };
      }),
      ...Object.entries(SCENARIO_STORY).map(([id, s]) => ({
        id: `scenario:${id}`,
        group: "Scenarios" as const,
        label: s.title,
        hint: s.story,
        icon: <Sparkles className="size-4" />,
        run: go(`/route?scenario=${id}`),
      })),
      { id: "action:theme", group: "Actions" as const, label: "Switch light or dark theme", icon: <Moon className="size-4" />, run: toggleTheme },
    ];
  }, [router]);

  const q = query.trim().toLowerCase();
  const shown = q ? entries.filter((e) => `${e.label} ${e.hint ?? ""} ${e.group}`.toLowerCase().includes(q)) : entries;
  const index = Math.min(active, Math.max(0, shown.length - 1));

  const choose = (e?: Entry) => {
    if (!e) return;
    onOpenChange(false);
    setQuery("");
    setActive(0);
    e.run();
  };

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  let lastGroup = "";
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/55 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="card fixed left-1/2 top-[14vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 animate-enter overflow-hidden !rounded-3xl p-0 focus:outline-none"
        >
          <Dialog.Title className="sr-only">Search or jump to</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-line px-5">
            <Search className="size-5 shrink-0 text-fg-3" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, shown.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  choose(shown[index]);
                }
              }}
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={shown[index] ? `palette-${index}` : undefined}
              aria-label="Search pages, scenarios and actions"
              placeholder="Search pages, scenarios and actions"
              className="h-14 min-w-0 flex-1 bg-transparent text-md text-fg placeholder:text-fg-3 focus:outline-none"
            />
            <kbd className="hidden rounded-md border border-line-strong px-1.5 py-0.5 font-mono text-xs text-fg-3 sm:inline">esc</kbd>
          </div>
          <ul ref={listRef} id="palette-list" role="listbox" aria-label="Results" className="scrollbar-thin max-h-[min(420px,60vh)] overflow-y-auto p-2">
            {shown.length === 0 ? <li className="px-3 py-8 text-center text-sm text-fg-3">Nothing matches “{query}”.</li> : null}
            {shown.map((e, i) => {
              const header = e.group !== lastGroup ? e.group : null;
              lastGroup = e.group;
              return (
                <li key={e.id} role="presentation">
                  {header ? <div className="eyebrow px-3 pb-1.5 pt-3">{header}</div> : null}
                  <div
                    id={`palette-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === index}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(e)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-[var(--dur-fast)]",
                      i === index ? "bg-brand-soft text-fg" : "text-fg-2",
                    )}
                  >
                    <span className={cn("icon-tile size-8 !rounded-lg", i !== index && "opacity-70")}>{e.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-md font-medium">{e.label}</span>
                      {e.hint ? <span className="block truncate text-sm text-fg-3">{e.hint}</span> : null}
                    </span>
                    {i === index ? <CornerDownLeft className="size-4 text-fg-3" aria-hidden /> : <ArrowRight className="size-4 text-fg-4" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
