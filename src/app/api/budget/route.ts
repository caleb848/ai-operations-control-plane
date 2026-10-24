import { connection } from "next/server";
import { remainingBudget } from "@/core/budget/budget";
import { ready } from "@/server/container";
import { forbidden, readJson, readOnlyDeployment, safely, sameOrigin } from "@/server/http";

export async function GET() {
  await connection();
  return safely(async () => {
    const c = await ready();
    const b = c.ledger.snapshot();
    return Response.json({ budget: { ...b, ...remainingBudget(b) }, ledger: c.ledger.entries(100), cache: c.cache.stats() });
  });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  return safely(async () => {
    const body = (await readJson(req)) as { action?: string };
    if (body.action !== "reset_session") return Response.json({ error: "Unknown action" }, { status: 400 });
    const c = await ready();
    if (!c.config.deployment.configurationEditable) return readOnlyDeployment();
    c.ledger.startSession();
    const b = c.ledger.snapshot();
    return Response.json({ budget: { ...b, ...remainingBudget(b) } });
  });
}
