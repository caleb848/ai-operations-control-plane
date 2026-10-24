import type { ModelTier, TaskType } from "@/core/types";
import type { AIRequest, AIResponse } from "@/providers/types";
import { findRecordedOutput } from "./recorded";

/**
 * Canned text for MockProvider. Used only in DEMO mode, and always rendered
 * under a "Simulated output" banner. Never presented as model output.
 */

type TierOutputs = Partial<Record<ModelTier, string>>;

const SCENARIO_OUTPUTS: Record<string, TierOutputs> = {
  "public-summary": {
    economical: `- Lumen Transit's rider app now sends real-time arrival alerts for all 42 bus routes, notifying riders when their bus is 5, 10 or 15 minutes away using live GPS data.
- The update adds service-change notices for detours and cancellations, plus an accessibility setting that announces arrivals through the phone's screen reader.
- The app is free on iOS and Android; service-change notices reach all routes by next month, and the two light-rail lines get alerts in the spring.`,
    general: `- **Real-time arrival alerts are live on all 42 bus routes.** Riders pick a stop and get notified when the bus is 5, 10 or 15 minutes out, based on GPS data refreshed every 20 seconds.
- **Fewer surprises and better accessibility.** New service-change notices flag detours and cancellations before riders leave home, and arrivals can be announced through the phone's screen reader.
- **Free and expanding.** The app is free on iOS and Android; service-change notices cover every route by the end of next month, and light-rail alerts follow in the spring.`,
    premium: `- **Know when the bus will actually arrive.** Lumen Transit's free rider app now sends real-time alerts on all 42 bus routes when a bus is 5, 10 or 15 minutes away, using live GPS updated every 20 seconds.
- **Plan around disruptions.** Service-change notices warn riders about detours and cancellations before they leave, and a new setting reads arrivals aloud through the phone's screen reader.
- **What's next.** Notices reach every route by the end of next month, and the agency's two light-rail lines get arrival alerts in the spring.`,
  },
  "strategic-positioning": {
    economical: `Recommendation: Position B, "Live in five weeks, priced to stay."

The interviews show mid-market buyers prioritize time to value (19 of 24) and predictable pricing (16 of 24) over analytics depth (6 of 24). Our 5-week onboarding beats Vantage's 14 weeks, and no competitor offers fixed-price implementation. Position A would compete on Vantage's strength and looks like the "lite enterprise" tier buyers distrust.

Key risks: losing analytics-driven deals to Vantage, and margin pressure from fixed-price implementation.

Test it with landing-page experiments for both messages and a fixed-price pilot with five prospects.`,
    general: `**Recommendation: lead with Position B — "Live in five weeks, priced to stay."**

**Why B fits the evidence**
- *It matches what buyers rank first.* Time to value (19 of 24) and predictable pricing (16 of 24) were the top purchase drivers; analytics was decisive for only 6 of 24.
- *It plays to a proven advantage.* Our median onboarding is 5 weeks against Vantage's 14, and wins in the last three quarters cite onboarding speed and support (4.6/5).
- *It occupies open ground.* No competitor offers fixed-price implementation, and fixed-scope deals closed 23 days faster.
- *It fixes a pricing problem we created.* A 27% average discount off enterprise list prices compressed margins and blurred our real price; transparent mid-market pricing addresses both.

**Why not A**
"Enterprise power, mid-market price" competes head-on with Vantage's strongest dimension while our analytics still trails, and it resembles the stripped-down enterprise tier buyers told us they distrust. Orbitly is already attempting that story.

**Trade-offs to accept**
- We will keep losing some analytics-led deals (18 losses to Vantage) until benchmark dashboards ship; frame analytics as "growing with you," not as the lead.
- Fixed-price implementation shifts delivery risk to us; scope it tightly and price for internal-capacity failures, which 11 buyers named as the real cause of failed rollouts.

**Key risks**
1. Northstack responds on price. Mitigation: compete on total cost of ownership and onboarding, not list price.
2. The five-week promise slips at scale. Mitigation: publish the onboarding plan and staff a dedicated implementation pod.
3. Analytics gap widens. Mitigation: keep the benchmark-dashboard roadmap date visible in sales materials.

**How to test before launch**
- Message test: paired landing pages and outbound sequences for A and B to the same mid-market segment; compare reply and demo-booking rates over four weeks.
- Offer test: a fixed-price implementation pilot with 5–8 open opportunities; measure cycle time against the 23-day benchmark and gross margin per deal.
- Win/loss tagging: add a "positioning heard" field to the next quarter of deal reviews.`,
    premium: `**Recommendation: adopt Position B — "Live in five weeks, priced to stay" — and treat analytics as a supporting proof point rather than the headline.**

**1. What the evidence says**
| Signal | Source | Implication |
|---|---|---|
| Time to value is the #1 driver (19/24) | Interviews | Lead with speed |
| Predictable pricing is #2 (16/24); 27% average discount confuses buyers | Interviews, win/loss | Publish simple pricing |
| Analytics decisive for 6/24, expected within two years by 15/24 | Interviews | Analytics is a retention story, not an acquisition story |
| 5-week vs 14-week onboarding | Competitive | Our clearest, defensible gap |
| Fixed-scope deals close 23 days faster; no competitor offers it | Win/loss, competitive | Open position |

**2. Why A underperforms**
Position A asks buyers to value the dimension where Vantage leads and we trail, while echoing the "lite enterprise edition" pattern buyers explicitly distrust — and Orbitly has just launched exactly that. It also preserves the discount-led pricing that compresses margin.

**3. Trade-offs we are choosing**
- *Fewer analytics-led wins in the short term.* Roughly a quarter of our losses (18 of 39) went to Vantage on analytics. We accept that until benchmark dashboards ship, and use them as a 12-month "grows with you" promise.
- *Delivery risk moves to us.* Fixed-price implementation is only credible if it is scoped and staffed; the interviews say internal capacity, not software, sank 11 prior rollouts, so the offer should include customer-side enablement.
- *A price-led competitor may undercut us.* Northstack wins on price; we answer with total cost of ownership and support quality rather than matching list price.

**4. Risks and mitigations**
1. Onboarding promise slips at volume → dedicated implementation pod, published onboarding plan, a service credit if go-live passes week six.
2. Margin erosion from fixed price → standard scopes with change-order rules; track margin per deal monthly.
3. Positioning reads as "basic" → pair speed with outcomes (customer go-live stories) instead of feature lists.

**5. How to test before launch (6 weeks)**
- *Message A/B:* matched outbound sequences and landing pages to one mid-market segment; primary metric demo-booking rate, secondary reply sentiment.
- *Offer pilot:* fixed-price implementation for 5–8 live opportunities; measure cycle time vs the 23-day benchmark and gross margin.
- *Pricing comprehension test:* five buyer interviews with the transparent price sheet versus the current discount model.
- *Decision rule:* proceed with B if demo bookings improve ≥20% and pilot margin stays within 5 points of plan.`,
  },
  "provider-failure": {
    economical: `**Can I share a calendar with people outside my organization?**
Yes. Open the calendar's sharing settings and create a view-only link. Anyone with the link can see events but can't edit them.

**How do recurring tasks work?**
When you create or edit a task, choose a repeat schedule: daily, weekly, monthly or a custom pattern. The next occurrence is created automatically when you complete the current one.

**Can I use the mobile app without a connection?**
Yes. Offline mode keeps your last 30 days of tasks on your device. Any changes you make offline sync when you reconnect.

**How do I export a project?**
Open the project menu and choose Export, then pick CSV or PDF.

**Why was I getting duplicate notifications?**
When two people edited the same task at once, notifications could be sent twice. Version 3.8 fixes this.`,
  },
  "budget-exhausted": {
    premium: `**Progress**
- Same-day shipping back to 94% (from 88%) after the second packing shift started.
- Returns backlog down from 1,900 to 640 units.
- Two of four open picker roles filled.

**Blockers**
- Aisle 7 closed until Thursday (damaged racking); affected picks take ~6 extra minutes.
- Label-printing service rolled back after two failures; vendor fix due next Wednesday.
- Overtime at 9% of hours vs 6% target.

**Decisions needed**
1. Approve $14K for the racking repair contractor.
2. Keep or end the second packing shift through November.
3. Confirm the go/no-go date for the label service.`,
  },
  "confidential-client-brief": {
    general: `**Objectives:** restore new-patient bookings to Q1 levels by end of Q2, fix the mobile booking flow before the three Q3 openings, and launch a patient referral program.

**Key risks:** incomplete booking data from two clinics, no measurable results yet ahead of the March 14 steering review, unapproved patient testimonials, and renewal revenue that depends on the Q3 openings.

**Next steps:** (1) ship quick fixes to the mobile booking flow and report the abandonment rate weekly; (2) agree a clean baseline for the two migrating clinics; (3) bring a referral-program pilot to the steering review.`,
  },
};

