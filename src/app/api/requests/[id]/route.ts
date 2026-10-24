import { connection } from "next/server";
import { ready } from "@/server/container";
import { safely } from "@/server/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  return safely(async () => {
    const { id } = await ctx.params;
    const c = await ready();
    const record = c.executions.get(id);
    if (!record) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ record, approval: c.approvals.forExecution(id) });
  });
}
