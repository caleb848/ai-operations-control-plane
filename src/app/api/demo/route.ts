import { ready } from "@/server/container";
import { forbidden, readJson, readOnlyDeployment, safely, sameOrigin } from "@/server/http";
import { seedDemoWorkload } from "@/services/seed/demo-workload";

/** Clears or regenerates the seeded demo workload. Real executions are never touched. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  return safely(async () => {
    const body = (await readJson(req)) as { action?: string };
    const c = await ready();
    if (!c.config.deployment.demoDataReset) return readOnlyDeployment();
    if (body.action === "clear") return Response.json({ removed: c.executions.deleteSeed() });
    if (body.action === "reseed") {
      const removed = c.executions.deleteSeed();
      const snap = await c.registry.snapshot();
      const created = seedDemoWorkload({ executions: c.executions, approvals: c.approvals, policy: c.settings.policy(), models: snap.models });
      return Response.json({ removed, created });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  });
}