const TASK_GENERIC: Record<TaskType, string> = {
  summarization: `- The source describes the current situation and the main changes since the last update.
- Two items need attention: an open dependency and a timeline that has slipped.
- A decision is requested before the next review.`,
  extraction: `{"items": [{"name": "Primary contact", "value": "[redacted]"}, {"name": "Due date", "value": "2026-11-14"}, {"name": "Amount", "value": "14,000"}]}`,
  classification: `Category: Operations · Priority: Medium · Sentiment: Neutral`,
  document_analysis: `**Summary:** The document sets out objectives, current performance and open risks.\n\n**Risks:** incomplete data and an approaching review date.\n\n**Recommended next steps:** confirm the baseline, address the highest-impact issue first, and agree success measures with the owner.`,
  drafting: `Thanks for reaching out. Here's a short update on where things stand and what happens next. We expect to have the remaining items resolved by the end of the week and will follow up with details.`,
  strategic_reasoning: `**Recommendation:** pursue the option that matches the strongest customer evidence and the organization's existing advantage.\n\n**Trade-offs:** slower progress on the secondary goal in exchange for a clearer position.\n\n**Risks and tests:** validate with a small pilot before committing budget.`,
  coding: "```ts\nexport function parseDuration(input: string): number {\n  const m = /^(?:(\\d+)h)?(?:(\\d+)m)?$/.exec(input.trim());\n  if (!m || (!m[1] && !m[2])) throw new Error(`Invalid duration: ${input}`);\n  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60;\n}\n```",
  general: `Here is a concise answer to the request, structured around the main question and the supporting points from the material provided.`,
};

