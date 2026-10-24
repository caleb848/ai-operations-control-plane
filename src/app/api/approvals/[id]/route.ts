import { ready } from "@/server/container";
import { forbidden, rateLimit, readJson, safely, sameOrigin } from "@/server/http";
import { approvalDecisionSchema, badRequest } from "@/server/schemas";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return forbidden();
  const limited = rateLimit(req, "approvals", 30);
  if (limited) return limited;
  return safely(async () => {
    const parsed = approvalDecisionSchema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest(parsed.error);
    const { id } = await ctx.params;
    const c = await ready();
    if (!c.approvals.get(id)) return Response.json({ error: "Not found" }, { status: 404 });
    try {
      // Public demo: visitors share this data, so no visitor-written text is stored for others to see.
      const publicDemo = c.config.deployment.publicDeployment;
      const approval = publicDemo
        ? c.approvals.decide(id, parsed.data.decision, "Demo visitor", "")
        : c.approvals.decide(id, parsed.data.decision, parsed.data.reviewer || "Local operator", parsed.data.note);
      return Response.json({ approval });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Could not record decision" }, { status: 409 });
    }
  });
}
