import { ChevronLeft, ChevronRight, LayoutGrid, Search, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DecisionList } from "@/components/requests/decision-list";
import { DESTINATION_ICON } from "@/components/ui/badges";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass, Empty, Skeleton } from "@/components/ui/primitives";
import { loadConfig } from "@/config/env";
import { requestsData } from "@/server/queries";
import { cn } from "@/lib/format";
import type { Destination } from "@/lib/routing-view";

export const metadata: Metadata = { title: "Decisions" };

type SP = { q?: string; location?: string; classification?: string; mode?: string; data?: string; page?: string };

export default function RequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow="Operations"
        title={<>Every <span className="text-brand">decision</span>, on the record</>}
        description="Every request with where it went, why, what it cost and the full trace. Inputs are kept as a fingerprint and a redacted preview, never the raw document."
      />
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-2xl" />}>
        <RequestsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const field = "h-10 rounded-full border border-line-strong bg-surface-2/80 px-4 text-sm text-fg focus:border-brand focus:outline-none";

const DEST_FILTERS: { value: string; label: string; icon: LucideIcon; dest?: Destination }[] = [
  { value: "", label: "All", icon: LayoutGrid },
  { value: "local", label: "Local AI", icon: DESTINATION_ICON.local, dest: "local" },
  { value: "cloud", label: "Cloud AI", icon: DESTINATION_ICON.cloud, dest: "cloud" },
  { value: "blocked", label: "Blocked", icon: DESTINATION_ICON.blocked, dest: "blocked" },
];

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <select name={name} aria-label={label} defaultValue={value ?? ""} className={field}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

async function RequestsList({ searchParams }: { searchParams: Promise<SP> }) {
  const portfolio = loadConfig().deployment.mode === "portfolio";
  // Every public-demo request is simulated, so execution-mode and real/seeded filters don't apply there.
  const sp = portfolio ? { ...(await searchParams), mode: undefined, data: undefined } : await searchParams;
  const page = Number(sp.page ?? 1) || 1;
  const { rows, total, limit } = await requestsData({ ...sp, page });
  const pages = Math.max(1, Math.ceil(total / limit));
  const filtered = Boolean(sp.q || sp.location || sp.classification || sp.mode || sp.data);
  const link = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/requests?${q.toString()}`;
  };
  return (
    <section aria-label="Decision list" className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 pt-4 pb-3 sm:px-6" role="group" aria-label="Destination">
        {DEST_FILTERS.map((f) => {
          const active = (sp.location ?? "") === f.value;
          const q = new URLSearchParams(Object.entries({ ...sp, location: f.value, page: "" }).filter(([, v]) => v) as [string, string][]);
          return (
            <Link
              key={f.value || "all"}
              href={`/requests${q.toString() ? `?${q}` : ""}`}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors duration-[var(--dur-fast)]",
                active ? "" : "border-line bg-surface-2/60 text-fg-2 hover:border-line-strong hover:text-fg",
              )}
              style={active ? (f.dest ? { borderColor: `var(--${f.dest}-line)`, background: `var(--${f.dest}-soft)`, color: `var(--${f.dest}-ink)`, boxShadow: `0 0 20px -8px var(--${f.dest})` } : { borderColor: "var(--brand-line)", background: "var(--brand-soft)", color: "var(--brand-ink)" }) : undefined}
            >
              <f.icon className="size-4" aria-hidden />
              {f.label}
            </Link>
          );
        })}
      </div>
      <form className="flex flex-wrap items-center gap-2 border-b border-line p-4 sm:px-6" action="/requests" role="search">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-fg-3" aria-hidden />
          <input name="q" defaultValue={sp.q} aria-label="Search decisions" placeholder="Search requests, models or IDs" className={`${field} w-full pl-10 placeholder:text-fg-3`} />
        </div>
        <input type="hidden" name="location" value={sp.location ?? ""} />
        <Select
          name="classification"
          label="Data classification"
          value={sp.classification}
          options={[["", "All data"], ["public", "Public"], ["internal", "Internal"], ["confidential", "Confidential"], ["restricted", "Restricted"]]}
        />
        {portfolio ? null : (
          <>
            <Select name="mode" label="Execution mode" value={sp.mode} options={[["", "All modes"], ["local", "Local run"], ["live", "Live API"], ["demo", "Simulated"]]} />
            <Select name="data" label="Data source" value={sp.data} options={[["", "Real and seeded"], ["real", "Real executions only"]]} />
          </>
        )}
        <button className="btn-brand inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-medium active:scale-[0.98]">
          Apply
        </button>
        {filtered ? (
          <Link href="/requests" className="px-2 text-sm font-medium text-fg-3 hover:text-fg">
            Clear
          </Link>
        ) : null}
      </form>
      {rows.length ? (
        <DecisionList rows={rows} showSource={!portfolio} />
      ) : (
        <Empty title="No matching decisions" action={<Link href="/requests" className={buttonClass("secondary", "sm")}>Clear filters</Link>}>
          Try a different search or destination.
        </Empty>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-sm text-fg-3 sm:px-6">
        <span className="tnum">
          {total.toLocaleString()} decision{total === 1 ? "" : "s"} · page {page} of {pages}
        </span>
        <nav className="flex gap-2" aria-label="Pagination">
          {page > 1 ? (
            <Link href={link(page - 1)} className={buttonClass("secondary", "sm")}>
              <ChevronLeft className="size-4" /> Previous
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={link(page + 1)} className={buttonClass("secondary", "sm")}>
              Next <ChevronRight className="size-4" />
            </Link>
          ) : null}
        </nav>
      </div>
    </section>
  );
}