export function simulatedOutput(opts: {
  scenarioId?: string;
  tier?: ModelTier;
  taskType?: string;
  modelName?: string;
  /** Seed data uses task-shaped placeholders; interactive demo runs get an explicit notice instead. */
  purpose: "scenario" | "seed" | "interactive";
}): string {
  const byScenario = opts.scenarioId && opts.tier ? SCENARIO_OUTPUTS[opts.scenarioId]?.[opts.tier] : undefined;
  if (byScenario) return byScenario;
  if (opts.purpose === "seed") return TASK_GENERIC[(opts.taskType as TaskType) ?? "general"] ?? TASK_GENERIC.general;
  return `Simulated response: ${opts.modelName ?? "the cloud model"} was not called.

This workspace is in DEMO mode, so cloud-routed requests are answered by MockProvider. The classification, governance checks, routing scores, cost estimate and trace for this request are real; only this text is simulated.

For a real answer, run the task on a local model (on-device, no external API cost) or enable live mode (AI_LIVE_MODE=true, DEFAULT_PROVIDER=live, ANTHROPIC_API_KEY).`;
}

/**
 * Output for MockProvider. Local models replay a recorded real output when one
 * exists for this exact prompt and model; otherwise every simulated answer says
 * plainly that no model was called.
 */
export function resolveSimulatedOutput(
  req: AIRequest,
  info: { tier?: ModelTier; modelName?: string; local: boolean },
): { text: string; recorded?: AIResponse["recorded"] } {
  if (info.local) {
    const rec = findRecordedOutput(req.prompt, req.model);
    if (rec) {
      return { text: rec.text, recorded: { model: rec.model, modelName: rec.modelName, recordedAt: rec.recordedAt, latencyMs: rec.latencyMs, machine: rec.machine } };
    }
    return {
      text: `Simulated response: ${info.modelName ?? req.model} was not called.

This public portfolio demo cannot reach any local AI runtime, so local inference is simulated. The classification, governance checks, routing scores and trace for this request are real. On a local installation this request runs through Ollama on the developer's machine, at $0.00 external API cost.`,
    };
  }
  return {
    text: simulatedOutput({
      purpose: req.simulation?.scenarioId ? "scenario" : "interactive",
      scenarioId: req.simulation?.scenarioId,
      tier: info.tier,
      taskType: req.simulation?.taskType,
      modelName: info.modelName ?? req.model,
    }),
  };
}
