import { createHash } from "node:crypto";
import { classifyTask } from "@/core/classification/classify";
import { evaluateOutput } from "@/core/evaluation/heuristic";
import { reviewRequirement } from "@/core/governance/review";
import { BASELINE_MODEL_ID } from "@/core/models/cloud-catalog";
import { localFamilyDefaults } from "@/core/models/local-profiles";
import { apiCost } from "@/core/pricing/cost";
import { route, type ModelAvailability } from "@/core/routing/engine";
import { preview, redact } from "@/core/security/redact";
import type { DataClassification, GovernancePolicy, ModelDescriptor, PriorityMode, TraceEvent } from "@/core/types";
import type { ApprovalService } from "../approvals/approvals";
import { buildPrompt, shortTitle, SYSTEM_PROMPT } from "../execution/executor";
import { findRecordedOutput } from "@/scenarios/recorded";
import { localDayKey, type ExecutionRepository } from "../observability/repository";
import type { ExecutionRecord } from "../observability/types";

/**
 * Synthetic workload for the demo workspace: a week of requests routed by the
 * real engine, with simulated execution. Every row is stored with
 * source = "seed" and mode = "demo" so it can be filtered out or deleted,
 * and the dashboard labels it.
 */

interface Template {
  weight: number;
  instruction: string;
  /** Plausible output for the simulated execution; evaluated by the real heuristic. */
  output: string;
  context: string;
  declared?: DataClassification;
  priority: PriorityMode;
}

