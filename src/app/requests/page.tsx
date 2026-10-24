import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RequestsTable } from "@/components/overview/sections";
import { PageHeader } from "@/components/ui/page-header";
import { Empty, Panel, Skeleton } from "@/components/ui/primitives";
import { requestsData } from "@/server/queries";

export const metadata: Metadata = { title: "Requests" };

type SP = { q?: string; location?: string; classification?: string; mode?: string; data?: string; page?: string };

export default function RequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageHeader title="Requests" description="Every request with its routing decision, execution mode, cost and full trace. Inputs are stored as a fingerprint and a redacted preview, never the raw document." />
      <Suspense fallback={<Skeleton className="h-[640px] w-full rounded-lg" />}>
        <RequestsList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Select({ name, value, options }: { name: string; value?: string; options: [string, string][] }) {
  return (
    <select name={name} defaultValue={value ?? ""} className="h-8 rounded-md border border-line bg-surface-2 px-2 text-xs text-fg focus:border-line-strong focus:outline-none">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

async function RequestsList({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Number(sp.page ?? 1) || 1;
  const { rows, total, limit } = await requestsData({ ...sp, page });
  const pages = Math.max(1, Math.ceil(total / limit));
  const link = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/requests?${q.toString()}`;
  };
  return (
    <Panel>
      <form className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3" action="/requests">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-4" />
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Search requests, models or IDs"
            className="h-8 w-full rounded-md border border-line bg-surface-2 pl-8 pr-3 text-sm text-fg placeholder:text-fg-4 focus:border-line-strong focus:outline-none"
          />
        </div>
        <Select name="location" value={sp.location} options={[["", "All locations"], ["local", "Local"], ["cloud", "Cloud"], ["blocked", "Blocked"]]} />
        <Select name="classification" value={sp.classification} options={[["", "All data"], ["public", "Public"], ["internal", "Internal"], ["confidential", "Confidential"], ["restricted", "Restricted"]]} />
        <Select name="mode" value={sp.mode} options={[["", "All modes"], ["local", "LOCAL"], ["live", "LIVE API"], ["demo", "DEMO"]]} />
        <Select name="data" value={sp.data} options={[["", "Real + seeded"], ["real", "Real executions only"]]} />
        <button className="h-8 rounded-md border border-line bg-surface-3 px-3 text-xs font-medium text-fg hover:border-line-strong">Apply</button>
      </form>
      {rows.length ? <RequestsTable rows={rows} /> : <Empty title="No matching requests" />}
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-fg-3">
        <span className="tnum">
          {total.toLocaleString()} request{total === 1 ? "" : "s"} · page {page} of {pages} · * latency estimated for simulated runs
        </span>
        <div className="flex gap-1">
          {page > 1 ? (
            <Link href={link(page - 1)} className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 hover:bg-surface-2">
              <ChevronLeft className="size-3.5" /> Prev
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={link(page + 1)} className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 hover:bg-surface-2">
              Next <ChevronRight className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
