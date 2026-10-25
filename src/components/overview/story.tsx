import { ArrowRight, ArrowUpRight, GitBranch, Lock, Route, Scale, ShieldBan, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Legend, StackedColumns } from "@/components/charts/charts";
import { AreaSpark, DotMeter, RadialGauge } from "@/components/charts/viz";
import { DESTINATION_ICON } from "@/components/ui/badges";
import type { DailyPoint, ModelDistributionRow, OverviewMetrics } from "@/services/observability/repository";
import { cn, formatCount, formatUsd } from "@/lib/format";
import { DESTINATION, type Destination } from "@/lib/routing-view";
import { RouteOrbit } from "./route-orbit";

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const tone = (d: Destination | "brand") => (d === "brand" ? {} : ({ "--tone": `var(--${d})`, "--tone-ink": `var(--${d}-ink)`, "--glow": `var(--${d})` } as CSSProperties));

/** The violet hero: what the system does, this week's story in one sentence, and the two ways in. */
export function HeroCard({
  story,
  seedNote,
  portfolio,
  stats,
  action,
}: {
  story: string;
  seedNote?: string | null;
  portfolio: boolean;
  stats: { value: string; label: string }[];
  /** Sits opposite the eyebrow, e.g. the data-scope toggle on a local install. */
  action?: ReactNode;
}) {
  return (
    <section aria-labelledby="hero-title" className="hero-surface enter flex flex-col p-7 sm:p-9" style={{ "--i": 0 } as CSSProperties}>
      <div className="relative z-10 flex flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex w-max items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.08em] text-white/90">
            <span className="size-1.5 rounded-full bg-[#7ef0c8] shadow-[0_0_10px_#7ef0c8]" aria-hidden /> AI traffic control · last 7 days
          </span>
          {action}
        </div>
        <h1 id="hero-title" className="mt-5 max-w-xl text-4xl font-semibold leading-[1.05] text-white sm:text-5xl xl:text-[56px]">
          Every AI request, sent to the right place.
        </h1>
        <p className="mt-4 max-w-xl text-md leading-7 text-[#f1eeff] sm:text-lg">{story}</p>
        <dl className="mt-7 grid max-w-xl grid-cols-3 gap-2.5">
          {stats.map((st) => (
            <div key={st.label} className="rounded-2xl border border-white/15 bg-white/[0.08] px-3.5 py-3 backdrop-blur-sm">
              <dt className="sr-only">{st.label}</dt>
              <dd className="tnum font-display text-2xl font-semibold leading-none text-white sm:text-[28px]">{st.value}</dd>
              <dd className="mt-1.5 text-xs leading-4 text-[#f1eeff] sm:text-sm">{st.label}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-8">
          <Link
            href="/route"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-md font-semibold text-[#24178f] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)] transition-transform duration-[var(--dur-fast)] hover:-translate-y-px active:scale-[0.98]"
          >
            <Route className="size-4" /> Route a request
          </Link>
          <Link
            href="/compare"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 text-md font-medium text-white transition-colors duration-[var(--dur-fast)] hover:bg-white/20"
          >
            <Scale className="size-4" /> Compare models
          </Link>
        </div>
        {seedNote ? <p className="mt-5 max-w-xl text-sm text-[#f1eeff]">{seedNote}</p> : null}
        {portfolio ? <p className="sr-only">Portfolio Mode: routing is real, model execution is simulated.</p> : null}
      </div>
    </section>
  );
}

/** The routing map, framed. */
export function OrbitCard({ m }: { m: OverviewMetrics }) {
  const stopped = m.blocked + m.failed;
  return (
    <section aria-labelledby="orbit-title" className="card enter flex flex-col overflow-hidden p-6" style={{ "--i": 1 } as CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="orbit-title" className="text-xl font-semibold text-fg">
            Routing map
          </h2>
          <p className="text-sm text-fg-3">Where this week&apos;s requests went</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-local-line bg-local-soft px-3 py-1 text-xs font-medium text-local-ink">
          <span className="relative flex size-2">
            <span className="absolute inset-0 animate-[ping-soft_2s_var(--ease-out)_infinite] rounded-full bg-local" aria-hidden />
            <span className="relative size-2 rounded-full bg-local" />
          </span>
          Live engine
        </span>
      </div>
      <div className="mt-2 flex flex-1 items-center">
        <RouteOrbit counts={{ local: m.local, cloud: m.cloud, blocked: stopped, review: m.reviewsRequired }} total={m.total} />
      </div>
    </section>
  );
}

/** One tile per destination: count, share and the week's shape. */
export function DestinationTiles({ m, daily }: { m: OverviewMetrics; daily: DailyPoint[] }) {
  const stopped = m.blocked + m.failed;
  const routed = m.local + m.cloud;
  const total = m.local + m.cloud + stopped;
  const tiles: { dest: Destination; value: number; share: string; line: string; href: string; series?: number[] }[] = [
    { dest: "local", value: m.local, share: `${pct(m.local, total)}%`, line: "Ran on-device · $0 API", href: "/requests?location=local", series: daily.map((d) => d.local) },
    { dest: "cloud", value: m.cloud, share: `${pct(m.cloud, total)}%`, line: "Approved providers only", href: "/requests?location=cloud", series: daily.map((d) => d.cloud) },
    { dest: "review", value: m.reviewsRequired, share: `${pct(m.reviewsRequired, routed)}%`, line: m.reviewsPending ? `${m.reviewsPending} waiting for a person` : "All held outputs reviewed", href: "/approvals" },
    { dest: "blocked", value: stopped, share: `${pct(stopped, total)}%`, line: "Failed closed · nothing sent", href: "/requests?location=blocked", series: daily.map((d) => d.blocked) },
  ];
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Destinations">
      {tiles.map((t, i) => {
        const Icon = DESTINATION_ICON[t.dest];
        return (
          <li key={t.dest} className="enter flex" style={{ "--i": 2 + i } as CSSProperties}>
            <Link href={t.href} className="card card-glow spotlight group flex w-full flex-col overflow-hidden p-5 transition-transform duration-[var(--dur)] hover:-translate-y-0.5" style={tone(t.dest)}>
              <span className="flex items-center gap-3">
                <span className="icon-tile size-10">
                  <Icon className="size-5" strokeWidth={1.9} />
                </span>
                <span className="whitespace-nowrap text-md font-semibold text-fg">{DESTINATION[t.dest].label}</span>
              </span>
              <span className="mt-5 block">
                <span className="flex items-end gap-3">
                  <span className="tnum font-display text-5xl font-semibold leading-none text-fg">{formatCount(t.value)}</span>
                  <span className="tnum mb-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold" style={{ borderColor: `var(--${t.dest}-line)`, color: `var(--${t.dest}-ink)`, background: `var(--${t.dest}-soft)` }}>
                    {t.share}
                  </span>
                </span>
                <span className="mt-2 block text-sm text-fg-3">{t.line}</span>
              </span>
              {t.series ? (
                <AreaSpark className="-mx-5 -mb-5 mt-4 w-[calc(100%+40px)]" values={t.series} color={`var(--${t.dest})`} height={54} label={`${DESTINATION[t.dest].label} per day, last 7 days: ${t.series.join(", ")}`} />
              ) : (
                <DotMeter className="mt-auto pt-4" value={routed ? t.value / routed : 0} color="var(--review)" dots={40} rows={2} label={`${t.share} of completed runs held for review`} />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const SERIES = [
  { key: "local", label: "Local AI", color: "var(--local)" },
  { key: "cloud", label: "Cloud AI", color: "var(--cloud)" },
  { key: "blocked", label: "Blocked", color: "var(--blocked)" },
];

export function TrafficCard({ daily, m }: { daily: DailyPoint[]; m: OverviewMetrics }) {
  const dayTotal = (d: DailyPoint) => d.local + d.cloud + d.blocked;
  const busiest = daily.reduce((a, b) => (dayTotal(b) > dayTotal(a) ? b : a), daily[0]);
  const weekTotal = daily.reduce((s, d) => s + dayTotal(d), 0);
  const stats = [
    { label: "Average", value: formatCount(daily.length ? Math.round(weekTotal / daily.length) : 0), unit: "per day" },
    { label: "Peak", value: busiest ? formatCount(dayTotal(busiest)) : "—", unit: busiest ? new Date(`${busiest.day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }) : "" },
    { label: "On-device", value: `${pct(m.local, m.local + m.cloud + m.blocked + m.failed)}%`, unit: "of requests" },
  ];
  return (
    <section aria-labelledby="traffic-title" className="card enter flex h-full flex-col p-6 sm:p-7" style={{ "--i": 6 } as CSSProperties}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="traffic-title" className="text-xl font-semibold text-fg">
            Traffic by day
          </h2>
          <p className="text-sm text-fg-3">
            {formatCount(m.total)} requests · last {daily.length} days, by destination
          </p>
        </div>
        <Legend series={SERIES} />
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface-2/60 px-4 py-2.5">
            <dt className="text-xs text-fg-3">{s.label}</dt>
            <dd className="mt-0.5 flex items-baseline gap-1.5">
              <span className="tnum font-display text-2xl font-semibold text-fg">{s.value}</span>
              <span className="truncate text-sm text-fg-3">{s.unit}</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto pt-8">
        <StackedColumns
          height={232}
          label="Requests per day by destination"
          series={SERIES}
          data={daily.map((d) => ({
            label: d.day,
            display: new Date(`${d.day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
            values: { local: d.local, cloud: d.cloud, blocked: d.blocked },
          }))}
        />
      </div>
    </section>
  );
}

/** What routing saved against the obvious alternative: send everything to one strong cloud model. */
export function EconomicsCard({ m, baselineName, portfolio }: { m: OverviewMetrics; baselineName: string; portfolio: boolean }) {
  const actual = m.externalSpendUsd + m.simulatedSpendUsd;
  const baseline = m.baselineSpendUsd;
  const delta = baseline > 0 ? (actual - baseline) / baseline : 0;
  const saved = Math.max(0, -delta);
  const short = baselineName.replace(/^Claude /, "");
  const simulated = m.externalSpendUsd === 0 && m.simulatedSpendUsd > 0;
  return (
    <section aria-labelledby="econ-title" className="card card-glow enter flex flex-col p-6 sm:p-7" style={{ "--i": 7 } as CSSProperties}>
      <h2 id="econ-title" className="text-xl font-semibold text-fg">
        Economics
      </h2>
      <p className="text-sm text-fg-3">Against sending every request to {baselineName}.</p>
      <div className="mt-6 flex justify-center">
        <RadialGauge value={saved} size={184} stroke={16} label={`${Math.round(saved * 100)}% lower API spend than the all-${short} baseline`}>
          <span className="tnum font-display text-5xl font-semibold leading-none text-fg">{Math.round(Math.abs(delta) * 100)}%</span>
          <span className="mt-1.5 text-sm text-fg-2">{delta <= 0 ? "lower spend" : "higher spend"}</span>
        </RadialGauge>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface-2/70 p-3.5">
          <dt className="text-xs text-fg-3">All on {short}</dt>
          <dd className="tnum mt-1 font-display text-xl font-semibold text-fg">{formatUsd(baseline)}</dd>
          <dd className="text-xs text-fg-3">estimated</dd>
        </div>
        <div className="rounded-2xl border border-brand-line bg-brand-soft p-3.5">
          <dt className="text-xs text-fg-2">With routing</dt>
          <dd className="tnum mt-1 font-display text-xl font-semibold text-fg">{formatUsd(actual)}</dd>
          <dd className="text-xs text-fg-2">{simulated ? "simulated" : "actual"}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-fg-3">
        {portfolio ? "Paid API spend on this site: $0.00. No model is called from here." : `Paid API spend: ${formatUsd(m.externalSpendUsd)}. Local runs cost $0 in API fees; compute still applies.`}
      </p>
    </section>
  );
}

/** The guardrails that fired this week, each one a link to the evidence. */
export function GovernanceTiles({ m }: { m: OverviewMetrics }) {
  const items: { icon: LucideIcon; value: number; label: string; line: string; href: string; dest: Destination }[] = [
    { icon: Lock, value: m.policyBlockedRequests, label: "Kept off the cloud", line: "Policy blocked at least one cloud model", href: "/governance", dest: "local" },
    { icon: Wallet, value: m.budgetGuardEvents, label: "Budget Guard reroutes", line: "Worst case reserved before any paid call", href: "/budget", dest: "review" },
    { icon: GitBranch, value: m.fallbackEvents, label: "Provider fallbacks", line: "Only to models that passed governance", href: "/requests", dest: "cloud" },
    { icon: ShieldBan, value: m.blocked, label: "Failed closed", line: "Stopped rather than sent where policy forbids", href: "/requests?location=blocked", dest: "blocked" },
  ];
  return (
    <section aria-labelledby="gov-title" className="card enter h-full p-6 sm:p-7" style={{ "--i": 8 } as CSSProperties}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="gov-title" className="text-xl font-semibold text-fg">
            Governance at work
          </h2>
          <p className="text-sm text-fg-3">Guardrails that fired this week</p>
        </div>
        <Link href="/governance" className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
          View policies <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-3">
        {items.map((i) => (
          <li key={i.label} className="flex">
            <Link
              href={i.href}
              className="spotlight group relative flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface-2/60 p-4 transition-colors duration-[var(--dur-fast)] hover:border-line-strong"
              style={tone(i.dest)}
            >
              <span className="flex items-center justify-between">
                <span className="icon-tile size-9 !rounded-xl">
                  <i.icon className="size-[18px]" strokeWidth={1.9} />
                </span>
                <ArrowUpRight className="size-4 text-fg-4 transition-colors group-hover:text-fg-2" aria-hidden />
              </span>
              <span className="tnum mt-4 font-display text-4xl font-semibold leading-none text-fg">{formatCount(i.value)}</span>
              <span className="mt-2 text-md font-medium text-fg">{i.label}</span>
              <span className="mt-0.5 hidden text-sm text-fg-3 sm:block">{i.line}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const monogram = (name: string) => name.replace(/^Claude /, "").charAt(0).toUpperCase();

/** Which models served the week, ranked. */
export function Leaderboard({ rows }: { rows: ModelDistributionRow[] }) {
  const top = Math.max(1, ...rows.map((r) => r.requests));
  const total = rows.reduce((s, r) => s + r.requests, 0) || 1;
  return (
    <section aria-labelledby="board-title" className="card enter h-full p-6 sm:p-7" style={{ "--i": 9 } as CSSProperties}>
      <h2 id="board-title" className="text-xl font-semibold text-fg">
        Who did the work
      </h2>
      <p className="text-sm text-fg-3">Completed requests by the model that served them</p>
      <ol className="mt-6 space-y-4">
        {rows.slice(0, 6).map((r, i) => (
          <li key={r.modelId} className="flex items-center gap-3.5">
            <span className="tnum w-4 text-right text-sm text-fg-3">{i + 1}</span>
            <span className="icon-tile size-10 font-display text-base font-bold" style={tone(r.location)}>
              {monogram(r.modelName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-md font-medium text-fg">{r.modelName}</span>
                <span className="tnum text-sm text-fg-2">
                  {r.requests} <span className="text-fg-3">· {Math.round((r.requests / total) * 100)}%</span>
                </span>
              </span>
              <span className="mt-1.5 block h-2 rounded-full bg-track" aria-hidden>
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(4, (r.requests / top) * 100)}%`, background: `linear-gradient(90deg, var(--${r.location}), var(--${r.location}-ink))`, boxShadow: `0 0 12px -2px var(--${r.location})` }}
                />
              </span>
              <span className="sr-only">{r.location === "local" ? "Local AI" : "Cloud AI"}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A section card with a title row; used for the lists at the bottom of the page. */
export function SectionCard({ id, title, sub, action, children, className, i = 0 }: { id: string; title: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string; i?: number }) {
  return (
    <section aria-labelledby={id} className={cn("card enter overflow-hidden", className)} style={{ "--i": i } as CSSProperties}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-3 pt-6">
        <div>
          <h2 id={id} className="text-xl font-semibold text-fg">
            {title}
          </h2>
          {sub ? <p className="text-sm text-fg-3">{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
