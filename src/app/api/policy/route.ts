import { connection } from "next/server";
import { ready } from "@/server/container";
import { forbidden, readJson, readOnlyDeployment, safely, sameOrigin } from "@/server/http";
import { badRequest, policySchema } from "@/server/schemas";
import type { GovernancePolicy } from "@/core/types";

export async function GET() {
  await connection();
  return safely(async () => Response.json({ policy: (await ready()).settings.policy() }));
}

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  return safely(async () => {
    if (!(await ready()).config.deployment.configurationEditable) return readOnlyDeployment();
    const parsed = policySchema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest(parsed.error);
    const c = await ready();
    const errors = c.settings.savePolicy(parsed.data as GovernancePolicy);
    if (errors.length) return Response.json({ error: "Policy rejected", issues: errors }, { status: 422 });
    return Response.json({ policy: c.settings.policy() });
  });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return forbidden();
  return safely(async () => {
    const c = await ready();
    if (!c.config.deployment.configurationEditable) return readOnlyDeployment();
    c.settings.resetPolicy();
    return Response.json({ policy: c.settings.policy() });
  });
}
