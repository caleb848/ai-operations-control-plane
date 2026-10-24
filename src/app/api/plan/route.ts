import { ready } from "@/server/container";
import { forbidden, rateLimit, readJson, safely, sameOrigin } from "@/server/http";
import { badRequest, taskRequestSchema } from "@/server/schemas";
import { toExecuteRequest } from "@/server/views";

/** Dry run: classification, governance, routing and budget. No model is called and nothing is stored. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const limited = rateLimit(req, "plan", 120);
  if (limited) return limited;
  return safely(async () => {
    const parsed = taskRequestSchema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest(parsed.error);
    const c = await ready();
    const plan = await c.executor.plan(toExecuteRequest(parsed.data));
    return Response.json({
      decision: plan.decision,
      trace: plan.trace.events,
      ollama: plan.snapshot.ollama,
      cloudLive: plan.snapshot.cloudLive,
      budget: plan.budget,
    });
  });
}