export const DEMO_TEMPLATES: Template[] = [
  {
    weight: 4,
    priority: "balanced",
    declared: "public",
    instruction: "Summarize this industry article in three bullet points for the weekly digest.",
    output: "- Regional retailers are adding same-day pickup lockers to suburban stores.\n- Early pilots show higher basket sizes and fewer missed deliveries.\n- Analysts expect lockers in a third of large-format stores within two years, driven by labor costs and demand for flexible pickup.",
    context:
      "Regional retailers are adding same-day pickup lockers to suburban stores. Early pilots report higher basket sizes and fewer missed deliveries. Analysts expect lockers in a third of large-format stores within two years, driven by labor costs and customer demand for flexible pickup windows.",
  },
  {
    weight: 4,
    priority: "lowest_cost",
    instruction: "Classify each support ticket by category and urgency.",
    output: "- Ticket 1: Account access · High\n- Ticket 2: Billing · Medium\n- Ticket 3: Feature request · Low\n- Ticket 4: Bug (photo upload crash) · High",
    context:
      "Ticket 1: Cannot log in after password reset. Ticket 2: Invoice shows the wrong billing address. Ticket 3: Feature request for dark mode. Ticket 4: App crashes when uploading photos larger than 20 MB.",
  },
  {
    weight: 3,
    priority: "lowest_cost",
    instruction: "Extract the vendor, invoice number, due date and total as JSON.",
    output: "{\"vendor\": \"Halverson Supply\", \"invoice_number\": \"INV-20417\", \"due_date\": \"2026-11-14\", \"total\": 4812.50, \"currency\": \"USD\"}",
    context: "Internal only. Invoice INV-20417 from Halverson Supply, due 2026-11-14, total $4,812.50 including tax. Payment terms net 30.",
  },
  {
    weight: 4,
    priority: "balanced",
    instruction: "Review this client meeting brief and list the decisions, owners and open risks.",
    output: "**Decisions**\n- Move the launch to May.\n- Reduce paid search spend by 20%.\n\n**Open risks**\n- Retailer listing fees are not yet approved.\n- Pricing strategy for the club channel is unresolved.\n\nOwners were not named in the brief; confirm them at the next meeting.",
    context:
      "CONFIDENTIAL. Client: Brightwell Foods (account no. BWF-1180). Attendees: priya.raman@brightwell.example, (647) 555-0117. Decisions: move the launch to May; reduce paid search by 20%. Risks: retailer listing fees not yet approved; pricing strategy for the club channel unresolved.",
  },
  {
    weight: 2,
    priority: "best_quality",
    instruction: "Draft a reply to this customer complaint that acknowledges the delay and offers a resolution.",
    output: "I'm sorry your order has been stuck in processing for nine days and that your emails went unanswered. That isn't the experience we want for you. I've escalated your order with our fulfilment team and will confirm a delivery date by end of day today. If you would prefer a refund instead, reply to this message and I'll process it immediately.",
    context: "Customer wrote: my order has been 'processing' for nine days and nobody has answered my two emails. I want a refund or a delivery date today.",
  },
  {
    weight: 1,
    priority: "balanced",
    declared: "internal",
    instruction:
      "Synthesize these notes into a market-entry recommendation for the Pacific Northwest, weigh the trade-offs between partnering and building, and justify the choice. Include risks and how to test it.",
    output: "**Recommendation:** partner first, with a path to build.\n\nPartners already cover 3 of 5 target metros, avoiding a $1.2M first-year build and a 5-month hiring lead time. The trade-off is exclusivity; limit it to two years and two metros.\n\n**Risks:** competitor pricing strategy undercuts us by 8% in two metros, and their roadmap adds delivery in Q2.\n\n**Test:** a 90-day pilot with one partner in one metro, measuring cost per order and partner fulfilment speed.",
    context:
      "## Note 1\nPartner candidates have distribution in 3 of 5 target metros but want exclusivity.\n## Note 2\nBuilding our own team costs about $1.2M in year one; hiring lead time is 5 months.\n## Note 3\nCompetitor pricing strategy undercuts us by 8% in two metros; their roadmap adds delivery in Q2.",
  },
  {
    weight: 1,
    priority: "best_quality",
    declared: "internal",
    instruction: "Write a TypeScript function that validates Canadian postal codes, with unit tests.",
    output: "```ts\nexport function isPostalCode(v: string): boolean {\n  return /^[ABCEGHJ-NPRSTVXY]\\d[ABCEGHJ-NPRSTV-Z] ?\\d[ABCEGHJ-NPRSTV-Z]\\d$/i.test(v.trim());\n}\n\ntest(\"valid\", () => expect(isPostalCode(\"K1A 0B1\")).toBe(true));\ntest(\"invalid letter\", () => expect(isPostalCode(\"D1A 0B1\")).toBe(false));\n```",
    context: "",
  },
  {
    weight: 3,
    priority: "balanced",
    instruction: "Extract action items and owners from these sales call notes as a bulleted list.",
    output: "- Send the SOC 2 report and security documentation by Friday · Sam\n- Revise the contract value proposal for the 3-year term · Ana\n- Confirm procurement's security questionnaire deadline · Unassigned",
    context:
      "Confidential. Call with Linwood Health procurement (account no. LH-5521). Contact: s.oduya@linwood-health.example. They need security documentation by Friday; Sam to send the SOC 2 report; Ana to revise the contract value proposal to reflect the 3-year term.",
  },
  {
    weight: 2,
    priority: "fastest",
    declared: "public",
    instruction: "Draft a short LinkedIn post announcing our new office hours webinar series.",
    output: "Bookkeeping questions piling up? Starting next month we're hosting free office hours every second Thursday at noon Eastern. Bring your questions on receipts, reconciliations and month-end close, and leave with practical fixes you can use the same day. Free to attend; save your spot today.",
    context: "Webinars run every second Thursday at noon Eastern, free to attend, covering practical tips for small-business bookkeeping.",
  },
  {
    weight: 1,
    priority: "balanced",
    instruction: "Summarize this payroll exception report for the controller.",
    output: "- One employee record is flagged for a duplicate deposit and needs reversal before the next run.\n- Salary adjustments are pending for two employees on leave; hold them until HR confirms dates.\n- No other exceptions this cycle.",
    context: "RESTRICTED. Employee SIN 130 692 544 flagged for duplicate deposit. Salary adjustment pending for two employees on medical leave.",
  },
  {
    weight: 2,
    priority: "balanced",
    declared: "internal",
    instruction: "Analyze the attached pricing data and recommend whether to raise the Pro plan price, with trade-offs.",
    output: "**Recommendation:** raise Pro by 6–8%, not the competitor's 12%.\n\n71% margins leave room, and the competitor's increase narrows the gap. But 38% of users name price as their top reason to switch and churn is already 2.3% monthly, so a smaller increase limits churn risk.\n\n**Trade-off:** less revenue per account than a full match, in exchange for protecting the 4.1% conversion rate. Test on new signups first.",
    context: "Pro plan conversion is 4.1%; churn 2.3% monthly. Competitor raised prices 12% last quarter. Our margins on Pro are 71%. Survey: 38% of users say price is the top reason they would switch.",
  },
  {
    weight: 3,
    priority: "balanced",
    declared: "internal",
    instruction: "Summarize this week's project status notes into a short update with blockers.",
    output: "**Status:** data migration 80% complete; go-live still planned for the 21st.\n\n**Blockers**\n- 14 QA defects open, 3 critical; fixes gate the go-live.\n- Vendor API rate limits slowed integration testing.",
    context: "Internal only. Data migration 80% complete; QA found 14 defects, 3 critical. Vendor API rate limits slowed integration testing. Go-live still planned for the 21st pending defect fixes.",
  },
  {
    weight: 2,
    priority: "privacy_first",
    instruction: "Classify these employee survey comments by theme and sentiment.",
    output: "- 'Workload has been heavy since the reorg.' · Workload · Negative\n- 'Love the new flexible hours.' · Flexibility · Positive\n- 'Not enough clarity on promotion criteria.' · Career growth · Negative\n- 'Team lunches helped morale.' · Culture · Positive",
    context: "Internal draft. 'Workload has been heavy since the reorg.' 'Love the new flexible hours.' 'Not enough clarity on promotion criteria.' 'Team lunches helped morale.'",
  },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T extends { weight: number }>(items: T[], rnd: () => number): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let x = rnd() * total;
  for (const i of items) {
    x -= i.weight;
    if (x <= 0) return i;
  }
  return items[items.length - 1];
}

