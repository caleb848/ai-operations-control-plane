import { ready } from "@/server/container";
import { forbidden, readJson, readOnlyDeployment, safely, sameOrigin } from "@/server/http";
import { badRequest, modelOverrideSchema } from "@/server/schemas";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return forbidden();
  return safely(async () => {
    if (!(await ready()).config.deployment.configurationEditable) return readOnlyDeployment();
    const parsed = modelOverrideSchema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest(parsed.error);
    const id = decodeURIComponent((await ctx.params).id);
    const c = await ready();
    const snap = await c.registry.snapshot();
    if (!snap.models.some((m) => m.id === id)) return Response.json({ error: "Unknown model" }, { status: 404 });
    c.settings.saveModelOverride(id, parsed.data);
    return Response.json({ ok: true });
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return forbidden();
  return safely(async () => {
    const c = await ready();
    if (!c.config.deployment.configurationEditable) return readOnlyDeployment();
    const id = decodeURIComponent((await ctx.params).id);
    c.settings.resetModelOverride(id);
    return Response.json({ ok: true });
  });
}
