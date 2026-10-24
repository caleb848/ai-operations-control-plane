import type { CloudPermission, DataClassification, PriorityMode, SimulationOptions } from "@/core/types";

/**
 * Demo scenarios. All organizations, people, emails (.example domain) and
 * phone numbers (555-01xx) are fictional.
 */

export interface Scenario {
  id: string;
  number: number;
  title: string;
  summary: string;
  expected: string;
  instruction: string;
  context: string;
  declaredClassification?: DataClassification;
  priorityMode: PriorityMode;
  simulation?: SimulationOptions;
  permission?: CloudPermission;
  /** What this scenario demonstrates, shown beside the decision. */
  lesson: string;
}

const CLIENT_BRIEF = `CONFIDENTIAL — CLIENT BRIEF (synthetic demo document)
Client: Corvane Dental Group · Account no. CDG-2291 · Retainer: $18,500/month
Prepared by Strategy & Accounts. Do not forward outside the account team.

Contacts
- Dana Whitfield, VP Marketing · dana.whitfield@corvane-dental.example · (416) 555-0142
- Marcus Ilori, Director of Operations · m.ilori@corvane-dental.example

Situation
Corvane operates 14 clinics across the Greater Toronto Area and plans to open three more in Q3. New-patient bookings fell 11% quarter over quarter, concentrated in the four suburban clinics where two competitors opened in the last six months. Online booking abandonment is 38% on mobile versus 19% on desktop.

Objectives for this engagement
1. Restore new-patient bookings to Q1 levels by the end of Q2.
2. Fix the mobile booking flow before the Q3 openings.
3. Launch a referral program for existing patients.

Internal strategy notes (not shared with the client)
- Our pricing strategy for the renewal assumes the engagement expands to the three new clinics; if the openings slip, roughly $55K of planned revenue is at risk.
- Dana is supportive. Marcus is skeptical of paid social after a poor result with a previous agency.
- The client's legal team has not approved the use of patient testimonials.

Open risks
- Booking data from two clinics is incomplete because of a scheduling-system migration.
- The steering review is on March 14 and we have not yet shown measurable results.`;

const PUBLIC_ANNOUNCEMENT = `FOR IMMEDIATE RELEASE

Lumen Transit adds real-time arrival alerts to its rider app

Lumen Transit today released real-time arrival alerts for all 42 bus routes in its network. Riders can now choose a stop and receive a notification when their bus is five, ten or fifteen minutes away. Alerts use live GPS data from every vehicle and update every 20 seconds.

The update also adds service-change notices, so riders learn about detours and cancellations before they leave home, and a new accessibility setting that announces arrivals through the phone's screen reader.

"Riders told us the hardest part of taking the bus is not knowing when it will actually arrive," said the agency's director of customer experience. "Arrival alerts remove that guesswork."

The rider app is free on iOS and Android. Arrival alerts are available today; service-change notices will roll out to all routes by the end of next month. Lumen Transit carried 18 million trips last year and plans to add alerts to its two light-rail lines in the spring.`;

const RESEARCH_DOCS = `Synthetic demo documents.

## Document 1 — Customer interview synthesis (n = 24 mid-market buyers)
Buyers at 200–1,000 employee companies describe current tools as "built for enterprises, priced for enterprises." The three most cited purchase drivers were time to value (19 of 24), predictable pricing (16 of 24) and responsive support (14 of 24). Only 6 of 24 mentioned advanced analytics as a deciding factor, although 15 said they expect to need it within two years. Buyers distrust "lite" editions of enterprise products; several said a stripped-down tier signals they will be upsold later. Implementation help matters more than features: 11 buyers said their last rollout failed because of internal capacity, not the software.

## Document 2 — Competitive landscape
Three incumbents hold most of the mid-market. Vantage leads on analytics depth but has the slowest onboarding (median 14 weeks) and per-seat pricing that rises sharply above 300 users. Northstack competes on price with a self-serve model and minimal support, and its churn is rumored to be high. Orbitly recently launched a mid-market edition of its enterprise product; early reviews praise the features but criticize complexity. No competitor offers fixed-price implementation. Our current product onboards in a median of 5 weeks and our support satisfaction is 4.6/5, but our analytics module trails Vantage.

## Document 3 — Win/loss analysis, last 3 quarters (internal)
We won 31 of 70 mid-market opportunities (44%). Wins cited onboarding speed and support quality. Losses to Vantage (18) cited analytics depth; losses to Northstack (12) cited price. Deals with a fixed implementation scope closed 23 days faster on average. Our pricing strategy currently mirrors enterprise list prices with discounting; average discount in mid-market deals was 27%, which compressed margins and confused buyers about our real price. The product roadmap adds benchmark dashboards next quarter, which would narrow but not close the analytics gap.

Two candidate positions are under discussion:
A. "Enterprise power, mid-market price" — lead with analytics and a discounted enterprise feature set.
B. "Live in five weeks, priced to stay" — lead with time to value, fixed-price implementation and transparent pricing.`;

const OPS_NOTES = `Internal only — Weekly operations notes, week 41

Fulfilment: Same-day shipping rate recovered to 94% (from 88%) after the second packing shift started Monday. Returns processing backlog fell from 1,900 to 640 units.

Warehouse: The racking inspection found two damaged uprights in aisle 7; the aisle is closed until repairs on Thursday. Picking for those SKUs moved to the overflow area, adding about 6 minutes per order.

Systems: The new label-printing service failed twice on Tuesday and was rolled back. The vendor has a fix scheduled for next Wednesday; until then we are on the old service.

People: Two of the four open picker roles are filled. Overtime is at 9% of hours, above the 6% target.

Decisions needed: (1) approve $14K for the racking repair contractor; (2) choose whether to keep the second packing shift through November; (3) confirm the go/no-go date for the label service.`;