/** Used only when Ollama has never been seen, so the demo workspace still shows local routing. */
function fallbackLocalModel(): ModelDescriptor {
  const d = localFamilyDefaults("generic", "8B");
  return {
    id: "ollama:demo-local-8b",
    providerId: "ollama",
    providerModelId: "demo-local-8b",
    displayName: "Local model (demo)",
    shortName: "Local model (demo)",
    family: "generic",
    tier: "local",
    location: "local",
    local: true,
    enabled: true,
    relativeCost: 0,
    capabilities: d.capabilities,
    capabilityBasis: "Placeholder for demo data when no Ollama models were discovered.",
    contextWindowTokens: 32768,
    maxContextTokens: 32768,
    maxOutputTokens: 4096,
    pricing: null,
    latency: { ...d.latency, source: "configured", samples: 0 },
    privacyEligibility: "restricted",
    externalDataTransfer: false,
    dataLocation: "This device · Ollama",
  };
}

export interface SeedDeps {
  executions: ExecutionRepository;
  approvals: ApprovalService;
  policy: GovernancePolicy;
  models: ModelDescriptor[];
  now?: Date;
  days?: number;
}

export function seedDemoWorkload(deps: SeedDeps): number {
  const rnd = mulberry32(20261023);
  const now = deps.now ?? new Date();
  const days = deps.days ?? 7;
  let models = deps.models.filter((m) => m.enabled);
  if (!models.some((m) => m.local)) models = [fallbackLocalModel(), ...models];
  const baseline = models.find((m) => m.id === BASELINE_MODEL_ID);
  let created = 0;

  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const count = Math.round((weekend ? 6 : 22) + rnd() * (weekend ? 4 : 9));

    for (let i = 0; i < count; i++) {
      const at = new Date(day);
      at.setHours(8, 30, 0, 0);
      at.setMinutes(at.getMinutes() + Math.floor(rnd() * 600));
      if (at > now) continue;

      const t = pick(DEMO_TEMPLATES, rnd);
      const task = { instruction: t.instruction, context: t.context, declaredClassification: t.declared };
      const profile = classifyTask(task);
      const loaded = models.filter((m) => m.local)[Math.floor(rnd() * 2)]?.id;
      // A short overnight Ollama outage two days ago, and an occasional cloud incident.
      const ollamaDown = d === 2 && at.getHours() < 10;
      const cloudIncident = rnd() < 0.05;
      const lowBudget = rnd() < 0.05;

      const availability: Record<string, ModelAvailability> = {};
      for (const m of models) {
        availability[m.id] = m.local
          ? ollamaDown
            ? { available: false, backend: "real", reason: "Ollama offline" }
            : { available: true, backend: "real", warm: m.id === loaded, reason: "Ollama online" }
          : { available: true, backend: "simulated", reason: "DEMO: served by MockProvider (no API call)" };
      }

      const decision = route({
        profile,
        models,
        availability,
        policy: deps.policy,
        priorityMode: t.priority,
        budget: {
          sessionBudgetUsd: 2,
          sessionActualUsd: 0,
          sessionSimulatedUsd: lowBudget ? 2 : rnd() * 0.4,
          lifetimeBudgetUsd: 10,
          lifetimeActualUsd: 0,
        },
        baselineModel: baseline,
      });

      const start = at.getTime();
      const events: TraceEvent[] = [];
      const ev = (offset: number, stage: TraceEvent["stage"], level: TraceEvent["level"], message: string, detail?: string) =>
        events.push({ at: new Date(start + offset).toISOString(), offsetMs: offset, stage, level, message, detail, simulated: true });
      ev(0, "request", "info", "Request received", "seeded demo workload · simulated execution");
      ev(4, "classify", "info", `Sensitivity: ${profile.classification}`, profile.classificationReason);
      ev(9, "routing", "info", `${decision.summary.considered} models considered`, `${decision.summary.eligible} permitted · ${decision.summary.blockedByPolicy} blocked by policy`);

      const prompt = buildPrompt(task);
      // Deterministic per (day, slot) so every server instance seeds identical ids and links resolve anywhere.
      const id = `exe_seed_${localDayKey(at).replace(/-/g, "")}_${String(i).padStart(2, "0")}${Math.floor(rnd() * 1e6).toString(36)}`;
      const createdAt = at.toISOString();
      const selected = decision.candidates.find((c) => c.modelId === decision.selectedModelId);

      const rec: ExecutionRecord = {
        id,
        createdAt,
        source: "seed",
        scenarioId: null,
        sessionId: "seed",
        status: "blocked",
        mode: null,
        location: null,
        taskType: profile.taskType,
        complexity: profile.complexity,
        classification: profile.classification,
        businessRisk: profile.businessRisk,
        priorityMode: t.priority,
        selectedModelId: decision.selectedModelId,
        executedModelId: null,
        executedProvider: null,
        fallbackUsed: false,
        budgetGuard: Boolean(decision.budgetGuard?.triggered),
        policyBlocks: decision.summary.blockedByPolicy,
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        tokenSource: null,
        externalCostUsd: 0,
        simulatedCostUsd: 0,
        estimatedCostUsd: selected?.cost.costUsd ?? 0,
        baselineCostUsd: 0,
        latencyMs: null,
        latencySource: null,
        outputTps: null,
        prefillTps: null,
        loadMs: null,
        evalScore: null,
        reviewRequired: false,
        reviewStatus: "not_required",
        title: shortTitle(redact(t.instruction)),
        inputPreview: preview(prompt, 280),
        inputSha256: createHash("sha256").update(`${SYSTEM_PROMPT}${prompt}${id}`).digest("hex"),
        outputText: null,
        error: null,
        decision,
        evaluation: null,
        review: null,
        attempts: [],
        trace: events,
      };

      if (!selected) {
        ev(12, "complete", "block", decision.block?.message ?? "Blocked");
        deps.executions.insert(rec);
        created++;
        continue;
      }

      // Cloud incident: the primary cloud model fails and the next local model in the chain serves the request.
      let served = selected;
      let fallbackUsed = false;
      if (cloudIncident && selected.location === "cloud") {
        const localFallback = decision.fallbackChain.map((fid) => decision.candidates.find((c) => c.modelId === fid)).find((c) => c?.location === "local");
        if (localFallback) {
          ev(800, "execution", "error", `${selected.shortName} failed: provider returned 503`, "simulated incident");
          ev(810, "fallback", "warn", `Fallback → ${localFallback.shortName} (local)`);
          served = localFallback;
          fallbackUsed = true;
        }
      }

      const servedModel = models.find((m) => m.id === served.modelId)!;
      // Replay a recorded real output for this exact prompt and model when one exists; otherwise the text is
      // illustrative and is not evaluated (scoring placeholder text would produce meaningless numbers).
      const recorded = servedModel.local ? findRecordedOutput(prompt, servedModel.providerModelId) : null;
      const output = recorded?.text ?? t.output;
      const evaluation = recorded ? evaluateOutput({ instruction: task.instruction, context: task.context, output, profile, stopReason: "end" }) : null;
      const review = reviewRequirement({
        profile,
        policy: deps.policy,
        evaluation,
        qualityThresholdMet: decision.qualityThresholdMet,
        fallbackUsed,
        cloudPermissionUsed: false,
      });
      const jitter = 0.8 + rnd() * 0.5;
      const latencyMs = Math.round(served.latency.totalMs * jitter);
      const simulatedCost = served.cost.costUsd;
      ev(latencyMs, "execution", "success", `Simulated response from ${served.shortName}`);
      ev(
        latencyMs + 6,
        "evaluation",
        "info",
        evaluation ? `Evaluation completed: ${evaluation.score}/100` : "Evaluation skipped",
        evaluation ? `recorded ${recorded?.modelName} output for this prompt` : "illustrative text, not evaluated",
      );
      if (recorded) ev(latencyMs + 2, "execution", "info", "Recorded local output replayed", `${recorded.modelName} · ${recorded.machine}`);

      const ageHours = (now.getTime() - at.getTime()) / 3_600_000;
      const reviewStatus = !review.required ? "not_required" : ageHours > 20 ? (rnd() < 0.88 ? "approved" : "rejected") : "pending";

      deps.executions.insert({
        ...rec,
        status: "completed",
        mode: "demo",
        location: servedModel.location,
        executedModelId: servedModel.id,
        executedProvider: servedModel.providerId,
        fallbackUsed,
        inputTokens: served.cost.inputTokens,
        outputTokens: served.cost.outputTokens,
        reasoningTokens: served.cost.reasoningTokens,
        tokenSource: "estimated",
        simulatedCostUsd: simulatedCost,
        baselineCostUsd: baseline ? apiCost(baseline.pricing, served.cost.inputTokens, served.cost.outputTokens) : 0,
        latencyMs,
        latencySource: "estimated",
        evalScore: evaluation?.score ?? null,
        reviewRequired: review.required,
        reviewStatus,
        outputText: output,
        evaluation,
        review,
        attempts: [],
        trace: events,
      });
      if (review.required) {
        const a = deps.approvals.create(id, review.reasons, createdAt, reviewStatus === "pending" ? "pending" : "pending");
        if (reviewStatus !== "pending") {
          deps.approvals.decide(a.id, reviewStatus as "approved" | "rejected", "Demo reviewer", reviewStatus === "approved" ? "Looks good." : "Tone needs work; rerun with edits.", new Date(at.getTime() + 3_600_000));
        }
      }
      created++;
    }
  }
  return created;
}
