import { ready } from "@/server/container";
import { executionUnavailable, forbidden, rateLimit, readJson, safely, sameOrigin } from "@/server/http";
import { badRequest, taskRequestSchema } from "@/server/schemas";
import { toExecuteRequest } from "@/server/views";
import { DeploymentRestrictionError } from "@/services/execution/executor";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  const limited = rateLimit(req, "execute", 20);
  if (limited) return limited;
  return safely(async () => {
    const parsed = taskRequestSchema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest(parsed.error);
    const c = await ready();
    // Portfolio deployments reject any request for paid execution outright; nothing falls through to a provider.
    if (!c.config.deployment.liveCloudInference && (parsed.data.allowLive || parsed.data.maxLiveCostUsd !== undefined)) return executionUnavailable();
    try {
      const record = await c.executor.execute(toExecuteRequest(parsed.data));
      return Response.json({ record, budget: c.executor.budgetView() });
    } catch (err) {
      if (err instanceof DeploymentRestrictionError) return executionUnavailable();
      throw err;
    }
  });
}