const RELEASE_NOTES = `Version 3.8 release notes — public

- Shared calendars: teams can now share a calendar with people outside their organization using a view-only link.
- Recurring tasks: tasks can repeat daily, weekly, monthly or on a custom schedule.
- Offline mode: the mobile app keeps your last 30 days of tasks available without a connection and syncs changes when you reconnect.
- Export: projects can be exported to CSV or PDF from the project menu.
- Fixed: notifications no longer arrive twice when a task is edited by two people at the same time.`;

const HR_CASE = `RESTRICTED — HR CASE FILE · Case HR-2026-118 (synthetic demo document)
Employee: J. Okafor · Employee ID 40921 · SIN 046 454 286
Manager: R. Castellanos

Summary: The employee requested a phased return after medical leave. Their physician's note lists a diagnosis that limits lifting for eight weeks. The manager has proposed temporary reassignment to inventory control at the same pay grade. The employee has asked that details of the diagnosis not be shared with the team.

Open items: accommodation agreement to be signed; benefits provider to confirm the short-term disability end date; schedule a check-in after four weeks.`;

export const SCENARIOS: Scenario[] = [
  {
    id: "confidential-client-brief",
    number: 1,
    title: "Confidential client brief",
    summary: "Account-team readout from a brief containing client contacts, account details and internal strategy.",
    expected: "Local model selected · cloud blocked by policy · External API cost $0.00",
    instruction:
      "Review this client brief and prepare a readout for the account team: the client's objectives, the key risks, and three recommended next steps before the steering review. Keep it under 200 words and do not include personal contact details.",
    context: CLIENT_BRIEF,
    priorityMode: "balanced",
    lesson: "Confidential data never leaves the device. The local model clears the quality bar, so there is nothing to trade off.",
  },
  {
    id: "public-summary",
    number: 2,
    title: "Simple public summarization",
    summary: "Three-bullet newsletter summary of a public press release.",
    expected: "Local vs economical cloud · winner depends on the priority mode",
    instruction: "Summarize this public product announcement in three bullet points for our newsletter.",
    context: PUBLIC_ANNOUNCEMENT,
    declaredClassification: "public",
    priorityMode: "balanced",
    lesson: "Switch the priority mode: Lowest cost and Privacy first keep it local, Fastest and Balanced pick Haiku 5.5 because it costs fractions of a cent and finishes in seconds.",
  },
  {
    id: "strategic-positioning",
    number: 3,
    title: "Complex strategic reasoning",
    summary: "Brand positioning recommendation synthesized from three internal research documents.",
    expected: "Local considered but below the reasoning threshold · Sonnet selected over Opus",
    instruction:
      "Using the three research documents, develop a brand positioning recommendation for our entry into the mid-market segment. Synthesize the findings, weigh the trade-offs between the two candidate positions, and justify your recommendation with evidence from the documents. Include the key risks and how to test the positioning before launch.",
    context: RESEARCH_DOCS,
    declaredClassification: "internal",
    priorityMode: "balanced",
    lesson: "Free isn't enough. The task crosses the reasoning threshold that local models and Haiku don't meet, and Sonnet beats Opus on value.",
  },
  {
    id: "provider-failure",
    number: 4,
    title: "Cloud provider failure",
    summary: "Public help-center FAQ drafting while the primary cloud provider returns 503s.",
    expected: "Haiku selected → Anthropic outage (simulated) → fallback to local, recorded in the trace",
    instruction: "Draft five FAQ answers for our public help center from these release notes. Each answer should be two or three sentences.",
    context: RELEASE_NOTES,
    declaredClassification: "public",
    priorityMode: "balanced",
    simulation: { providerOutage: ["anthropic"] },
    lesson: "The fallback chain only contains models that already passed governance, so failover can't leak data across a policy boundary.",
  },
  {
    id: "budget-exhausted",
    number: 5,
    title: "Cloud budget exhausted",
    summary: "Executive status update with the team default of Best quality, but the session budget is nearly spent.",
    expected: "Opus selected → Budget Guard triggered → rerouted to a capable local model",
    instruction:
      "Summarize this week's operations notes into an executive status update: progress, blockers, and decisions needed. Use short bullet points.",
    context: OPS_NOTES,
    declaredClassification: "internal",
    priorityMode: "best_quality",
    simulation: { sessionSpendUsd: 1.995 },
    lesson: "The guard reserves the worst-case cost before calling the API. A local model that clears the bar is a better answer than a blocked request.",
  },
  {
    id: "restricted-local-offline",
    number: 6,
    title: "Restricted data, local AI offline",
    summary: "HR case file with health information and a government ID, while Ollama is unavailable.",
    expected: "Blocked · fail-closed · nothing sent to the cloud",
    instruction: "Summarize this HR case file for the people-operations lead, listing the open items.",
    context: HR_CASE,
    priorityMode: "balanced",
    simulation: { ollamaOffline: true },
    lesson: "When policy requires local execution and the local provider is down, the right answer is no answer.",
  },
];

/** True when the task is a built-in scenario's text, unedited. */
export function isBuiltInScenarioTask(task: { instruction: string; context?: string }): boolean {
  return SCENARIOS.some((s) => s.instruction === task.instruction.trim() && s.context === (task.context ?? ""));
}

export function getScenario(id: string | undefined | null): Scenario | undefined {
  return id ? SCENARIOS.find((s) => s.id === id) : undefined;
}
